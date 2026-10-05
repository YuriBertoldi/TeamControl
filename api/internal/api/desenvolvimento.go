package api

// Skills, PDI e trilha QA → Dev.
//
// As quatro telas de desenvolvimento existiam e liam de tabela nenhuma. Este
// arquivo é o caminho que faltava entre elas e o banco.
//
// A decisão que atravessa tudo aqui: **avaliação de skill nunca é
// sobrescrita.** Cada lançamento é uma linha nova, e o estado atual é uma
// view. A evolução ao longo do tempo é o produto — "subiu de 2 para 3 em
// março, com esta evidência" é o que sustenta uma conversa de carreira, e
// guardar só o número de hoje descartaria exatamente isso.

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
)

/* ---------- skills ---------- */

// AvaliacaoSkill é uma leitura de nível, de uma origem.
type AvaliacaoSkill struct {
	Pessoa     string `json:"pessoa"` // slug
	Skill      string `json:"skill"`  // código
	SkillNome  string `json:"skillNome"`
	Nivel      int    `json:"nivel"`
	Interesse  *int   `json:"interesse,omitempty"`
	Origem     string `json:"origem"`
	Observacao string `json:"observacao,omitempty"`
	AvaliadoEm string `json:"avaliadoEm,omitempty"`
}

// listarSkills devolve o estado atual, uma linha por (pessoa, skill, origem).
func listarSkills(ctx context.Context, db *sql.DB, tenantID int64) ([]AvaliacaoSkill, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT p.slug, a.skill_codigo, a.skill_nome, a.nivel, a.interesse,
		       a.origem, COALESCE(a.observacao,''), a.avaliado_em::text
		  FROM person_skills_atual a
		  JOIN people p ON p.id = a.person_id
		 WHERE a.tenant_id = $1
		 ORDER BY p.slug, a.skill_codigo, a.origem`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("listar skills: %w", err)
	}
	defer rows.Close()

	out := []AvaliacaoSkill{}
	for rows.Next() {
		var a AvaliacaoSkill
		if err := rows.Scan(&a.Pessoa, &a.Skill, &a.SkillNome, &a.Nivel,
			&a.Interesse, &a.Origem, &a.Observacao, &a.AvaliadoEm); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// ResultadoLote conta o que entrou e o que não deu.
//
// Uma importação que grava 40 das 50 linhas e devolve "ok" é pior que uma que
// falha: as 10 ausentes só aparecem quando alguém procura por elas, meses
// depois. Por isso cada linha recusada volta com o motivo e o número da linha.
type ResultadoLote struct {
	Gravadas int      `json:"gravadas"`
	Recusas  []string `json:"recusas"`
}

// salvarSkills grava um lote de avaliações.
//
// Sempre INSERT, nunca UPDATE: ver o comentário de topo. Lançar hoje o mesmo
// nível de ontem cria uma linha nova, e isso é correto — significa "conferi e
// continua 3", que é informação diferente de "ninguém olhou desde março".
func salvarSkills(ctx context.Context, db *sql.DB, tenantID int64,
	lote []AvaliacaoSkill) (ResultadoLote, error) {

	var r ResultadoLote
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return r, err
	}
	defer tx.Rollback() //nolint:errcheck // commit explícito no fim

	for i, a := range lote {
		linha := i + 1
		if a.Nivel < 0 || a.Nivel > 4 {
			r.Recusas = append(r.Recusas,
				fmt.Sprintf("linha %d (%s/%s): nível %d fora da escala 0–4",
					linha, a.Pessoa, a.Skill, a.Nivel))
			continue
		}
		if a.Interesse != nil && (*a.Interesse < 0 || *a.Interesse > 3) {
			r.Recusas = append(r.Recusas,
				fmt.Sprintf("linha %d (%s/%s): interesse %d fora da escala 0–3",
					linha, a.Pessoa, a.Skill, *a.Interesse))
			continue
		}
		origem := strings.TrimSpace(a.Origem)
		if origem == "" {
			origem = "coordenador"
		}

		var personID int64
		err := tx.QueryRowContext(ctx,
			`SELECT id FROM people WHERE tenant_id = $1 AND slug = $2`,
			tenantID, a.Pessoa).Scan(&personID)
		if err == sql.ErrNoRows {
			r.Recusas = append(r.Recusas,
				fmt.Sprintf("linha %d: pessoa %q não existe no cadastro", linha, a.Pessoa))
			continue
		}
		if err != nil {
			return r, err
		}

		_, err = tx.ExecContext(ctx, `
			INSERT INTO person_skill_assessments
			  (tenant_id, person_id, skill_codigo, skill_nome, nivel, interesse,
			   origem, observacao, avaliado_em)
			VALUES ($1,$2,$3,$4,$5,$6,$7,NULLIF($8,''),
			        COALESCE(NULLIF($9,'')::date, CURRENT_DATE))`,
			tenantID, personID, a.Skill, a.SkillNome, a.Nivel, a.Interesse,
			origem, a.Observacao, a.AvaliadoEm)
		if err != nil {
			r.Recusas = append(r.Recusas, fmt.Sprintf("linha %d: %v", linha, err))
			continue
		}
		r.Gravadas++
	}
	return r, tx.Commit()
}

/* ---------- PDI ---------- */

type MarcoPDI struct {
	Ordem       int    `json:"ordem"`
	Descricao   string `json:"descricao"`
	Prazo       string `json:"prazo,omitempty"`
	ConcluidoEm string `json:"concluidoEm,omitempty"`
	Evidencia   string `json:"evidencia,omitempty"`
}

type PlanoPDI struct {
	ID         int64      `json:"id,omitempty"`
	Pessoa     string     `json:"pessoa"`
	Titulo     string     `json:"titulo"`
	Skill      string     `json:"skill"`
	SkillNome  string     `json:"skillNome"`
	NivelAtual int        `json:"nivelAtual"`
	NivelAlvo  int        `json:"nivelAlvo"`
	Prazo      string     `json:"prazo,omitempty"`
	Status     string     `json:"status"`
	Marcos     []MarcoPDI `json:"marcos"`
}

func listarPDI(ctx context.Context, db *sql.DB, tenantID int64) ([]PlanoPDI, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT pl.id, p.slug, pl.titulo, pl.skill_codigo, pl.skill_nome,
		       pl.nivel_atual, pl.nivel_alvo, COALESCE(pl.prazo::text,''), pl.status
		  FROM pdi_plans pl JOIN people p ON p.id = pl.person_id
		 WHERE pl.tenant_id = $1 ORDER BY p.slug, pl.id`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("listar PDI: %w", err)
	}
	defer rows.Close()

	planos := []PlanoPDI{}
	porID := map[int64]int{}
	for rows.Next() {
		var pl PlanoPDI
		if err := rows.Scan(&pl.ID, &pl.Pessoa, &pl.Titulo, &pl.Skill, &pl.SkillNome,
			&pl.NivelAtual, &pl.NivelAlvo, &pl.Prazo, &pl.Status); err != nil {
			return nil, err
		}
		pl.Marcos = []MarcoPDI{}
		porID[pl.ID] = len(planos)
		planos = append(planos, pl)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(planos) == 0 {
		return planos, nil
	}

	ms, err := db.QueryContext(ctx, `
		SELECT plan_id, ordem, descricao, COALESCE(prazo::text,''),
		       COALESCE(concluido_em::text,''), COALESCE(evidencia,'')
		  FROM pdi_milestones WHERE tenant_id = $1 ORDER BY plan_id, ordem`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("marcos: %w", err)
	}
	defer ms.Close()
	for ms.Next() {
		var id int64
		var m MarcoPDI
		if err := ms.Scan(&id, &m.Ordem, &m.Descricao, &m.Prazo,
			&m.ConcluidoEm, &m.Evidencia); err != nil {
			return nil, err
		}
		if i, ok := porID[id]; ok {
			planos[i].Marcos = append(planos[i].Marcos, m)
		}
	}
	return planos, ms.Err()
}

// salvarPDI grava um plano.
//
// O CHECK do banco recusa alvo menor ou igual ao atual, e `skill_codigo` é NOT
// NULL. As duas travas existem para o mesmo fim: transformar "estudar Go", que
// ninguém consegue cobrar, em "Go: 1→3 até março, evidenciado por PR em
// produção".
func salvarPDI(ctx context.Context, db *sql.DB, tenantID int64, pl PlanoPDI) (int64, error) {
	if strings.TrimSpace(pl.Skill) == "" {
		return 0, fmt.Errorf("objetivo sem skill-alvo não é cobrável — escolha a skill")
	}
	if pl.NivelAlvo <= pl.NivelAtual {
		return 0, fmt.Errorf("o nível-alvo (%d) precisa ser maior que o atual (%d)",
			pl.NivelAlvo, pl.NivelAtual)
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback() //nolint:errcheck // commit explícito no fim

	var personID int64
	if err := tx.QueryRowContext(ctx,
		`SELECT id FROM people WHERE tenant_id = $1 AND slug = $2`,
		tenantID, pl.Pessoa).Scan(&personID); err != nil {
		if err == sql.ErrNoRows {
			return 0, fmt.Errorf("pessoa %q não existe no cadastro", pl.Pessoa)
		}
		return 0, err
	}

	status := pl.Status
	if status == "" {
		status = "ativo"
	}
	var id int64
	if pl.ID > 0 {
		id = pl.ID
		_, err = tx.ExecContext(ctx, `
			UPDATE pdi_plans SET titulo=$3, skill_codigo=$4, skill_nome=$5,
			       nivel_atual=$6, nivel_alvo=$7, prazo=NULLIF($8,'')::date, status=$9
			 WHERE tenant_id=$1 AND id=$2`,
			tenantID, id, pl.Titulo, pl.Skill, pl.SkillNome,
			pl.NivelAtual, pl.NivelAlvo, pl.Prazo, status)
	} else {
		err = tx.QueryRowContext(ctx, `
			INSERT INTO pdi_plans (tenant_id, person_id, titulo, skill_codigo, skill_nome,
			                       nivel_atual, nivel_alvo, prazo, status)
			VALUES ($1,$2,$3,$4,$5,$6,$7,NULLIF($8,'')::date,$9) RETURNING id`,
			tenantID, personID, pl.Titulo, pl.Skill, pl.SkillNome,
			pl.NivelAtual, pl.NivelAlvo, pl.Prazo, status).Scan(&id)
	}
	if err != nil {
		return 0, fmt.Errorf("plano: %w", err)
	}

	// Marcos são regravados por completo: a lista que chega é a lista que
	// vale. Mesclar por ordem faria um marco removido na tela sobreviver no
	// banco, e ninguém procuraria por ele.
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM pdi_milestones WHERE tenant_id=$1 AND plan_id=$2`, tenantID, id); err != nil {
		return 0, err
	}
	for i, m := range pl.Marcos {
		if strings.TrimSpace(m.Descricao) == "" {
			continue
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO pdi_milestones (tenant_id, plan_id, ordem, descricao,
			                            prazo, concluido_em, evidencia)
			VALUES ($1,$2,$3,$4,NULLIF($5,'')::date,NULLIF($6,'')::date,NULLIF($7,''))`,
			tenantID, id, i+1, m.Descricao, m.Prazo, m.ConcluidoEm, m.Evidencia); err != nil {
			return 0, fmt.Errorf("marco %d: %w", i+1, err)
		}
	}
	return id, tx.Commit()
}

/* ---------- trilha QA → Dev ---------- */

type CriterioTrilha struct {
	ID         int64  `json:"id"`
	Nivel      string `json:"nivel"`
	Ordem      int    `json:"ordem"`
	Descricao  string `json:"descricao"`
	Artefato   string `json:"artefato,omitempty"`
	AtendidoEm string `json:"atendidoEm,omitempty"`
	Evidencia  string `json:"evidencia,omitempty"`
	Nota       string `json:"nota,omitempty"`
}

type NivelTrilha struct {
	Codigo      string `json:"codigo"`
	Nome        string `json:"nome"`
	Identidade  string `json:"identidade"`
	Ordem       int    `json:"ordem"`
	SaidaValida string `json:"saidaValida,omitempty"`
}

type TrilhaPessoa struct {
	Pessoa    string           `json:"pessoa"`
	Criterios []CriterioTrilha `json:"criterios"`
}

type Trilha struct {
	Niveis  []NivelTrilha  `json:"niveis"`
	Pessoas []TrilhaPessoa `json:"pessoas"`
}

func listarTrilha(ctx context.Context, db *sql.DB, tenantID int64) (Trilha, error) {
	var t Trilha
	t.Niveis, t.Pessoas = []NivelTrilha{}, []TrilhaPessoa{}

	nv, err := db.QueryContext(ctx,
		`SELECT codigo, nome, identidade, ordem, COALESCE(saida_valida,'')
		   FROM track_levels ORDER BY ordem`)
	if err != nil {
		return t, fmt.Errorf("níveis: %w", err)
	}
	for nv.Next() {
		var n NivelTrilha
		if err := nv.Scan(&n.Codigo, &n.Nome, &n.Identidade, &n.Ordem, &n.SaidaValida); err != nil {
			nv.Close()
			return t, err
		}
		t.Niveis = append(t.Niveis, n)
	}
	nv.Close()

	// LEFT JOIN a partir do produto cartesiano de QAs × critérios: a tela
	// precisa ver o que FALTA, não só o que já foi atendido. Uma lista só do
	// atendido mostraria progresso e esconderia o travamento, que é
	// justamente o que a trilha existe para localizar.
	rows, err := db.QueryContext(ctx, `
		SELECT p.slug, c.id, c.level_codigo, c.ordem, c.descricao, COALESCE(c.artefato,''),
		       COALESCE(pr.atendido_em::text,''), COALESCE(pr.evidencia,''), COALESCE(pr.nota,'')
		  FROM people p
		  CROSS JOIN track_criteria c
		  LEFT JOIN person_track_progress pr
		         ON pr.person_id = p.id AND pr.criterio_id = c.id AND pr.tenant_id = $1
		 WHERE p.tenant_id = $1 AND p.familia = 'testes_qa' AND p.status <> 'desligado'
		 ORDER BY p.slug, c.level_codigo, c.ordem`, tenantID)
	if err != nil {
		return t, fmt.Errorf("progresso: %w", err)
	}
	defer rows.Close()

	porSlug := map[string]int{}
	for rows.Next() {
		var slug string
		var c CriterioTrilha
		if err := rows.Scan(&slug, &c.ID, &c.Nivel, &c.Ordem, &c.Descricao,
			&c.Artefato, &c.AtendidoEm, &c.Evidencia, &c.Nota); err != nil {
			return t, err
		}
		i, ok := porSlug[slug]
		if !ok {
			i = len(t.Pessoas)
			porSlug[slug] = i
			t.Pessoas = append(t.Pessoas, TrilhaPessoa{Pessoa: slug, Criterios: []CriterioTrilha{}})
		}
		t.Pessoas[i].Criterios = append(t.Pessoas[i].Criterios, c)
	}
	return t, rows.Err()
}

// marcarCriterio registra que um critério foi atendido — ou desfaz.
//
// Passagem de nível NÃO é automática: ela exige critérios atendidos, evidência
// de cada um E decisão datada do coordenador. Este endpoint faz só a primeira
// parte, de propósito.
func marcarCriterio(ctx context.Context, db *sql.DB, tenantID int64, slug string,
	criterioID int64, atendidoEm, evidencia, nota string) error {

	if atendidoEm != "" && strings.TrimSpace(evidencia) == "" {
		return fmt.Errorf("critério atendido sem evidência não é verificável — " +
			"descreva o artefato que comprova")
	}
	res, err := db.ExecContext(ctx, `
		INSERT INTO person_track_progress
		  (tenant_id, person_id, criterio_id, atendido_em, evidencia, nota)
		SELECT $1, p.id, $3, NULLIF($4,'')::date, NULLIF($5,''), NULLIF($6,'')
		  FROM people p WHERE p.tenant_id = $1 AND p.slug = $2
		ON CONFLICT (tenant_id, person_id, criterio_id) DO UPDATE SET
		  atendido_em = EXCLUDED.atendido_em,
		  evidencia = EXCLUDED.evidencia,
		  nota = EXCLUDED.nota`,
		tenantID, slug, criterioID, atendidoEm, evidencia, nota)
	if err != nil {
		return fmt.Errorf("marcar critério: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
