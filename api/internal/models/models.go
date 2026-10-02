// Package models define os tipos de domínio e, principalmente, o mecanismo que
// impede vazamento de informação entre audiências.
package models

import "fmt"

// Confidencialidade classifica todo registro textual do sistema.
// O default é sempre o mais restritivo: esquecer de classificar nunca vaza.
type Confidencialidade string

const (
	ConfPublicoLiderado    Confidencialidade = "publico_liderado"
	ConfRHCalibragem       Confidencialidade = "rh_calibragem"
	ConfPrivadoCoordenador Confidencialidade = "privado_coordenador"
	ConfRestritoSaude      Confidencialidade = "restrito_saude"
)

// Nivel converte a confidencialidade em escala numérica linear.
func (c Confidencialidade) Nivel() int {
	switch c {
	case ConfPublicoLiderado:
		return 1
	case ConfRHCalibragem:
		return 2
	case ConfPrivadoCoordenador:
		return 3
	case ConfRestritoSaude:
		return 4
	}
	return 4 // desconhecido é tratado como o mais restrito
}

// Audiencia é quem vai ler. É um tipo próprio, sem zero value utilizável, para
// que toda consulta de leitura seja obrigada a declarar para quem está lendo.
type Audiencia string

const (
	AudLiderado    Audiencia = "liderado"
	AudRH          Audiencia = "rh"
	AudCoordenador Audiencia = "coordenador"
)

// NivelMax é o teto que a audiência enxerga. O nível 4 (restrito_saude) não é
// alcançável por audiência nenhuma — só por leitura direta na tela, com flag
// explícita e registro em access_log.
func (a Audiencia) NivelMax() (int, error) {
	switch a {
	case AudLiderado:
		return 1, nil
	case AudRH:
		return 2, nil
	case AudCoordenador:
		return 3, nil
	}
	return 0, fmt.Errorf("audiência inválida ou não informada: %q", a)
}

// Scope acompanha TODA consulta de leitura que devolve texto.
//
// É o coração do controle de confidencialidade: o filtro acontece aqui, no
// servidor, antes de qualquer LLM ver o dado. Prompt não eleva teto — a
// consulta simplesmente não traz o que está acima dele.
type Scope struct {
	TenantID int64
	UserID   int64
	Aud      Audiencia
	// IncluirSaude só vem de uma ação explícita na interface, nunca de MCP ou API.
	IncluirSaude bool
}

func (s Scope) Validate() error {
	if s.TenantID == 0 {
		return fmt.Errorf("scope sem tenant")
	}
	if _, err := s.Aud.NivelMax(); err != nil {
		return err
	}
	return nil
}

// FiltroSQL devolve o predicado e os argumentos que toda query de leitura deve
// concatenar. Centralizado de propósito: se a regra existir em três lugares,
// uma delas vai estar errada, e será justamente a que vaza.
func (s Scope) FiltroSQL(coluna string) (string, []any, error) {
	if err := s.Validate(); err != nil {
		return "", nil, err
	}
	max, err := s.Aud.NivelMax()
	if err != nil {
		return "", nil, err
	}
	// Pedir saúde com audiência que não é a de coordenador é erro de
	// programação, e erro de programação em código de confidencialidade tem
	// que ser barulhento.
	//
	// Hoje o teto da audiência já barraria o nível 4 sozinho, então ignorar o
	// pedido seria seguro. Mas é segurança por coincidência: basta alguém
	// acrescentar uma audiência com teto 4 para a flag passar a valer, e aí o
	// vazamento nasce de uma linha que parecia inofensiva.
	if s.IncluirSaude && s.Aud != AudCoordenador {
		return "", nil, fmt.Errorf(
			"audiência %q não pode solicitar dado de saúde", s.Aud)
	}
	sql := fmt.Sprintf(
		" AND nivel_visibilidade(%s) <= $%%d AND (nivel_visibilidade(%s) < 4 OR $%%d) ",
		coluna, coluna)
	return sql, []any{max, s.IncluirSaude}, nil
}

/* ---------- domínio ---------- */

type Familia string

const (
	FamDesenvolvimento Familia = "desenvolvimento"
	FamTestesQA        Familia = "testes_qa"
	FamProduto         Familia = "produto"
	FamLideranca       Familia = "lideranca"
)

type StatusPessoa string

const (
	StatusAtivo      StatusPessoa = "ativo"
	StatusAfastado   StatusPessoa = "afastado"
	StatusForaGestao StatusPessoa = "fora_gestao"
	StatusDesligado  StatusPessoa = "desligado"
)

type Pessoa struct {
	ID                int64        `json:"id"`
	TenantID          int64        `json:"-"`
	Slug              string       `json:"slug"`
	NomeCompleto      string       `json:"nome"`
	NomeCurto         string       `json:"curto"`
	Familia           Familia      `json:"familia"`
	Cargo             string       `json:"cargo"`
	EhTechLead        bool         `json:"techLead"`
	QADe              *string      `json:"qaDe,omitempty"`
	DataAdmissao      *string      `json:"admissao,omitempty"`
	DataDesligamento  *string      `json:"desligamento,omitempty"`
	Status            StatusPessoa `json:"status"`
	MotivoAfastamento *string      `json:"motivoAfastamento,omitempty"`
	RetornoPrevisto   *string      `json:"retornoPrevisto,omitempty"`
	PortalID          *string      `json:"portalId,omitempty"`
	SquadID           *int64       `json:"squadId,omitempty"`
	CadenciaDias      int          `json:"cadenciaDias"`
}

// Elegivel aplica o corte do ciclo de avaliação: tempo mínimo de casa e não
// desligado. É função e não coluna para o estado não congelar no banco.
func (p Pessoa) Elegivel(corte string, mesesMinimos int) bool {
	if p.Status == StatusDesligado || p.DataAdmissao == nil {
		return false
	}
	return mesesDesde(*p.DataAdmissao, corte) >= mesesMinimos
}

type Tribo struct {
	ID          int64    `json:"id"`
	TenantID    int64    `json:"-"`
	Nome        string   `json:"nome"`
	Cor         string   `json:"cor"`
	Produto     string   `json:"produto"`
	PortalID    *string  `json:"portalId,omitempty"`
	Coordenacao []string `json:"coordenacao"`
	Gerencia    []string `json:"gerencia"`
}

type Squad struct {
	ID          int64    `json:"id"`
	TenantID    int64    `json:"-"`
	TriboID     int64    `json:"triboId"`
	Nome        string   `json:"nome"`
	TechLeadID  *int64   `json:"techLeadId,omitempty"`
	Coordenacao []string `json:"coordenacao"`
}

type TipoFonte string

const (
	FonteTactiqTxt      TipoFonte = "tactiq_txt"
	FonteGeminiNotas    TipoFonte = "gemini_notes_pdf"
	FonteGeminiTranscr  TipoFonte = "gemini_transcript_pdf"
	FonteRegistroMD     TipoFonte = "registro_md"
	FonteDossieMD       TipoFonte = "dossie_md"
	FonteRascunhoAVDMD  TipoFonte = "rascunho_avd_md"
	FonteMaterialAVDPDF TipoFonte = "material_avd_pdf"
	FonteColado         TipoFonte = "colado"
	FonteDesconhecido   TipoFonte = "desconhecido"
)

type StatusFonte string

const (
	FontePendente      StatusFonte = "pendente"
	FonteProcessado    StatusFonte = "processado"
	FonteRevisaoManual StatusFonte = "revisao_manual"
	FonteIgnorado      StatusFonte = "ignorado"
	FonteErro          StatusFonte = "erro"
)

type ArquivoFonte struct {
	ID            int64       `json:"id"`
	TenantID      int64       `json:"-"`
	Caminho       string      `json:"caminho"`
	NomeArquivo   string      `json:"arquivo"`
	SHA256        string      `json:"sha256"`
	Bytes         int64       `json:"bytes"`
	Tipo          TipoFonte   `json:"tipo"`
	Status        StatusFonte `json:"status"`
	Erro          *string     `json:"erro,omitempty"`
	MeetingID     *int64      `json:"meetingId,omitempty"`
	PessoaID      *int64      `json:"pessoaId,omitempty"`
	DataReuniao   *string     `json:"dataReuniao,omitempty"`
	DataArquivo   *string     `json:"dataArquivo,omitempty"`
	MotivoRevisao *string     `json:"motivo,omitempty"`
}

type Meeting struct {
	ID              int64   `json:"id"`
	TenantID        int64   `json:"-"`
	PessoaID        int64   `json:"pessoaId"`
	Tipo            string  `json:"tipo"`
	Data            string  `json:"data"`
	HoraInicio      *string `json:"horaInicio,omitempty"`
	DuracaoMin      *int    `json:"duracaoMin,omitempty"`
	Titulo          *string `json:"titulo,omitempty"`
	DataArquivo     *string `json:"dataArquivo,omitempty"`
	DivergenciaData bool    `json:"divergenciaData"`
	PortalMeeting   *string `json:"portalMeetingId,omitempty"`
}

type LinhaTranscricao struct {
	Ord           int
	TSOffsetSeg   *int
	FalanteRaw    string
	EhCoordenador bool
	Texto         string
	CharInicio    int
	CharFim       int
	Ruido         bool
}

type MeetingSource struct {
	ID                int64              `json:"id"`
	MeetingID         int64              `json:"meetingId"`
	ArquivoFonteID    *int64             `json:"arquivoFonteId,omitempty"`
	Fonte             string             `json:"fonte"`
	Kind              string             `json:"kind"`
	Texto             string             `json:"-"`
	TextoSHA256       string             `json:"textoSha256"`
	Extrator          string             `json:"extrator"`
	QualidadeExtracao string             `json:"qualidade"`
	URLOriginal       *string            `json:"urlOriginal,omitempty"`
	Confidencialidade Confidencialidade  `json:"confidencialidade"`
	Linhas            []LinhaTranscricao `json:"-"`
}

type Registro struct {
	ID                int64             `json:"id"`
	MeetingID         int64             `json:"meetingId"`
	Formato           string            `json:"formato"`
	Confidencialidade Confidencialidade `json:"confidencialidade"`
	Versao            int               `json:"versao"`
	Markdown          string            `json:"markdown"`
	Resumo            *string           `json:"resumo,omitempty"`
	Tema              *string           `json:"tema,omitempty"`
	GeradoPor         string            `json:"geradoPor"`
	ArquivoOrigem     *string           `json:"arquivoOrigem,omitempty"`
}

type Compromisso struct {
	ID                int64             `json:"id"`
	TenantID          int64             `json:"-"`
	PessoaID          int64             `json:"pessoaId"`
	MeetingID         *int64            `json:"meetingId,omitempty"`
	ResponsavelTipo   string            `json:"responsavelTipo"`
	ResponsavelNome   string            `json:"responsavelNome"`
	Descricao         string            `json:"descricao"`
	PrazoTexto        string            `json:"prazoTexto"`
	PrazoDate         *string           `json:"prazoDate,omitempty"`
	Status            string            `json:"status"`
	Herdado           int               `json:"herdado"`
	Confidencialidade Confidencialidade `json:"confidencialidade"`
	HashDedupe        string            `json:"-"`
}

type AvaliacaoMensal struct {
	MeetingID                int64             `json:"meetingId"`
	Performance              string            `json:"performance"`
	PerformanceJustificativa *string           `json:"performanceJustificativa,omitempty"`
	Impacto                  *int              `json:"impacto,omitempty"`
	ImpactoJustificativa     *string           `json:"impactoJustificativa,omitempty"`
	Origem                   string            `json:"origem"`
	Confidencialidade        Confidencialidade `json:"confidencialidade"`
}

type Omissao struct {
	MeetingID         int64             `json:"meetingId"`
	Item              string            `json:"item"`
	OndeOmitido       string            `json:"ondeOmitido"`
	Motivo            string            `json:"motivo"`
	Confidencialidade Confidencialidade `json:"confidencialidade"`
}
