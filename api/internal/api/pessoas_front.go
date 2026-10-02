package api

// Tradução entre o modelo do banco e o que as telas consomem.
//
// Os dois divergem de propósito e a conversão mora aqui, num lugar só:
//
//   - família é minúscula com underscore no CHECK do banco e capitalizada na
//     tela, porque é texto que a pessoa lê;
//   - `time` na tela é o slug da tribo, derivado da squad em que a pessoa
//     está — a tela não conhece ids numéricos;
//   - `ultima1a1`, `elegivel` e `trajetoria` não são colunas: saem de
//     meetings, da data de corte do ciclo e das avaliações. Calcular aqui
//     evita que cada tela invente a própria regra.

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"teamcontrol/internal/models"
)

// PessoaSaida espelha a interface `Pessoa` do frontend.
type PessoaSaida struct {
	Slug              string   `json:"slug"`
	Nome              string   `json:"nome"`
	Curto             string   `json:"curto"`
	Time              string   `json:"time"`
	Familia           string   `json:"familia"`
	Cargo             string   `json:"cargo"`
	TechLead          bool     `json:"techLead"`
	Admissao          string   `json:"admissao"`
	Status            string   `json:"status"`
	MotivoAfastamento *string  `json:"motivoAfastamento,omitempty"`
	RetornoPrevisto   *string  `json:"retornoPrevisto,omitempty"`
	Salario           *int     `json:"salario,omitempty"`
	UltimoReajuste    *string  `json:"ultimoReajuste,omitempty"`
	FaixaSalarial     *string  `json:"faixaSalarial,omitempty"`
	QADe              *string  `json:"qaDe,omitempty"`
	Elegivel          bool     `json:"elegivel"`
	MotivoInelegivel  *string  `json:"motivoInelegivel,omitempty"`
	Trajetoria        []string `json:"trajetoria"`
	Quadrante         *string  `json:"quadrante"`
	Ultima1a1         string   `json:"ultima1a1"`
	CadenciaDias      int      `json:"cadenciaDias"`
}

var familiaParaFront = map[string]string{
	"desenvolvimento": "Desenvolvimento",
	"testes_qa":       "Testes / QA",
	"produto":         "Produto",
	"lideranca":       "Liderança",
}

func listarPessoasFront(ctx context.Context, db *sql.DB, sc models.Scope) ([]PessoaSaida, error) {
	if err := sc.Validate(); err != nil {
		return nil, err
	}
	nivelMax, err := sc.Aud.NivelMax()
	if err != nil {
		return nil, err
	}
	// Motivo de afastamento pode ser de saúde: só sai com audiência de
	// coordenador E pedido explícito. O mesmo vale para remuneração, que é
	// nível 3 e nunca deve chegar a uma audiência de RH ou de liderado.
	verSensivel := nivelMax >= 3

	linhas, err := db.QueryContext(ctx, `
		SELECT p.slug, p.nome_completo, p.nome_curto,
		       COALESCE(t.slug, '') AS tribo,
		       p.familia, p.cargo, p.eh_tech_lead, p.qa_de,
		       COALESCE(to_char(p.data_admissao,'YYYY-MM-DD'), ''),
		       p.status,
		       CASE WHEN $2 THEN p.motivo_afastamento END,
		       to_char(p.retorno_previsto,'YYYY-MM-DD'),
		       CASE WHEN $3 THEN p.salario END,
		       CASE WHEN $3 THEN to_char(p.ultimo_reajuste,'YYYY-MM-DD') END,
		       CASE WHEN $3 THEN p.faixa_salarial END,
		       p.cadencia_dias,
		       -- Última 1:1 registrada; sem reunião nenhuma, cai na admissão,
		       -- que é o começo honesto da contagem de cadência.
		       COALESCE(
		         to_char((SELECT max(m.data) FROM meetings m
		                   WHERE m.person_id = p.id AND m.tenant_id = p.tenant_id),
		                 'YYYY-MM-DD'),
		         to_char(p.data_admissao,'YYYY-MM-DD'), '')
		  FROM people p
		  LEFT JOIN squads s ON s.tenant_id = p.tenant_id
		                    AND p.slug = ANY(s.membros)
		  LEFT JOIN tribos t ON t.tenant_id = s.tenant_id AND t.slug = s.tribo_slug
		 WHERE p.tenant_id = $1
		 GROUP BY p.id, t.slug
		 ORDER BY p.eh_tech_lead DESC, p.nome_completo`,
		sc.TenantID, verSensivel && sc.IncluirSaude, verSensivel)
	if err != nil {
		return nil, fmt.Errorf("consultar pessoas: %w", err)
	}
	defer linhas.Close()

	corte := time.Now().Format("2006-01-02")
	out := []PessoaSaida{}
	for linhas.Next() {
		var p PessoaSaida
		var familiaBanco string
		if err := linhas.Scan(
			&p.Slug, &p.Nome, &p.Curto, &p.Time, &familiaBanco, &p.Cargo,
			&p.TechLead, &p.QADe, &p.Admissao, &p.Status,
			&p.MotivoAfastamento, &p.RetornoPrevisto,
			&p.Salario, &p.UltimoReajuste, &p.FaixaSalarial,
			&p.CadenciaDias, &p.Ultima1a1,
		); err != nil {
			return nil, fmt.Errorf("ler pessoa: %w", err)
		}

		p.Familia = familiaParaFront[familiaBanco]
		if p.Familia == "" {
			p.Familia = "Desenvolvimento"
		}
		// Array vazio e não nulo: a tela faz `.map` direto e um null quebraria.
		p.Trajetoria = []string{}

		// Elegibilidade é função da data de corte, não coluna — quem completa o
		// tempo mínimo depois entra sozinho, sem ninguém mexer no cadastro.
		elegivel, motivo := elegibilidade(p.Status, p.Admissao, corte, 6)
		p.Elegivel = elegivel
		if motivo != "" {
			p.MotivoInelegivel = &motivo
		}
		out = append(out, p)
	}
	return out, linhas.Err()
}

// elegibilidade devolve se a pessoa entra no ciclo e, quando não entra, o
// motivo em texto — que é o que a tela mostra no lugar do quadrante.
func elegibilidade(status, admissao, corte string, mesesMinimos int) (bool, string) {
	switch status {
	case "desligado":
		return false, "Desligado"
	case "fora_gestao":
		return false, "Fora da gestão"
	}
	if admissao == "" {
		return false, "Sem data de admissão"
	}
	if models.MesesEntre(admissao, corte) < mesesMinimos {
		return false, fmt.Sprintf("Menos de %d meses de casa", mesesMinimos)
	}
	return true, ""
}
