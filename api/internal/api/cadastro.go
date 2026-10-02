package api

// Escrita do cadastro: pessoas, tribos e squads.
//
// O contrato é "substituir a lista", e não um REST por item, porque é assim
// que a tela já funciona: `salvarPessoas(lista)` manda o array inteiro. Casar
// com isso mantém a semântica idêntica entre o que roda com banco e o que roda
// só no navegador, e evita um estado intermediário em que metade da tela foi
// salva e a outra não.
//
// Uma assimetria deliberada entre as entidades:
//
//   - **Pessoa nunca é removida.** Sair da gestão, afastar e desligar são
//     mudanças de STATUS, porque 1:1s, evidências e avaliações continuam
//     valendo depois. Uma pessoa que some da lista enviada é ignorada, não
//     apagada — se o front tiver um bug de filtro, o pior que acontece é não
//     atualizar alguém.
//   - **Tribo e squad podem ser removidas**, porque a tela oferece isso e
//     estrutura organizacional muda. Quem estava na squad volta para "sem
//     squad", que é dado de gestão e aparece na tela.

import (
	"context"
	"database/sql"
	"fmt"

	"github.com/lib/pq"

	"teamcontrol/internal/models"
)

/* ---------- pessoas ---------- */

// PessoaEntrada é o formato que a tela manda. Difere de models.Pessoa de
// propósito: o front trabalha com o id da tribo e com a família capitalizada,
// e a tradução acontece aqui, não espalhada pelas telas.
type PessoaEntrada struct {
	Slug              string  `json:"slug"`
	Nome              string  `json:"nome"`
	Curto             string  `json:"curto"`
	Familia           string  `json:"familia"`
	Cargo             string  `json:"cargo"`
	TechLead          bool    `json:"techLead"`
	QADe              *string `json:"qaDe"`
	Admissao          *string `json:"admissao"`
	Status            string  `json:"status"`
	MotivoAfastamento *string `json:"motivoAfastamento"`
	RetornoPrevisto   *string `json:"retornoPrevisto"`
	CadenciaDias      *int    `json:"cadenciaDias"`
	Salario           *int    `json:"salario"`
	UltimoReajuste    *string `json:"ultimoReajuste"`
	FaixaSalarial     *string `json:"faixaSalarial"`
}

// A família vem capitalizada da tela e vai minúscula para o CHECK do banco.
var familiaDoFront = map[string]string{
	"Desenvolvimento": "desenvolvimento",
	"Testes / QA":     "testes_qa",
	"Produto":         "produto",
	"Liderança":       "lideranca",
}

func salvarPessoas(ctx context.Context, db *sql.DB, sc models.Scope, lista []PessoaEntrada) error {
	if err := sc.Validate(); err != nil {
		return err
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("abrir transação: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	for _, p := range lista {
		familia, ok := familiaDoFront[p.Familia]
		if !ok {
			return fmt.Errorf("família desconhecida em %q: %q", p.Slug, p.Familia)
		}
		cadencia := 60
		if p.CadenciaDias != nil {
			cadencia = *p.CadenciaDias
		}

		// Upsert por (tenant, slug): o slug é o identificador estável que a
		// tela usa em pauta, avaliação e matriz de skills.
		_, err := tx.ExecContext(ctx, `
			INSERT INTO people
			  (tenant_id, slug, nome_completo, nome_curto, nome_normalizado,
			   familia, cargo, eh_tech_lead, qa_de,
			   data_admissao, status, motivo_afastamento, retorno_previsto,
			   cadencia_dias, salario, ultimo_reajuste, faixa_salarial)
			VALUES ($1,$2,$3,$4, normaliza_nome($17),
			        $5,$6,$7,$8,
			        NULLIF($9,'')::date, $10, $11, NULLIF($12,'')::date,
			        $13, $14, NULLIF($15,'')::date, $16)
			ON CONFLICT (tenant_id, slug) DO UPDATE SET
			  nome_completo      = EXCLUDED.nome_completo,
			  nome_curto         = EXCLUDED.nome_curto,
			  nome_normalizado   = EXCLUDED.nome_normalizado,
			  familia            = EXCLUDED.familia,
			  cargo              = EXCLUDED.cargo,
			  eh_tech_lead       = EXCLUDED.eh_tech_lead,
			  qa_de              = EXCLUDED.qa_de,
			  data_admissao      = EXCLUDED.data_admissao,
			  status             = EXCLUDED.status,
			  motivo_afastamento = EXCLUDED.motivo_afastamento,
			  retorno_previsto   = EXCLUDED.retorno_previsto,
			  cadencia_dias      = EXCLUDED.cadencia_dias,
			  salario            = EXCLUDED.salario,
			  ultimo_reajuste    = EXCLUDED.ultimo_reajuste,
			  faixa_salarial     = EXCLUDED.faixa_salarial,
			  atualizado_em      = NOW()`,
			sc.TenantID, p.Slug, p.Nome, p.Curto,
			familia, p.Cargo, p.TechLead, p.QADe,
			texto(p.Admissao), p.Status, p.MotivoAfastamento, texto(p.RetornoPrevisto),
			cadencia, p.Salario, texto(p.UltimoReajuste), p.FaixaSalarial,
			p.Nome)
		if err != nil {
			return fmt.Errorf("gravar pessoa %q: %w", p.Slug, err)
		}
	}
	return tx.Commit()
}

/* ---------- tribos ---------- */

type TriboEntrada struct {
	ID          string   `json:"id"`
	Nome        string   `json:"nome"`
	Cor         string   `json:"cor"`
	Produto     string   `json:"produto"`
	PortalID    string   `json:"portalId"`
	Coordenacao []string `json:"coordenacao"`
	Gerencia    []string `json:"gerencia"`
}

func salvarTribos(ctx context.Context, db *sql.DB, sc models.Scope, lista []TriboEntrada) error {
	if err := sc.Validate(); err != nil {
		return err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("abrir transação: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	enviados := make([]string, 0, len(lista))
	for _, t := range lista {
		enviados = append(enviados, t.ID)
		_, err := tx.ExecContext(ctx, `
			INSERT INTO tribos (tenant_id, slug, nome, cor, produto, portal_id,
			                    coordenacao, gerencia)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
			ON CONFLICT (tenant_id, slug) DO UPDATE SET
			  nome = EXCLUDED.nome, cor = EXCLUDED.cor,
			  produto = EXCLUDED.produto, portal_id = EXCLUDED.portal_id,
			  coordenacao = EXCLUDED.coordenacao, gerencia = EXCLUDED.gerencia,
			  ativo = TRUE`,
			sc.TenantID, t.ID, t.Nome, t.Cor, t.Produto, t.PortalID,
			textoArray(t.Coordenacao), textoArray(t.Gerencia))
		if err != nil {
			return fmt.Errorf("gravar tribo %q: %w", t.ID, err)
		}
	}

	// Tribo removida da tela é desativada, não apagada: squads e pessoas
	// podem apontar para ela, e o histórico precisa continuar legível.
	if _, err := tx.ExecContext(ctx, `
		UPDATE tribos SET ativo = FALSE
		 WHERE tenant_id = $1 AND NOT (slug = ANY($2))`,
		sc.TenantID, textoArray(enviados)); err != nil {
		return fmt.Errorf("desativar tribos removidas: %w", err)
	}
	return tx.Commit()
}

func listarTribos(ctx context.Context, db *sql.DB, sc models.Scope) ([]TriboEntrada, error) {
	linhas, err := db.QueryContext(ctx, `
		SELECT slug, nome, cor, COALESCE(produto,''), COALESCE(portal_id,''),
		       coordenacao, gerencia
		  FROM tribos
		 WHERE tenant_id = $1 AND ativo
		 ORDER BY nome`, sc.TenantID)
	if err != nil {
		return nil, fmt.Errorf("consultar tribos: %w", err)
	}
	defer linhas.Close()

	out := []TriboEntrada{}
	for linhas.Next() {
		var t TriboEntrada
		if err := linhas.Scan(&t.ID, &t.Nome, &t.Cor, &t.Produto, &t.PortalID,
			arrayTexto(&t.Coordenacao), arrayTexto(&t.Gerencia)); err != nil {
			return nil, fmt.Errorf("ler tribo: %w", err)
		}
		out = append(out, t)
	}
	return out, linhas.Err()
}

/* ---------- squads ---------- */

type SquadEntrada struct {
	ID          string   `json:"id"`
	Nome        string   `json:"nome"`
	Tribo       string   `json:"tribo"`
	TechLead    *string  `json:"techLead"`
	Coordenacao []string `json:"coordenacao"`
	Membros     []string `json:"membros"`
}

func salvarSquads(ctx context.Context, db *sql.DB, sc models.Scope, lista []SquadEntrada) error {
	if err := sc.Validate(); err != nil {
		return err
	}
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("abrir transação: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	enviados := make([]string, 0, len(lista))
	for _, s := range lista {
		enviados = append(enviados, s.ID)
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO squads (tenant_id, slug, nome, tribo_slug, tech_lead_slug,
			                    coordenacao, membros)
			VALUES ($1,$2,$3,$4,$5,$6,$7)
			ON CONFLICT (tenant_id, slug) DO UPDATE SET
			  nome = EXCLUDED.nome, tribo_slug = EXCLUDED.tribo_slug,
			  tech_lead_slug = EXCLUDED.tech_lead_slug,
			  coordenacao = EXCLUDED.coordenacao, membros = EXCLUDED.membros`,
			sc.TenantID, s.ID, s.Nome, s.Tribo, s.TechLead,
			textoArray(s.Coordenacao), textoArray(s.Membros)); err != nil {
			return fmt.Errorf("gravar squad %q: %w", s.ID, err)
		}
	}

	// Squad removida some de verdade: quem estava nela volta para "sem squad",
	// que a tela mostra como dado de gestão, não como erro.
	if _, err := tx.ExecContext(ctx, `
		DELETE FROM squads WHERE tenant_id = $1 AND NOT (slug = ANY($2))`,
		sc.TenantID, textoArray(enviados)); err != nil {
		return fmt.Errorf("remover squads: %w", err)
	}
	return tx.Commit()
}

func listarSquads(ctx context.Context, db *sql.DB, sc models.Scope) ([]SquadEntrada, error) {
	linhas, err := db.QueryContext(ctx, `
		SELECT slug, nome, tribo_slug, tech_lead_slug, coordenacao, membros
		  FROM squads WHERE tenant_id = $1 ORDER BY nome`, sc.TenantID)
	if err != nil {
		return nil, fmt.Errorf("consultar squads: %w", err)
	}
	defer linhas.Close()

	out := []SquadEntrada{}
	for linhas.Next() {
		var s SquadEntrada
		if err := linhas.Scan(&s.ID, &s.Nome, &s.Tribo, &s.TechLead,
			arrayTexto(&s.Coordenacao), arrayTexto(&s.Membros)); err != nil {
			return nil, fmt.Errorf("ler squad: %w", err)
		}
		out = append(out, s)
	}
	return out, linhas.Err()
}

/* ---------- auxiliares ---------- */

// texto desreferencia ponteiro de data: o SQL usa NULLIF($n,”)::date, então
// string vazia e ausente viram o mesmo NULL.
func texto(p *string) string {
	if p == nil {
		return ""
	}
	return *p
}

// textoArray converte para o TEXT[] do Postgres.
//
// `nil` vira array vazio e não NULL: as colunas são NOT NULL DEFAULT '{}', e
// um NULL aqui faria `= ANY($2)` devolver desconhecido em vez de falso — o
// que, na limpeza de registros removidos, apagaria a tabela inteira.
func textoArray(v []string) any {
	if v == nil {
		v = []string{}
	}
	return pq.Array(v)
}

// arrayTexto é o destino do Scan para uma coluna TEXT[].
func arrayTexto(destino *[]string) any {
	return pq.Array(destino)
}
