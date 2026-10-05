// Package pauta monta a preparação de uma 1:1 a partir do histórico.
//
// A regra que governa o pacote inteiro: **assunto derivado de fato cita a
// conversa de onde saiu.** Assunto sem lastro só pode vir de regra de ausência
// ("não falamos de PDI há três conversas"), que é uma afirmação sobre o que
// NÃO foi dito e por isso não precisa de citação. Nada aqui infere livremente
// sobre a pessoa.
//
// Tudo é determinístico — regras baratas, explicáveis, que não alucinam. A
// camada de IA que lê a linha do tempo inteira vem depois e por cima; sem a
// base determinística acumulada ela só teria prosa para ler e produziria
// sugestão genérica, que é o oposto do que faz a funcionalidade valer.
package pauta

import (
	"database/sql"
	"fmt"
	"sort"
	"strings"
	"time"
)

// Prioridades, na ordem em que a pauta é montada.
const (
	Alta   = "alta"
	Media  = "media"
	Baixa  = "baixa"
	Escuta = "escuta"
)

var ordemPrioridade = map[string]int{Alta: 0, Media: 1, Baixa: 2, Escuta: 3}

// Assunto é um item proposto para a conversa.
type Assunto struct {
	ID          string   `json:"id"`
	Prioridade  string   `json:"prioridade"`
	Minutos     int      `json:"minutos"`
	Categoria   string   `json:"categoria"`
	Origem      string   `json:"origem"`
	Titulo      string   `json:"titulo"`
	PorQueAgora string   `json:"porQueAgora"`
	Refs        []string `json:"refs"`
	Pergunta    string   `json:"pergunta"`
	PorQueAssim string   `json:"porQueAssim"`
	Toca        []string `json:"toca"`
	Conf        int      `json:"conf,omitempty"`
	AvisoConf   string   `json:"avisoConf,omitempty"`
	Herdado     bool     `json:"herdado,omitempty"`
}

// Compromisso é um encaminhamento em aberto.
type Compromisso struct {
	ID            int64   `json:"id"`
	Pessoa        string  `json:"pessoa"`
	PessoaSlug    string  `json:"pessoaSlug"`
	Responsavel   string  `json:"responsavel"`
	NomeResp      string  `json:"nomeResp"`
	Descricao     string  `json:"descricao"`
	PrazoTexto    string  `json:"prazoTexto"`
	PrazoDate     *string `json:"prazoDate"`
	PrazoSugerido *string `json:"prazoSugerido,omitempty"`
	Natureza      string  `json:"natureza"`
	Status        string  `json:"status"`
	// ConcluidoEm responde "concluído quando?", que é pergunta da
	// retrospectiva de ciclo. Sem a data, a resposta é "em algum momento".
	ConcluidoEm   *string `json:"concluidoEm"`
	OrigemMeeting string  `json:"origemMeeting"`
	Herdado       int     `json:"herdado"`
	PrazoVago     bool    `json:"prazoVago"`
	NotaHerdado   string  `json:"notaHerdado,omitempty"`

	// VenceAgora marca o combinado que tem como prazo "a próxima 1:1" quando
	// essa próxima 1:1 ainda não aconteceu — ou seja, é a conversa que está
	// sendo preparada. É o item mais acionável que existe no sistema: não
	// vence um dia qualquer, vence hoje, nesta sala.
	VenceAgora bool `json:"venceAgora"`
}

// TemaRecorrente é o que volta conversa após conversa.
type TemaRecorrente struct {
	Tema        string   `json:"tema"`
	Ocorrencias int      `json:"ocorrencias"`
	Janela      int      `json:"janela"`
	Nota        string   `json:"nota"`
	Refs        []string `json:"refs"`
}

// TemaAusente é o que sumiu sem ninguém notar.
type TemaAusente struct {
	Tema         string  `json:"tema"`
	ConversasSem int     `json:"conversasSem"`
	Ultimo       *string `json:"ultimo"`
	Nota         string  `json:"nota,omitempty"`
}

type Temas struct {
	Recorrentes []TemaRecorrente `json:"recorrentes"`
	Ausentes    []TemaAusente    `json:"ausentes"`
}

// Novidade é o que mudou desde a última conversa.
type Novidade struct {
	Tipo   string `json:"tipo"` // cruzado · entrega · alerta
	Data   string `json:"data"`
	Conf   int    `json:"conf"`
	Texto  string `json:"texto"`
	Origem string `json:"origem,omitempty"`
	Ref    string `json:"ref,omitempty"`
}

// ItemNaoFalar é restrição ativa para esta conversa.
type ItemNaoFalar struct {
	Texto  string `json:"texto"`
	Conf   int    `json:"conf"`
	Motivo string `json:"motivo"`
}

type NaoFalar struct {
	CicloVigente   string         `json:"cicloVigente"`
	Itens          []ItemNaoFalar `json:"itens"`
	OmitidosNivel4 int            `json:"omitidosNivel4"`
}

// Preparo é tudo que a tela de preparação precisa de uma pessoa.
type Preparo struct {
	Pessoa           string        `json:"pessoa"`
	Slug             string        `json:"slug"`
	UltimaConversa   *string       `json:"ultimaConversa"`
	DiasSemConversa  *int          `json:"diasSemConversa"`
	Assuntos         []Assunto     `json:"assuntos"`
	Temas            Temas         `json:"temas"`
	Novidades        []Novidade    `json:"novidades"`
	ProximaConversa  []string      `json:"proximaConversa"`
	DataProxConversa *string       `json:"dataProxConversa"`
	NaoFalar         NaoFalar      `json:"naoFalar"`
	Compromissos     []Compromisso `json:"compromissos"`
}

// JanelaRecorrencia é quantas conversas para trás a recorrência olha.
//
// Cinco porque é o horizonte em que uma pessoa ainda lembra do que foi
// combinado. Dez traria padrões reais mas já resolvidos, e sugerir que se
// retome algo encerrado é o jeito mais rápido de a pauta perder credibilidade.
const JanelaRecorrencia = 5

// MinRecorrencia é a partir de quantas aparições o tema vira assunto.
const MinRecorrencia = 3

// ConversasParaAusencia é quantas conversas sem o tema acendem o alerta.
const ConversasParaAusencia = 3

// Montar lê o histórico da pessoa e propõe a conversa.
func Montar(db *sql.DB, tenantID int64, slug string, hoje time.Time) (*Preparo, error) {
	var (
		personID    int64
		nome, cargo string
		cadencia    int
	)
	err := db.QueryRow(`
		SELECT id, nome_completo, cargo, cadencia_dias
		  FROM people WHERE tenant_id = $1 AND slug = $2`,
		tenantID, slug).Scan(&personID, &nome, &cargo, &cadencia)
	if err != nil {
		return nil, err
	}

	pre := &Preparo{Pessoa: nome, Slug: slug, Assuntos: []Assunto{},
		Novidades: []Novidade{}, ProximaConversa: []string{},
		Compromissos: []Compromisso{}}

	conversas, err := carregarConversas(db, tenantID, personID)
	if err != nil {
		return nil, err
	}
	if len(conversas) > 0 {
		u := conversas[0].Data
		pre.UltimaConversa = &u
		d := int(hoje.Sub(dataDe(u)).Hours() / 24)
		pre.DiasSemConversa = &d
	}

	pre.Compromissos, err = CompromissosDe(db, tenantID, personID)
	if err != nil {
		return nil, err
	}
	pre.Temas = calcularTemas(conversas)
	if pre.ProximaConversa, err = proximosTopicos(db, tenantID, personID); err != nil {
		return nil, err
	}
	if pre.Novidades, err = novidades(db, tenantID, personID, nome, conversas); err != nil {
		return nil, err
	}
	if pre.NaoFalar, err = naoFalar(db, tenantID, personID); err != nil {
		return nil, err
	}

	pre.Assuntos = montarAssuntos(pre, cadencia, hoje)
	return pre, nil
}

/* ---------- insumos ---------- */

type conversa struct {
	ID    int64
	Data  string
	Texto string
	Perf  string
}

// carregarConversas traz as conversas da mais recente para a mais antiga.
//
// O texto vem das partes de confidencialidade até 3 — a preparação é sua, e o
// que está no registro privado é justamente o que não pode ser esquecido antes
// de entrar na sala. Nível 4 fica fora, sempre: ele existe no sistema como
// contagem, nunca como conteúdo.
//
// A avaliação entra junto, e isso não é detalhe. A maior parte das conversas
// não tem registro `.md`: elas vieram do dossiê, onde o conteúdo mora na
// justificativa do líder e nas notas compartilhadas. Lendo só o markdown, o
// histórico de quem tem duas atas e dez avaliações parece ter duas conversas —
// e a detecção de tema, que é toda baseada em texto, daria vazia para quase
// todo mundo.
func carregarConversas(db *sql.DB, tenantID, personID int64) ([]conversa, error) {
	linhas, err := db.Query(`
		SELECT m.id, m.data::text,
		       trim(both E'\n' FROM
		         COALESCE(string_agg(DISTINCT r.markdown, E'\n'), '') || E'\n' ||
		         COALESCE(max(e.performance_justificativa), '') || E'\n' ||
		         COALESCE(max(e.notas_compartilhadas), '')),
		       COALESCE(max(e.performance), '')
		  FROM meetings m
		  LEFT JOIN meeting_records r
		         ON r.meeting_id = m.id
		        AND nivel_visibilidade(r.confidencialidade) <= 3
		  LEFT JOIN meeting_evals e
		         ON e.meeting_id = m.id
		        AND nivel_visibilidade(e.confidencialidade) <= 3
		 WHERE m.tenant_id = $1 AND m.person_id = $2
		 GROUP BY m.id, m.data
		 ORDER BY m.data DESC`, tenantID, personID)
	if err != nil {
		return nil, fmt.Errorf("conversas: %w", err)
	}
	defer linhas.Close()

	var out []conversa
	for linhas.Next() {
		var c conversa
		if err := linhas.Scan(&c.ID, &c.Data, &c.Texto, &c.Perf); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, linhas.Err()
}

// CompromissosDe traz os encaminhamentos em aberto da pessoa.
//
// `herdado` sai de quantas conversas distintas trazem a MESMA descrição: é o
// que distingue "ele não fez ainda" de "isto atravessou três conversas e
// ninguém matou nem renegociou". O segundo não é cobrança, é sintoma.
func CompromissosDe(db *sql.DB, tenantID, personID int64) ([]Compromisso, error) {
	linhas, err := db.Query(`
		WITH repetidos AS (
		  SELECT a.person_id, lower(a.descricao) AS d, count(DISTINCT a.meeting_id) AS n
		    FROM action_items a
		   WHERE a.tenant_id = $1
		   GROUP BY 1, 2
		)
		SELECT a.id, p.nome_completo, p.slug, a.responsavel_tipo,
		       COALESCE(a.responsavel_nome,''), a.descricao,
		       COALESCE(a.prazo_texto,''), a.prazo_date::text, a.prazo_sugerido::text,
		       a.natureza, a.status, a.concluido_em::text, m.data::text, COALESCE(r.n, 1),
		       a.prazo_vago, COALESCE(a.nota_herdado,''),
		       -- Vence NESTA conversa: o prazo é "a próxima 1:1" e essa
		       -- próxima ainda não existe no banco, logo é a que vem.
		       (a.natureza = 'prazo' AND a.prazo_date IS NULL
		        AND a.prazo_sugerido IS NULL
		        AND a.prazo_texto ~* 'pr[óo]xim[ao]\s+(1[\s:-]*1|conversa|encontro)')
		  FROM action_items a
		  JOIN people p ON p.id = a.person_id
		  LEFT JOIN meetings m ON m.id = a.meeting_id
		  LEFT JOIN repetidos r ON r.person_id = a.person_id AND r.d = lower(a.descricao)
		 WHERE a.tenant_id = $1
		   AND ($2 = 0 OR a.person_id = $2)
		   AND a.status <> 'concluido'
		 ORDER BY m.data DESC NULLS LAST, a.id`, tenantID, personID)
	if err != nil {
		return nil, fmt.Errorf("compromissos: %w", err)
	}
	defer linhas.Close()

	out := []Compromisso{}
	for linhas.Next() {
		var c Compromisso
		var origem sql.NullString
		if err := linhas.Scan(&c.ID, &c.Pessoa, &c.PessoaSlug, &c.Responsavel,
			&c.NomeResp, &c.Descricao, &c.PrazoTexto, &c.PrazoDate, &c.PrazoSugerido,
			&c.Natureza, &c.Status, &c.ConcluidoEm, &origem, &c.Herdado, &c.PrazoVago,
			&c.NotaHerdado, &c.VenceAgora); err != nil {
			return nil, err
		}
		if origem.Valid {
			c.OrigemMeeting = origem.String
		}
		out = append(out, c)
	}
	return out, linhas.Err()
}

func proximosTopicos(db *sql.DB, tenantID, personID int64) ([]string, error) {
	linhas, err := db.Query(`
		SELECT t.texto
		  FROM meeting_next_topics t
		  JOIN meetings m ON m.id = t.meeting_id
		 WHERE t.tenant_id = $1 AND m.person_id = $2
		   AND m.data = (SELECT max(m2.data) FROM meetings m2
		                  JOIN meeting_next_topics t2 ON t2.meeting_id = m2.id
		                 WHERE m2.tenant_id = $1 AND m2.person_id = $2)
		 ORDER BY t.ordem`, tenantID, personID)
	if err != nil {
		return nil, fmt.Errorf("próximos tópicos: %w", err)
	}
	defer linhas.Close()

	out := []string{}
	for linhas.Next() {
		var s string
		if err := linhas.Scan(&s); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, linhas.Err()
}

/* ---------- temas ---------- */

func calcularTemas(conversas []conversa) Temas {
	t := Temas{Recorrentes: []TemaRecorrente{}, Ausentes: []TemaAusente{}}

	// Só conversa COM texto entra na conta, e isto é a diferença entre um
	// número verdadeiro e um que parece verdadeiro.
	//
	// "Não falamos de PDI há oito conversas" é falso se de seis delas o
	// sistema não tem conteúdo nenhum — o tema pode ter sido discutido em
	// todas. Contar conversa sem texto como "sem o tema" transformaria uma
	// lacuna de ingestão em afirmação sobre a pessoa, que é o pior erro que um
	// sistema destes pode cometer: ele soa específico e está inventando.
	var comTexto []conversa
	for _, c := range conversas {
		if strings.TrimSpace(c.Texto) != "" {
			comTexto = append(comTexto, c)
		}
	}
	if len(comTexto) == 0 {
		return t
	}
	conversas = comTexto

	janela := conversas
	if len(janela) > JanelaRecorrencia {
		janela = janela[:JanelaRecorrencia]
	}

	// Por tema: em quantas conversas da janela apareceu, e em quais datas.
	ocorrencias := map[string][]string{}
	for _, c := range janela {
		for nome := range TemasDoTexto(c.Texto) {
			ocorrencias[nome] = append(ocorrencias[nome], c.Data)
		}
	}
	for nome, datas := range ocorrencias {
		if len(datas) < MinRecorrencia {
			continue
		}
		t.Recorrentes = append(t.Recorrentes, TemaRecorrente{
			Tema: nome, Ocorrencias: len(datas), Janela: len(janela),
			Nota: fmt.Sprintf("%d das últimas %d conversas tocaram no tema",
				len(datas), len(janela)),
			Refs: datas,
		})
	}
	sort.Slice(t.Recorrentes, func(i, j int) bool {
		return t.Recorrentes[i].Ocorrencias > t.Recorrentes[j].Ocorrencias
	})

	// Ausência só vale para tema estratégico: é o que você cobra, e sumir dele
	// é sinal. Tema não estratégico ausente é só um assunto que não veio.
	for _, tema := range Catalogo() {
		if !tema.Estrategico {
			continue
		}
		sem, ultimo := 0, (*string)(nil)
		for _, c := range conversas {
			if TemasDoTexto(c.Texto)[tema.Nome] {
				d := c.Data
				ultimo = &d
				break
			}
			sem++
		}
		if sem >= ConversasParaAusencia {
			nota := ""
			if ultimo == nil {
				nota = "nunca apareceu nas conversas registradas"
			}
			t.Ausentes = append(t.Ausentes, TemaAusente{
				Tema: tema.Nome, ConversasSem: sem, Ultimo: ultimo, Nota: nota,
			})
		}
	}
	sort.Slice(t.Ausentes, func(i, j int) bool {
		return t.Ausentes[i].ConversasSem > t.Ausentes[j].ConversasSem
	})
	return t
}

/* ---------- novidades ---------- */

// novidades junta o que mudou desde a última conversa.
//
// A menção cruzada é a mais valiosa e hoje é impossível de rastrear à mão:
// alguém falou desta pessoa na 1:1 de outra. Ela entra com a origem OMITIDA
// quando o registro de onde saiu é privado — o fato pode pautar a conversa,
// mas dizer quem disse quebraria o combinado da outra 1:1.
func novidades(db *sql.DB, tenantID, personID int64, nome string,
	conversas []conversa) ([]Novidade, error) {

	out := []Novidade{}
	desde := "1900-01-01"
	if len(conversas) > 0 {
		desde = conversas[0].Data
	}

	// Feedbacks recebidos depois da última conversa.
	fb, err := db.Query(`
		SELECT data::text, COALESCE(autor_nome,''), texto, autor_externo
		  FROM feedbacks
		 WHERE tenant_id = $1 AND person_id = $2 AND data > $3::date
		 ORDER BY data DESC`, tenantID, personID, desde)
	if err != nil {
		return nil, fmt.Errorf("novidades/feedbacks: %w", err)
	}
	for fb.Next() {
		var data, autor, texto string
		var externo bool
		if err := fb.Scan(&data, &autor, &texto, &externo); err != nil {
			fb.Close()
			return nil, err
		}
		de := "registrado no sistema"
		if autor != "" {
			de = "de " + autor
			if externo {
				de += " (fora do time)"
			}
		}
		out = append(out, Novidade{
			Tipo: "entrega", Data: data, Conf: 1,
			Texto: resumir(texto, 180), Origem: de,
		})
	}
	fb.Close()

	// Menção a esta pessoa na conversa de outra.
	//
	// O primeiro nome é o que de fato aparece escrito; o nome completo quase
	// nunca. A busca exige limite de palavra para "Ana" não casar dentro de
	// "analisar" — o tipo de falso positivo que destruiria a confiança no
	// bloco inteiro.
	primeiro := primeiroNome(nome)
	if len([]rune(primeiro)) >= 4 {
		mc, err := db.Query(`
			SELECT m.data::text, p.nome_completo,
			       nivel_visibilidade(r.confidencialidade)
			  FROM meeting_records r
			  JOIN meetings m ON m.id = r.meeting_id
			  JOIN people p ON p.id = m.person_id
			 WHERE r.tenant_id = $1 AND m.person_id <> $2 AND m.data > $3::date
			   AND nivel_visibilidade(r.confidencialidade) <= 3
			   AND r.markdown ~* ('\y' || $4 || '\y')
			 GROUP BY m.data, p.nome_completo, r.confidencialidade
			 ORDER BY m.data DESC
			 LIMIT 5`, tenantID, personID, desde, primeiro)
		if err != nil {
			return nil, fmt.Errorf("novidades/cruzado: %w", err)
		}
		for mc.Next() {
			var data, quem string
			var nivel int
			if err := mc.Scan(&data, &quem, &nivel); err != nil {
				mc.Close()
				return nil, err
			}
			n := Novidade{Tipo: "cruzado", Data: data, Conf: nivel}
			if nivel >= 3 {
				// Fato sim, fonte não: o combinado da outra 1:1 vale.
				n.Texto = primeiro + " foi citado na 1:1 de outra pessoa"
				n.Origem = "origem privada — não citar quem disse"
			} else {
				n.Texto = primeiro + " foi citado na 1:1 de " + primeiroNome(quem)
				n.Origem = primeiroNome(quem)
			}
			out = append(out, n)
		}
		mc.Close()
	}

	sort.Slice(out, func(i, j int) bool { return out[i].Data > out[j].Data })
	return out, nil
}

/* ---------- o que não falar ---------- */

func naoFalar(db *sql.DB, tenantID, personID int64) (NaoFalar, error) {
	nf := NaoFalar{Itens: []ItemNaoFalar{}}

	// Restrição do ciclo. A trava de "nada de mérito" vale durante a janela de
	// CALIBRAGEM, não durante o ciclo inteiro — a janela é justamente o
	// período em que a nota já foi lançada e ainda pode mudar na mesa.
	// Antecipá-la ali cria expectativa que a calibragem pode desfazer, e
	// desfazer expectativa de promoção custa mais que nunca tê-la criado.
	//
	// Fora da janela a restrição não entra. Aviso que está sempre aceso vira
	// paisagem, e no dia em que importar ninguém vai mais lê-lo.
	var ciclo string
	var emCalibragem bool
	err := db.QueryRow(`
		SELECT nome,
		       COALESCE(CURRENT_DATE BETWEEN janela_calibragem_inicio
		                               AND janela_calibragem_fim, FALSE)
		  FROM avd_cycles
		 WHERE tenant_id = $1
		 ORDER BY periodo_inicio DESC LIMIT 1`, tenantID).Scan(&ciclo, &emCalibragem)
	if err != nil && err != sql.ErrNoRows {
		return nf, fmt.Errorf("ciclo: %w", err)
	}
	if ciclo != "" {
		nf.CicloVigente = ciclo
		if emCalibragem {
			nf.Itens = append(nf.Itens, ItemNaoFalar{
				Texto: "Nada de mérito, promoção, aumento ou próximo nível",
				Conf:  2,
				Motivo: "ciclo " + ciclo + " em janela de calibragem — a nota ainda " +
					"não passou pela mesa, e antecipá-la cria expectativa que a " +
					"calibragem pode desfazer",
			})
		}
	}

	// Omissões deliberadas das conversas anteriores: o que foi cortado, de
	// onde e por quê — nunca o conteúdo.
	linhas, err := db.Query(`
		SELECT o.item, o.motivo, nivel_visibilidade(o.confidencialidade)
		  FROM record_omissions o
		  JOIN meetings m ON m.id = o.meeting_id
		 WHERE o.tenant_id = $1 AND m.person_id = $2
		 ORDER BY m.data DESC LIMIT 20`, tenantID, personID)
	if err != nil {
		return nf, fmt.Errorf("omissões: %w", err)
	}
	defer linhas.Close()
	for linhas.Next() {
		var item, motivo string
		var nivel int
		if err := linhas.Scan(&item, &motivo, &nivel); err != nil {
			return nf, err
		}
		if nivel >= 4 {
			// Nível 4 é dado de saúde (LGPD art. 11). Conta que existe, e o
			// conteúdo não circula — nem aqui, nem para o RH.
			nf.OmitidosNivel4++
			continue
		}
		nf.Itens = append(nf.Itens, ItemNaoFalar{Texto: item, Conf: nivel, Motivo: motivo})
	}
	return nf, linhas.Err()
}

/* ---------- utilidades ---------- */

func dataDe(s string) time.Time {
	t, _ := time.Parse("2006-01-02", s)
	return t
}

func primeiroNome(s string) string {
	campos := strings.Fields(strings.TrimSpace(s))
	if len(campos) == 0 {
		return ""
	}
	return campos[0]
}

func resumir(s string, max int) string {
	s = strings.Join(strings.Fields(s), " ")
	if len([]rune(s)) <= max {
		return s
	}
	return string([]rune(s)[:max]) + "…"
}
