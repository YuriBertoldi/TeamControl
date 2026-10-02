package ingest

// Parser dos registros de 1:1 em Markdown.
//
// Os 28 arquivos já existem e são regulares — isto é parse, não geração, e
// não precisa de LLM nenhum. É também a carga de maior retorno: cada arquivo
// traz quatro coisas que hoje só existem como prosa dentro dele (as três
// partes do registro, a avaliação do formulário, os encaminhamentos e as
// omissões deliberadas) e que separadas viram board, timeline e insumo de AVD.
//
// Formato confirmado nos arquivos reais:
//
//	# 1:1 — <Nome Completo> — DD/MM/AAAA
//	**Coordenador:** ... / **Duração:** N minutos / **Fonte:** ...
//	# Parte 1 — Registro compartilhável
//	  **Participantes:** / **Data:** / **Tema:**
//	  ## Resumo / ## Pontos discutidos / ## Feedback ...
//	  ## Encaminhamentos (action items)  → tabela
//	  ## Para a próxima conversa
//	# Parte 2 — Registro privado do coordenador
//	# Avaliação do 1:1 — TeamGuide
//	  **1. Performance:** `Excepcional`
//	  **2. Impacto: ...** `5`
//	# Omitido de propósito → tabela
//
// Uma variante real tem só a Parte 1 e cabeçalho `# Registro de 1:1`
// (sufixo `_compartilhavel` no nome). O parser trata isso como ausência
// das outras partes, não como erro.

import (
	"bufio"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
)

var (
	reTituloReg = regexp.MustCompile(`^#\s*1:1\s*[—-]\s*(.+?)\s*[—-]\s*(\d{2})/(\d{2})/(\d{4})`)
	reCampo     = regexp.MustCompile(`^\*\*([^:*]+):\*\*\s*(.*)$`)
	reDataBR    = regexp.MustCompile(`(\d{2})/(\d{2})/(\d{4})`)
	reDuracao   = regexp.MustCompile(`(\d+)\s*minutos?`)
	rePerf      = regexp.MustCompile("(?i)\\*\\*1\\.\\s*Performance:\\*\\*\\s*`([^`]+)`")
	reImpacto   = regexp.MustCompile("(?i)\\*\\*2\\.\\s*Impacto[^*]*\\*\\*\\s*`(\\d)`")
	reLinhaTab  = regexp.MustCompile(`^\|(.+)\|\s*$`)
	reSepTab    = regexp.MustCompile(`^\|[\s:|-]+\|?\s*$`)
)

// Encaminhamento é uma linha da tabela de action items.
type Encaminhamento struct {
	Responsavel string
	Descricao   string
	PrazoTexto  string
}

// Omissao é uma linha da tabela "Omitido de propósito".
//
// Guardar o que foi cortado, sem o conteúdo, é o que permite ao coordenador
// lembrar meses depois que havia algo ali e por que não circulou.
type Omissao struct {
	Item   string
	Onde   string
	Motivo string
}

// Registro é o conteúdo estruturado de um arquivo de 1:1.
type Registro struct {
	NomeBruto  string // como aparece no título — entra no resolvedor de pessoa
	Data       string // ISO
	DuracaoMin int
	Tema       string
	Resumo     string
	Fonte      string

	Compartilhavel string // markdown da Parte 1
	Privado        string // markdown da Parte 2
	Avaliacao      string // markdown da avaliação

	Performance          string // precisa_melhorar · satisfatoria · excepcional
	PerfJustificativa    string
	Impacto              int
	ImpactoJustificativa string

	Encaminhamentos []Encaminhamento
	Omissoes        []Omissao
	ProximaConversa []string
}

var performanceCanonica = map[string]string{
	"precisa melhorar": "precisa_melhorar",
	"satisfatória":     "satisfatoria",
	"satisfatoria":     "satisfatoria",
	"excepcional":      "excepcional",
}

// ParseRegistro lê um registro de 1:1.
//
// Recusa arquivo sem data: sem ela não dá para pendurar na linha do tempo nem
// casar com a transcrição, e gravar uma reunião sem data cria um furo que só
// aparece meses depois, na AVD.
func ParseRegistro(r io.Reader) (*Registro, error) {
	reg := &Registro{}

	// Seções de nível 1 viram blocos; o resto é acumulado dentro da seção
	// corrente. Guardar o markdown inteiro de cada parte é o que permite
	// reexibir o registro exatamente como foi escrito.
	var secao string
	blocos := map[string]*strings.Builder{}
	bloco := func(nome string) *strings.Builder {
		if blocos[nome] == nil {
			blocos[nome] = &strings.Builder{}
		}
		return blocos[nome]
	}

	var subsecao string
	var linhasTabela []string

	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 1<<20), 1<<22) // registros passam de 64KB

	for sc.Scan() {
		linha := sc.Text()
		corte := strings.TrimSpace(linha)

		if m := reTituloReg.FindStringSubmatch(corte); m != nil {
			reg.NomeBruto = strings.TrimSpace(m[1])
			reg.Data = fmt.Sprintf("%s-%s-%s", m[4], m[3], m[2])
			continue
		}

		if strings.HasPrefix(corte, "# ") {
			secao = classificarSecao(corte)
			subsecao = ""
			continue
		}
		if strings.HasPrefix(corte, "## ") {
			// Fecha a tabela que estava aberta antes de trocar de subseção.
			reg.absorverTabela(subsecao, secao, linhasTabela)
			linhasTabela = nil
			subsecao = strings.ToLower(strings.TrimPrefix(corte, "## "))
		}

		if m := reCampo.FindStringSubmatch(corte); m != nil {
			switch strings.ToLower(strings.TrimSpace(m[1])) {
			case "data":
				if d := reDataBR.FindStringSubmatch(m[2]); d != nil && reg.Data == "" {
					reg.Data = fmt.Sprintf("%s-%s-%s", d[3], d[2], d[1])
				}
			case "duração", "duracao":
				if d := reDuracao.FindStringSubmatch(m[2]); d != nil {
					reg.DuracaoMin, _ = strconv.Atoi(d[1])
				}
			case "tema":
				reg.Tema = strings.TrimSpace(m[2])
			case "fonte":
				reg.Fonte = strings.TrimSpace(m[2])
			case "participantes":
				if reg.NomeBruto == "" {
					reg.NomeBruto = liderado(m[2])
				}
			}
		}

		if m := rePerf.FindStringSubmatch(corte); m != nil {
			reg.Performance = performanceCanonica[strings.ToLower(strings.TrimSpace(m[1]))]
		}
		if m := reImpacto.FindStringSubmatch(corte); m != nil {
			reg.Impacto, _ = strconv.Atoi(m[1])
		}

		// Tabelas: acumula e resolve quando a subseção fecha.
		if reLinhaTab.MatchString(corte) && !reSepTab.MatchString(corte) {
			linhasTabela = append(linhasTabela, corte)
		}

		if strings.HasPrefix(corte, "- ") && subsecao == "para a próxima conversa" {
			reg.ProximaConversa = append(reg.ProximaConversa,
				strings.TrimSpace(strings.TrimPrefix(corte, "- ")))
		}

		if secao != "" {
			bloco(secao).WriteString(linha)
			bloco(secao).WriteString("\n")
		}
		if subsecao == "resumo" && corte != "" && !strings.HasPrefix(corte, "#") {
			if reg.Resumo == "" {
				reg.Resumo = corte
			}
		}
	}
	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("ler registro: %w", err)
	}
	reg.absorverTabela(subsecao, secao, linhasTabela)

	if reg.Data == "" {
		return nil, fmt.Errorf("registro sem data: não dá para pendurar na linha do tempo")
	}

	reg.Compartilhavel = strings.TrimSpace(bloco("compartilhavel").String())
	reg.Privado = strings.TrimSpace(bloco("privado").String())
	reg.Avaliacao = strings.TrimSpace(bloco("avaliacao").String())
	reg.PerfJustificativa = citacaoApos(reg.Avaliacao, "1. Performance")
	reg.ImpactoJustificativa = citacaoApos(reg.Avaliacao, "2. Impacto")

	return reg, nil
}

// classificarSecao mapeia o título de nível 1 para um bloco conhecido.
func classificarSecao(titulo string) string {
	t := strings.ToLower(titulo)
	switch {
	case strings.Contains(t, "parte 1"), strings.Contains(t, "registro de 1:1"):
		return "compartilhavel"
	case strings.Contains(t, "parte 2"):
		return "privado"
	case strings.Contains(t, "avaliação do 1:1"), strings.Contains(t, "avaliacao do 1:1"):
		return "avaliacao"
	case strings.Contains(t, "omitido"):
		return "omitido"
	}
	return ""
}

// absorverTabela transforma as linhas acumuladas na estrutura da seção certa.
func (reg *Registro) absorverTabela(subsecao, secao string, linhas []string) {
	if len(linhas) == 0 {
		return
	}
	celulas := func(l string) []string {
		partes := strings.Split(strings.Trim(l, "|"), "|")
		for i := range partes {
			partes[i] = strings.TrimSpace(partes[i])
		}
		return partes
	}
	// A primeira linha é o cabeçalho da tabela.
	for i, l := range linhas {
		c := celulas(l)
		if i == 0 || len(c) < 3 {
			continue
		}
		switch {
		case strings.Contains(subsecao, "encaminhamento"):
			reg.Encaminhamentos = append(reg.Encaminhamentos, Encaminhamento{
				Responsavel: c[0], Descricao: c[1], PrazoTexto: c[2],
			})
		case secao == "omitido":
			reg.Omissoes = append(reg.Omissoes, Omissao{
				Item: c[0], Onde: c[1], Motivo: c[2],
			})
		}
	}
}

// liderado extrai o nome do liderado de "Fulano e Beltrano".
//
// O coordenador é sempre o primeiro na convenção dos arquivos, então o
// liderado é o que vem depois do " e ".
func liderado(participantes string) string {
	if i := strings.LastIndex(participantes, " e "); i >= 0 {
		return strings.TrimSpace(participantes[i+3:])
	}
	return strings.TrimSpace(participantes)
}

// citacaoApos devolve o bloco de citação (linhas com ">") que segue um rótulo.
//
// A justificativa da avaliação vem como blockquote logo depois da nota, e é
// ela que sustenta a nota na calibragem — guardar só a nota perde o argumento.
func citacaoApos(markdown, rotulo string) string {
	i := strings.Index(markdown, rotulo)
	if i < 0 {
		return ""
	}
	var b strings.Builder
	for _, l := range strings.Split(markdown[i:], "\n") {
		c := strings.TrimSpace(l)
		if !strings.HasPrefix(c, ">") {
			if b.Len() > 0 {
				break // acabou a citação
			}
			continue
		}
		c = strings.TrimSpace(strings.TrimPrefix(c, ">"))
		// Pula a linha-rótulo "**Aqui você pode detalhar mais...**".
		if c == "" || strings.HasPrefix(c, "**Aqui") {
			continue
		}
		if b.Len() > 0 {
			b.WriteString("\n")
		}
		b.WriteString(c)
	}
	return b.String()
}
