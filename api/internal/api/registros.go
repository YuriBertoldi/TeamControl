package api

// Registros de 1:1 para a tela.
//
// Dois endpoints, e a separação entre eles não é detalhe de performance:
//
//	GET /api/registros      índice — uma linha por conversa, só contagem e
//	                        metadado. Nenhum texto grande.
//	GET /api/registros/{id} conteúdo — as partes do registro E as transcrições
//	                        que o lastreiam.
//
// Uma transcrição tem ~18 mil caracteres. Mandar as 52 no índice seriam quase
// 1 MB por abertura de tela para exibir uma lista de datas. Pior: o índice é
// o que a tela carrega sempre, e o texto é o que ela mostra raramente.
//
// A confidencialidade vai junto em cada parte e em cada fonte. A tela precisa
// dela para marcar o que não pode ser compartilhado — e a transcrição bruta é
// sempre nível 3, porque contém tudo o que foi dito, inclusive o que o
// registro compartilhável cortou de propósito.

import (
	"context"
	"database/sql"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// ParteFront é uma das versões escritas da conversa.
type ParteFront struct {
	Formato  string `json:"formato"`
	Conf     int    `json:"conf"`
	Markdown string `json:"markdown,omitempty"`
}

// FonteFront é o lastro: a transcrição ou as anotações de onde o registro saiu.
type FonteFront struct {
	ID         int64  `json:"id"`
	Fonte      string `json:"fonte"`     // tactiq · gemini_notes · gemini_transcript
	Kind       string `json:"kind"`      // transcricao_bruta · notas_sumarizadas
	Extrator   string `json:"extrator"`  // tactiq_txt · pdftotext
	Qualidade  string `json:"qualidade"` // ok · parcial · falhou
	Conf       int    `json:"conf"`
	Falas      int    `json:"falas"`
	Caracteres int    `json:"caracteres"`
	Texto      string `json:"texto,omitempty"`
}

// EncaminhamentoFront é uma linha do board, na forma que a tela espera.
type EncaminhamentoFront struct {
	Responsavel string `json:"responsavel"`
	Tipo        string `json:"tipo"`
	Descricao   string `json:"descricao"`
	PrazoTexto  string `json:"prazoTexto"`
	PrazoVago   bool   `json:"prazoVago"`
	Status      string `json:"status"`
}

// OmissaoFront registra QUE havia material cortado, nunca o conteúdo.
type OmissaoFront struct {
	Item   string `json:"item"`
	Onde   string `json:"onde"`
	Motivo string `json:"motivo"`
}

// RegistroFront é a linha do índice.
type RegistroFront struct {
	ID              int64        `json:"id"`
	Slug            string       `json:"slug"`
	Pessoa          string       `json:"pessoa"`
	Data            string       `json:"data"`
	Arquivo         string       `json:"arquivo"`
	Duracao         string       `json:"duracao"`
	Fonte           string       `json:"fonte"`
	Tema            string       `json:"tema"`
	Performance     *string      `json:"performance"`
	Impacto         *int         `json:"impacto"`
	Encaminhamentos int          `json:"encaminhamentos"`
	PrazosVagos     int          `json:"prazosVagos"`
	Meus            int          `json:"meus"`
	ProximaConversa int          `json:"proximaConversa"`
	Partes          []ParteFront `json:"partes"`
	Fontes          []FonteFront `json:"fontes"`
	Omitidos        int          `json:"omitidos"`
	OmitidoSaude    int          `json:"omitidoSaude"`
	Bytes           int          `json:"bytes"`
	Divergencia     bool         `json:"divergencia"`
}

// DetalheRegistro é o conteúdo completo de uma conversa.
type DetalheRegistro struct {
	RegistroFront
	ListaEncaminhamentos []EncaminhamentoFront `json:"listaEncaminhamentos"`
	ListaOmissoes        []OmissaoFront        `json:"listaOmissoes"`
	PerfJustificativa    string                `json:"perfJustificativa,omitempty"`
	ImpactoJustificativa string                `json:"impactoJustificativa,omitempty"`
}

var nivelConf = map[string]int{
	"publico_liderado": 1, "rh_calibragem": 2,
	"privado_coordenador": 3, "restrito_saude": 4,
}

// listarRegistros devolve o índice.
func listarRegistros(ctx context.Context, db *sql.DB, tenantID int64) ([]RegistroFront, error) {
	// Uma consulta só, com agregados por reunião. Buscar as contagens em
	// consultas separadas por linha daria 28 × 5 idas ao banco para montar
	// uma tela — e cresce com a pasta.
	rows, err := db.QueryContext(ctx, `
		SELECT m.id, p.slug, p.nome_completo,
		       to_char(m.data,'YYYY-MM-DD'),
		       COALESCE(m.duracao_min,0), COALESCE(m.titulo,''),
		       m.tem_divergencia_data,
		       COALESCE(me.performance,''), COALESCE(me.impacto,0),
		       (SELECT count(*) FROM action_items a WHERE a.meeting_id = m.id),
		       (SELECT count(*) FROM action_items a WHERE a.meeting_id = m.id AND a.prazo_vago),
		       (SELECT count(*) FROM action_items a WHERE a.meeting_id = m.id
		          AND a.responsavel_tipo = 'coordenador'),
		       (SELECT count(*) FROM record_omissions o WHERE o.meeting_id = m.id),
		       (SELECT count(*) FROM record_omissions o WHERE o.meeting_id = m.id
		          AND o.confidencialidade = 'restrito_saude'),
		       (SELECT COALESCE(sum(length(r.markdown)),0) FROM meeting_records r
		          WHERE r.meeting_id = m.id),
		       (SELECT COALESCE(max(r.arquivo_origem),'') FROM meeting_records r
		          WHERE r.meeting_id = m.id),
		       (SELECT COALESCE(max(r.resumo),'') FROM meeting_records r
		          WHERE r.meeting_id = m.id)
		  FROM meetings m
		  JOIN people p ON p.id = m.person_id
		  LEFT JOIN meeting_evals me ON me.meeting_id = m.id
		 WHERE m.tenant_id = $1
		 ORDER BY m.data DESC, p.nome_completo`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("listar registros: %w", err)
	}
	defer rows.Close()

	var lista []RegistroFront
	porID := map[int64]int{}
	for rows.Next() {
		var r RegistroFront
		var dur, impacto int
		var perf, arquivo, resumo string
		if err := rows.Scan(&r.ID, &r.Slug, &r.Pessoa, &r.Data, &dur, &r.Tema,
			&r.Divergencia, &perf, &impacto,
			&r.Encaminhamentos, &r.PrazosVagos, &r.Meus,
			&r.Omitidos, &r.OmitidoSaude, &r.Bytes, &arquivo, &resumo); err != nil {
			return nil, err
		}
		if dur > 0 {
			r.Duracao = fmt.Sprintf("%d min", dur)
		}
		if perf != "" {
			p := perf
			r.Performance = &p
		}
		if impacto > 0 {
			i := impacto
			r.Impacto = &i
		}
		r.Arquivo = arquivo
		if r.Tema == "" {
			r.Tema = resumo
		}
		r.Partes = []ParteFront{}
		r.Fontes = []FonteFront{}
		porID[r.ID] = len(lista)
		lista = append(lista, r)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(lista) == 0 {
		return []RegistroFront{}, nil
	}

	if err := anexarPartes(ctx, db, tenantID, lista, porID, false); err != nil {
		return nil, err
	}
	if err := anexarFontes(ctx, db, tenantID, lista, porID, false); err != nil {
		return nil, err
	}
	return lista, nil
}

// anexarPartes preenche as versões escritas. `comTexto` decide se o markdown
// vai junto — no índice não vai.
func anexarPartes(ctx context.Context, db *sql.DB, tenantID int64,
	lista []RegistroFront, porID map[int64]int, comTexto bool) error {

	rows, err := db.QueryContext(ctx, `
		SELECT meeting_id, formato, confidencialidade,
		       CASE WHEN $2 THEN markdown ELSE '' END
		  FROM meeting_records
		 WHERE tenant_id = $1
		 ORDER BY meeting_id, formato`, tenantID, comTexto)
	if err != nil {
		return fmt.Errorf("partes: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var p ParteFront
		var conf string
		if err := rows.Scan(&id, &p.Formato, &conf, &p.Markdown); err != nil {
			return err
		}
		p.Conf = nivelConf[conf]
		if i, ok := porID[id]; ok {
			lista[i].Partes = append(lista[i].Partes, p)
		}
	}
	return rows.Err()
}

// anexarFontes preenche as transcrições e anotações que lastreiam a conversa.
func anexarFontes(ctx context.Context, db *sql.DB, tenantID int64,
	lista []RegistroFront, porID map[int64]int, comTexto bool) error {

	rows, err := db.QueryContext(ctx, `
		SELECT s.meeting_id, s.id, s.fonte, s.kind, COALESCE(s.extrator,''),
		       s.qualidade_extracao, s.confidencialidade,
		       (SELECT count(*) FROM transcript_lines l WHERE l.meeting_source_id = s.id),
		       length(s.texto),
		       CASE WHEN $2 THEN s.texto ELSE '' END
		  FROM meeting_sources s
		 WHERE s.tenant_id = $1
		 ORDER BY s.meeting_id, s.kind, s.fonte`, tenantID, comTexto)
	if err != nil {
		return fmt.Errorf("fontes: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var f FonteFront
		var conf string
		if err := rows.Scan(&id, &f.ID, &f.Fonte, &f.Kind, &f.Extrator,
			&f.Qualidade, &conf, &f.Falas, &f.Caracteres, &f.Texto); err != nil {
			return err
		}
		f.Conf = nivelConf[conf]
		if i, ok := porID[id]; ok {
			lista[i].Fontes = append(lista[i].Fontes, f)
		}
	}
	return rows.Err()
}

// detalharRegistro devolve uma conversa inteira, com texto.
func detalharRegistro(ctx context.Context, db *sql.DB, tenantID, meetingID int64) (*DetalheRegistro, error) {
	lista, err := listarRegistros(ctx, db, tenantID)
	if err != nil {
		return nil, err
	}
	var base *RegistroFront
	for i := range lista {
		if lista[i].ID == meetingID {
			base = &lista[i]
			break
		}
	}
	if base == nil {
		return nil, sql.ErrNoRows
	}

	d := &DetalheRegistro{RegistroFront: *base}
	d.Partes = []ParteFront{}
	d.Fontes = []FonteFront{}
	um := []RegistroFront{d.RegistroFront}
	idx := map[int64]int{meetingID: 0}

	if err := anexarPartes(ctx, db, tenantID, um, idx, true); err != nil {
		return nil, err
	}
	if err := anexarFontes(ctx, db, tenantID, um, idx, true); err != nil {
		return nil, err
	}
	d.Partes = um[0].Partes
	d.Fontes = um[0].Fontes

	rows, err := db.QueryContext(ctx, `
		SELECT COALESCE(responsavel_nome,''), responsavel_tipo, descricao,
		       COALESCE(prazo_texto,''), prazo_vago, status
		  FROM action_items WHERE tenant_id = $1 AND meeting_id = $2
		 ORDER BY id`, tenantID, meetingID)
	if err != nil {
		return nil, fmt.Errorf("encaminhamentos: %w", err)
	}
	defer rows.Close()
	d.ListaEncaminhamentos = []EncaminhamentoFront{}
	for rows.Next() {
		var e EncaminhamentoFront
		if err := rows.Scan(&e.Responsavel, &e.Tipo, &e.Descricao,
			&e.PrazoTexto, &e.PrazoVago, &e.Status); err != nil {
			return nil, err
		}
		d.ListaEncaminhamentos = append(d.ListaEncaminhamentos, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// As omissões saem com item e motivo, nunca com o conteúdo cortado — é
	// exatamente para isso que a tabela existe. As de saúde (nível 4) não
	// trazem nem o item: o registro é de que existe, e só.
	orows, err := db.QueryContext(ctx, `
		SELECT CASE WHEN confidencialidade = 'restrito_saude'
		            THEN '(conteúdo restrito)' ELSE item END,
		       COALESCE(onde_omitido,''),
		       CASE WHEN confidencialidade = 'restrito_saude'
		            THEN 'Saúde — não circula, nem para o RH' ELSE COALESCE(motivo,'') END
		  FROM record_omissions WHERE tenant_id = $1 AND meeting_id = $2
		 ORDER BY id`, tenantID, meetingID)
	if err != nil {
		return nil, fmt.Errorf("omissões: %w", err)
	}
	defer orows.Close()
	d.ListaOmissoes = []OmissaoFront{}
	for orows.Next() {
		var o OmissaoFront
		if err := orows.Scan(&o.Item, &o.Onde, &o.Motivo); err != nil {
			return nil, err
		}
		d.ListaOmissoes = append(d.ListaOmissoes, o)
	}
	if err := orows.Err(); err != nil {
		return nil, err
	}

	_ = db.QueryRowContext(ctx, `
		SELECT COALESCE(performance_justificativa,''), COALESCE(impacto_justificativa,'')
		  FROM meeting_evals WHERE tenant_id = $1 AND meeting_id = $2`,
		tenantID, meetingID).Scan(&d.PerfJustificativa, &d.ImpactoJustificativa)

	return d, nil
}

// idDaURL extrai o id final de "/api/registros/123".
func idDaURL(caminho string) (int64, error) {
	partes := strings.Split(strings.Trim(caminho, "/"), "/")
	return strconv.ParseInt(partes[len(partes)-1], 10, 64)
}

/* ---------- importações ---------- */

// ArquivoFront é a fila de importação na forma que a tela consome.
//
// Difere de models.ArquivoFonte de propósito: a tela quer a PASTA (para
// agrupar) e o NOME da pessoa (para ler), enquanto o banco guarda o caminho
// completo e o id. Traduzir aqui evita que a tela precise conhecer o esquema,
// e evita uma segunda consulta só para resolver o nome.
type ArquivoFront struct {
	ID          int64   `json:"id"`
	Arquivo     string  `json:"arquivo"`
	Pasta       string  `json:"pasta"`
	Tipo        string  `json:"tipo"`
	Status      string  `json:"status"`
	Pessoa      *string `json:"pessoa"`
	DataReuniao *string `json:"dataReuniao"`
	DataArquivo *string `json:"dataArquivo"`
	Bytes       int64   `json:"bytes"`
	Motivo      string  `json:"motivo,omitempty"`
}

func listarImportacoesFront(ctx context.Context, db *sql.DB, tenantID int64) ([]ArquivoFront, error) {
	rows, err := db.QueryContext(ctx, `
		SELECT f.id, f.nome_arquivo, f.caminho, f.tipo_detectado, f.status,
		       p.nome_completo,
		       to_char(f.data_reuniao,'YYYY-MM-DD'),
		       to_char(f.data_arquivo,'YYYY-MM-DD'),
		       f.bytes,
		       COALESCE(NULLIF(f.erro,''), NULLIF(f.motivo_revisao,''), '')
		  FROM source_files f
		  LEFT JOIN people p ON p.id = f.person_id
		 WHERE f.tenant_id = $1
		 ORDER BY CASE f.status
		            WHEN 'erro' THEN 0 WHEN 'revisao_manual' THEN 1
		            WHEN 'pendente' THEN 2 ELSE 3 END,
		          f.nome_arquivo`, tenantID)
	if err != nil {
		return nil, fmt.Errorf("listar importações: %w", err)
	}
	defer rows.Close()

	out := []ArquivoFront{}
	for rows.Next() {
		var a ArquivoFront
		var caminho string
		if err := rows.Scan(&a.ID, &a.Arquivo, &caminho, &a.Tipo, &a.Status,
			&a.Pessoa, &a.DataReuniao, &a.DataArquivo, &a.Bytes, &a.Motivo); err != nil {
			return nil, err
		}
		// A pasta é o que dá contexto na fila: "Fulano/Feedback" diz muito
		// mais do que o caminho absoluto, que é igual em todas as linhas.
		a.Pasta = pastaRelativa(caminho)
		out = append(out, a)
	}
	return out, rows.Err()
}

// pastaRelativa devolve as duas últimas pastas do caminho.
func pastaRelativa(caminho string) string {
	limpo := strings.ReplaceAll(caminho, "\\", "/")
	partes := strings.Split(strings.Trim(limpo, "/"), "/")
	if len(partes) <= 1 {
		return ""
	}
	dirs := partes[:len(partes)-1]
	if len(dirs) > 2 {
		dirs = dirs[len(dirs)-2:]
	}
	return strings.Join(dirs, "/")
}

// marcarStatusArquivo muda o status de um arquivo da fila de importação.
//
// Só dois destinos são aceitos, e a restrição é o ponto:
//
//   - `ignorado`  — "não é material de 1:1, pare de me mostrar". É o que
//     resolve material de apoio, modelo em branco e arquivo solto na pasta.
//   - `pendente`  — desfaz o ignorar e devolve o arquivo para a fila.
//
// Deixar a tela escolher qualquer status permitiria marcar como `processado`
// um arquivo que nunca foi lido — o banco ficaria dizendo que a conversa está
// no sistema quando não está, e isso só apareceria na hora da calibragem.
func marcarStatusArquivo(ctx context.Context, db *sql.DB, tenantID, id int64, status string) error {
	if status != "ignorado" && status != "pendente" {
		return fmt.Errorf("status %q não pode ser definido pela tela", status)
	}
	res, err := db.ExecContext(ctx, `
		UPDATE source_files
		   SET status = $3,
		       -- Ao devolver para a fila, limpa o motivo antigo: ele descrevia
		       -- por que parou da última vez e confundiria na releitura.
		       motivo_revisao = CASE WHEN $3 = 'pendente' THEN NULL ELSE motivo_revisao END,
		       erro = CASE WHEN $3 = 'pendente' THEN NULL ELSE erro END
		 WHERE tenant_id = $1 AND id = $2`, tenantID, id, status)
	if err != nil {
		return fmt.Errorf("marcar arquivo %d: %w", id, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// slugDaURL devolve o último segmento do caminho.
func slugDaURL(caminho string) string {
	i := strings.LastIndex(caminho, "/")
	if i < 0 || i == len(caminho)-1 {
		return ""
	}
	s, err := url.PathUnescape(caminho[i+1:])
	if err != nil {
		return ""
	}
	return s
}

// atualizarCompromisso confirma o prazo ou muda a situação.
//
// A data só entra por aqui. O que a carga leu do texto fica em
// `prazo_sugerido`, e `prazo_date` é preenchida quando uma pessoa confirma —
// `prazo_confirmado_em` registra que houve decisão humana, e é ele que impede
// a releitura do arquivo de sobrescrever a escolha depois.
//
// Concluir grava a data: "concluído quando?" é pergunta que aparece na
// retrospectiva do ciclo, e sem a data a resposta é "em algum momento".
func atualizarCompromisso(ctx context.Context, db *sql.DB, tenantID, id int64,
	prazo, status string) error {

	if status != "" && status != "aberto" && status != "em_andamento" &&
		status != "concluido" {
		return fmt.Errorf("situação %q não existe", status)
	}
	if prazo != "" {
		if _, err := time.Parse("2006-01-02", prazo); err != nil {
			return fmt.Errorf("data %q não é uma data", prazo)
		}
	}

	res, err := db.ExecContext(ctx, `
		UPDATE action_items
		   SET prazo_date = CASE WHEN $3 <> '' THEN $3::date ELSE prazo_date END,
		       prazo_vago = CASE WHEN $3 <> '' THEN FALSE ELSE prazo_vago END,
		       prazo_confirmado_em = CASE WHEN $3 <> '' THEN now()
		                                  ELSE prazo_confirmado_em END,
		       status = CASE WHEN $4 <> '' THEN $4 ELSE status END,
		       concluido_em = CASE WHEN $4 = 'concluido' THEN CURRENT_DATE
		                           WHEN $4 <> '' THEN NULL
		                           ELSE concluido_em END
		 WHERE tenant_id = $1 AND id = $2`, tenantID, id, prazo, status)
	if err != nil {
		return fmt.Errorf("atualizar compromisso %d: %w", id, err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}

// atribuirPessoa registra de quem é o arquivo quando a carga não soube dizer.
//
// Era a metade que faltava da revisão manual: a tela sabia dizer "não
// identifiquei de quem é" e não oferecia nenhuma saída — o arquivo ficava ali,
// acusando um problema que não dava para resolver em lugar nenhum.
//
// A escolha é gravada no ARQUIVO, não como apelido do nome. A diferença
// importa: "este arquivo é da Fulana" é um fato que quem leu o arquivo
// verificou; "toda vez que aparecer este nome é a Fulana" é uma regra geral,
// que o coordenador não foi perguntado se queria criar. A carga respeita a
// escolha por cima de qualquer heurística, inclusive nas próximas passadas.
//
// Volta para `pendente` de propósito: o arquivo precisa ser lido de novo para
// virar conteúdo. Quem clica resolve a pendência de identificação, e a próxima
// varredura faz o resto.
// A pessoa vem por slug e não por id porque é assim que o front a identifica
// em todas as telas; expor o id só aqui criaria uma segunda identidade para a
// mesma coisa, e seria a única rota que depende dela.
func atribuirPessoa(ctx context.Context, db *sql.DB, tenantID, id int64, slug string) error {
	res, err := db.ExecContext(ctx, `
		UPDATE source_files sf
		   SET person_id = p.id, pessoa_manual = TRUE,
		       status = 'pendente', erro = NULL, motivo_revisao = NULL
		  FROM people p
		 WHERE sf.tenant_id = $1 AND sf.id = $2
		   AND p.tenant_id = $1 AND p.slug = $3`, tenantID, id, slug)
	if err != nil {
		return fmt.Errorf("atribuir pessoa ao arquivo %d: %w", id, err)
	}
	// Zero linhas aqui é ambíguo entre arquivo inexistente e slug que não
	// existe — e as duas são o mesmo erro para quem chama: não deu para ligar
	// um ao outro.
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}
	return nil
}
