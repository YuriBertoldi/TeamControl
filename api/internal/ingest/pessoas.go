package ingest

// Resolução de pessoa a partir do que o arquivo diz.
//
// É a peça que decide de quem é cada transcrição, e errar aqui é pior do que
// não importar: evidência pendurada na pessoa errada contamina a AVD de duas
// pessoas de uma vez.
//
// A normalização NÃO é reimplementada em Go. O banco já tem `normaliza_nome()`
// (unaccent + upper + colapso de espaço) e é ela que gerou
// `people.nome_normalizado`. Uma segunda implementação divergiria da primeira
// no primeiro caso de acento estranho, e seria justamente o caso que ninguém
// testa.

import (
	"database/sql"
	"fmt"
	"strings"
)

// Match é o resultado de uma tentativa de resolução.
type Match struct {
	PersonID int64
	Slug     string
	Como     string  // exata · alias · primeiro_ultimo · similaridade
	Escore   float64 // só preenchido em similaridade
}

// LimiarSimilaridade é o piso para aceitar um match por pg_trgm.
//
// 0,62 vem do caso mais apertado observado: um primeiro nome grafado sem
// a letra final contra o nome completo, do tipo "Fulan" contra
// "FULANO SOBRENOME DE TAL". Abaixo disso começam a aparecer
// colisões entre nomes de pessoas diferentes do mesmo time, e aí o custo do
// erro é alto demais para automatizar.
const LimiarSimilaridade = 0.62

// ResolverPessoa tenta casar um nome bruto com alguém do cadastro.
//
// A cascata é deliberada, da evidência mais forte para a mais frágil:
//
//  1. nome normalizado exato
//  2. alias já registrado (o que foi aprendido em cargas anteriores)
//  3. primeiro + último nome — pega "Fulano Sobrenome" contra o nome completo
//  4. similaridade trigram acima do limiar
//
// Devolve (nil, nil) quando nada bate: é caso de revisão manual, não de erro.
func ResolverPessoa(db *sql.DB, tenantID int64, nomeBruto string) (*Match, error) {
	nome := strings.TrimSpace(nomeBruto)
	if nome == "" {
		return nil, nil
	}

	var m Match

	// 1. exata
	err := db.QueryRow(`
		SELECT id, slug FROM people
		 WHERE tenant_id = $1 AND nome_normalizado = normaliza_nome($2)
		 LIMIT 1`, tenantID, nome).Scan(&m.PersonID, &m.Slug)
	if err == nil {
		m.Como = "exata"
		return &m, nil
	}
	if err != sql.ErrNoRows {
		return nil, fmt.Errorf("match exato de %q: %w", nome, err)
	}

	// 2. alias aprendido
	err = db.QueryRow(`
		SELECT p.id, p.slug FROM person_aliases a
		  JOIN people p ON p.id = a.person_id
		 WHERE a.tenant_id = $1 AND a.alias_norm = normaliza_nome($2)
		 LIMIT 1`, tenantID, nome).Scan(&m.PersonID, &m.Slug)
	if err == nil {
		m.Como = "alias"
		return &m, nil
	}
	if err != sql.ErrNoRows {
		return nil, fmt.Errorf("match por alias de %q: %w", nome, err)
	}

	// 3. primeiro + último nome.
	//
	// Artefatos e dossiês costumam usar "Fulano Sobrenome" onde o cadastro tem o
	// nome completo. Comparar as duas pontas resolve sem afrouxar o limiar de
	// similaridade, que é onde mora o risco de colisão.
	if partes := strings.Fields(nome); len(partes) >= 2 {
		primeiro, ultimo := partes[0], partes[len(partes)-1]
		err = db.QueryRow(`
			SELECT id, slug FROM people
			 WHERE tenant_id = $1
			   AND split_part(nome_normalizado, ' ', 1) = normaliza_nome($2)
			   AND nome_normalizado LIKE '%' || normaliza_nome($3)
			 LIMIT 1`, tenantID, primeiro, ultimo).Scan(&m.PersonID, &m.Slug)
		if err == nil {
			m.Como = "primeiro_ultimo"
			return &m, nil
		}
		if err != sql.ErrNoRows {
			return nil, fmt.Errorf("match primeiro+último de %q: %w", nome, err)
		}
	}

	// 4. só o primeiro nome, e apenas quando ele identifica UMA pessoa.
	//
	// Pasta e título de feedback são escritos à mão, no tratamento do dia a
	// dia: "Michell", não "Michell Ailton Riciere de Oliveira". Um token só
	// não chega ao limiar de similaridade contra um nome completo, então sem
	// este degrau o arquivo ia para revisão manual por um apelido que, na
	// prática, não é ambíguo nenhum.
	//
	// A trava é a contagem: dois "Rodrigo" no time derrubam o match e a
	// decisão volta a ser humana. O risco de pendurar feedback na pessoa
	// errada não vale o ganho de adivinhar.
	if len(strings.Fields(nome)) == 1 {
		var n int
		if err := db.QueryRow(`
			SELECT count(*) FROM people
			 WHERE tenant_id = $1
			   AND split_part(nome_normalizado, ' ', 1) = normaliza_nome($2)`,
			tenantID, nome).Scan(&n); err != nil {
			return nil, fmt.Errorf("contar primeiro nome %q: %w", nome, err)
		}
		if n == 1 {
			err = db.QueryRow(`
				SELECT id, slug FROM people
				 WHERE tenant_id = $1
				   AND split_part(nome_normalizado, ' ', 1) = normaliza_nome($2)`,
				tenantID, nome).Scan(&m.PersonID, &m.Slug)
			if err == nil {
				m.Como = "primeiro_nome"
				return &m, nil
			}
			if err != sql.ErrNoRows {
				return nil, fmt.Errorf("match por primeiro nome de %q: %w", nome, err)
			}
		}
	}

	// 5. similaridade. Só aceita match ÚNICO acima do limiar: se dois nomes
	// empatam, a decisão é humana.
	rows, err := db.Query(`
		SELECT id, slug, similarity(nome_normalizado, normaliza_nome($2)) s
		  FROM people
		 WHERE tenant_id = $1
		   AND similarity(nome_normalizado, normaliza_nome($2)) >= $3
		 ORDER BY s DESC
		 LIMIT 2`, tenantID, nome, LimiarSimilaridade)
	if err != nil {
		return nil, fmt.Errorf("match por similaridade de %q: %w", nome, err)
	}
	defer rows.Close()

	var candidatos []Match
	for rows.Next() {
		var c Match
		if err := rows.Scan(&c.PersonID, &c.Slug, &c.Escore); err != nil {
			return nil, err
		}
		c.Como = "similaridade"
		candidatos = append(candidatos, c)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(candidatos) == 1 {
		return &candidatos[0], nil
	}
	// Zero candidatos, ou dois — nos dois casos não dá para decidir sozinho.
	return nil, nil
}

// GravarAlias registra o nome bruto como apelido da pessoa.
//
// É o que faz a carga ficar mais barata a cada rodada: um nome truncado ou
// uma pasta escrita em CamelCase
// custam uma busca por similaridade na primeira vez e viram acerto exato da
// segunda em diante. Idempotente.
func GravarAlias(db *sql.DB, tenantID, personID int64, alias, origem string) error {
	alias = strings.TrimSpace(alias)
	if alias == "" {
		return nil
	}
	_, err := db.Exec(`
		INSERT INTO person_aliases (tenant_id, person_id, alias, alias_norm, origem)
		VALUES ($1, $2, $3, normaliza_nome($3), $4)
		ON CONFLICT DO NOTHING`, tenantID, personID, alias, origem)
	if err != nil {
		return fmt.Errorf("gravar alias %q: %w", alias, err)
	}
	return nil
}
