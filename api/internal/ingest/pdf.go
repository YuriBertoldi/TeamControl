package ingest

// Extração dos PDFs do Gemini.
//
// Duas formas chegam da ferramenta, e elas não são a mesma coisa:
//
//	"… - Anotações do Gemini.pdf"  resumo, decisões, próximas etapas e um bloco
//	                              "Detalhes" com marcação de tempo (00:12:27)
//	"… - Transcript.pdf"          a transcrição corrida, "Falante: fala"
//
// # Por que pdftotext e não um leitor em Go puro
//
// Testei `github.com/dslipak/pdf` contra estes arquivos: ele até devolve o
// texto com acento correto, mas **sem quebra de linha nenhuma** — "Ciclo de
// Desempenho Contmatic1ª Fase" sai colado. Para prosa isso seria feio; aqui é
// fatal, porque toda a informação que interessa está na ESTRUTURA: a linha da
// data, o cabeçalho de seção, um item de "Próximas etapas" por linha. Sem
// quebra não há o que parsear. Também levou ~2 minutos para quatro arquivos.
//
// `pdftotext -layout` devolve a estrutura preservada em milissegundos, já está
// no Dockerfile (poppler-utils) e é ferramenta padrão. A dependência Go foi
// removida do go.mod.
//
// # O que acontece quando o pdftotext não existe
//
// O arquivo fica pendente com o motivo registrado. NÃO há fallback para um
// extrator pior: texto embaralhado entra no banco parecendo dado bom, vira
// fonte de citação e só se descobre o problema quando alguém clica numa
// evidência e lê bobagem.

import (
	"fmt"
	"os/exec"
	"regexp"
	"strconv"
	"strings"
	"unicode"

	"teamcontrol/internal/models"
)

var (
	// "set. 22, 2026" — a data que o Gemini imprime no corpo do documento.
	// É a data do CONTEÚDO, e é o que permite flagrar o arquivo cujo nome foi
	// digitado errado.
	reDataGeminiCorpo = regexp.MustCompile(`(?i)^(\p{L}{3})\.?\s+(\d{1,2}),\s*(\d{4})$`)

	// "convidado FULANO DE TAL" — fonte mais confiável do nome que o título,
	// que quebra em três linhas.
	reConvidado = regexp.MustCompile(`(?i)^convidado\s+(.+)$`)

	// "[Fulano de Tal] Fazer coisa: descrição da coisa."
	reEtapa = regexp.MustCompile(`^\s*\S?\s*\[([^\]]+)\]\s*(.+)$`)

	// "Fulano de Tal: o que ele disse" no PDF de transcrição.
	reFalaPDF = regexp.MustCompile(`^([^:]{2,80}?):\s*(.+)$`)

	// "(00:12:27)" — âncora de tempo dentro do bloco Detalhes.
	reMarcaTempo = regexp.MustCompile(`\((\d{2}):(\d{2}):(\d{2})\)`)
)

// ExtrairTextoPDF roda o pdftotext e devolve o texto e o extrator usado.
//
// `-layout` preserva a disposição das colunas, que é o que mantém cada item de
// lista na sua própria linha. `-enc UTF-8` é obrigatório: sem ele o acento sai
// em Latin-1 e "Reunião" vira lixo no banco.
func ExtrairTextoPDF(caminho string) (string, string, error) {
	cmd := exec.Command("pdftotext", "-layout", "-enc", "UTF-8", caminho, "-")
	saida, err := cmd.Output()
	if err != nil {
		return "", "", fmt.Errorf("pdftotext: %w", err)
	}
	// CRLF some aqui, e não na hora de gravar: os offsets de evidência apontam
	// para o texto canônico, e uma normalização feita depois os deslocaria.
	return strings.ReplaceAll(string(saida), "\r\n", "\n"), "pdftotext", nil
}

// PdftotextDisponivel diz se a ferramenta está no PATH.
func PdftotextDisponivel() bool {
	_, err := exec.LookPath("pdftotext")
	return err == nil
}

// QualidadeExtracao avalia se o texto extraído presta.
//
// PDF digital bem formado passa folgado; PDF escaneado ou com fonte embutida
// estranha reprova. O ponto de ter a checagem é não gravar meia página de
// símbolos como se fosse a conversa — é o tipo de dado ruim que ninguém revisa
// porque parece preenchido.
//
// Devolve "ok" | "parcial" | "falhou" e o motivo quando não é ok.
func QualidadeExtracao(texto string) (string, string) {
	runas := []rune(texto)
	if len(runas) < 200 {
		return "falhou", fmt.Sprintf("texto curto demais (%d caracteres)", len(runas))
	}
	letras := 0
	for _, c := range runas {
		if unicode.IsLetter(c) {
			letras++
		}
	}
	razao := float64(letras) / float64(len(runas))
	quebras := strings.Count(texto, "\n")

	switch {
	case razao < 0.45:
		return "falhou", fmt.Sprintf("proporção de letras baixa (%.0f%%) — provável PDF escaneado", razao*100)
	case quebras < 4:
		return "falhou", "sem quebras de linha — a estrutura do documento se perdeu"
	case razao < 0.55:
		return "parcial", fmt.Sprintf("proporção de letras limítrofe (%.0f%%)", razao*100)
	}
	return "ok", ""
}

/* ---------- anotações do Gemini ---------- */

// EtapaGemini é um item de "Próximas etapas".
type EtapaGemini struct {
	Responsavel string
	Descricao   string
}

// NotasGemini é o conteúdo estruturado de um PDF de anotações.
type NotasGemini struct {
	Participante string
	DataConteudo string // ISO, lida do corpo
	Resumo       string
	Etapas       []EtapaGemini
	Texto        string // o extraído inteiro, normalizado
	Marcacoes    int    // quantas âncoras (00:00:00) o documento traz
}

// ParseGeminiNotas lê um PDF de "Anotações do Gemini" já extraído.
func ParseGeminiNotas(texto string) (*NotasGemini, error) {
	n := &NotasGemini{Texto: texto}

	var secao string
	var resumo []string

	for _, bruta := range strings.Split(texto, "\n") {
		linha := strings.TrimSpace(bruta)
		if linha == "" {
			continue
		}

		if n.DataConteudo == "" {
			if m := reDataGeminiCorpo.FindStringSubmatch(linha); m != nil {
				if mes := mesesPT[strings.ToLower(m[1])]; mes > 0 {
					dia, _ := strconv.Atoi(m[2])
					n.DataConteudo = fmt.Sprintf("%s-%02d-%02d", m[3], mes, dia)
					continue
				}
			}
		}
		if m := reConvidado.FindStringSubmatch(linha); m != nil && n.Participante == "" {
			n.Participante = strings.TrimSpace(m[1])
			continue
		}

		// Cabeçalhos de seção vêm sozinhos na linha, sem pontuação.
		switch strings.ToLower(strings.Trim(linha, " :")) {
		case "resumo":
			secao = "resumo"
			continue
		case "decisões", "decisoes":
			secao = "decisoes"
			continue
		case "próximas etapas", "proximas etapas":
			secao = "etapas"
			continue
		case "detalhes":
			secao = "detalhes"
			continue
		}

		switch secao {
		case "resumo":
			resumo = append(resumo, linha)
		case "etapas":
			if m := reEtapa.FindStringSubmatch(bruta); m != nil {
				n.Etapas = append(n.Etapas, EtapaGemini{
					Responsavel: strings.TrimSpace(m[1]),
					Descricao:   strings.TrimSpace(m[2]),
				})
			} else if k := len(n.Etapas); k > 0 {
				// Continuação da etapa anterior: o layout quebra a descrição
				// em várias linhas, e cortar no primeiro \n perderia metade.
				n.Etapas[k-1].Descricao += " " + linha
			}
		}
	}

	n.Resumo = strings.Join(resumo, " ")
	n.Marcacoes = len(reMarcaTempo.FindAllString(texto, -1))

	if n.Participante == "" {
		return nil, fmt.Errorf("não identifiquei o convidado nas anotações")
	}
	return n, nil
}

/* ---------- transcrição do Gemini ---------- */

// ParseGeminiTranscricao lê um PDF de transcrição e devolve a mesma estrutura
// da do Tactiq.
//
// Reusar `Transcricao` não é economia de digitação: é o que faz as duas fontes
// gravarem pelo mesmo caminho, com o mesmo texto canônico e os mesmos offsets.
// Dois formatos de armazenamento para a mesma coisa é como se descobre, seis
// meses depois, que metade das citações não abre.
//
// A diferença real: este formato não traz marcação de tempo por fala, então
// `TSOffsetSeg` fica nulo. Nulo é honesto; zero diria "minuto zero".
func ParseGeminiTranscricao(texto, nomeCoordenador string) (*Transcricao, error) {
	t := &Transcricao{Coordenador: nomeCoordenador}

	var canonico strings.Builder
	var emTranscricao bool
	var participantes []string

	// A fala quebra em várias linhas no layout. O turno é acumulado inteiro e
	// só então escrito — se eu escrevesse linha a linha, o texto canônico
	// ficaria com "\n" onde `Texto` tem espaço, e o offset passaria a apontar
	// para um trecho que não bate com a citação. Foi o que o teste pegou.
	var falanteAtual string
	var partes []string

	fechar := func() {
		if falanteAtual == "" {
			return
		}
		fala := strings.Join(partes, " ")
		prefixo := falanteAtual + ": "
		inicio := canonico.Len() + len(prefixo)
		canonico.WriteString(prefixo + fala + "\n")

		t.Linhas = append(t.Linhas, models.LinhaTranscricao{
			Ord:           len(t.Linhas) + 1,
			FalanteRaw:    falanteAtual,
			EhCoordenador: normalizaSimples(falanteAtual) == normalizaSimples(nomeCoordenador),
			Texto:         fala,
			CharInicio:    inicio,
			CharFim:       inicio + len(fala),
			Ruido:         reRuido.MatchString(fala),
		})
		falanteAtual, partes = "", nil
	}

	for _, bruta := range strings.Split(texto, "\n") {
		linha := strings.TrimSpace(bruta)

		if t.TituloBruto == "" && strings.Contains(linha, "<>") {
			t.TituloBruto = linha
		}
		if linha == "" {
			continue
		}

		baixa := strings.ToLower(strings.Trim(linha, " :"))
		if baixa == "transcrição" || baixa == "transcricao" {
			emTranscricao = true
			continue
		}
		if baixa == "participantes" {
			emTranscricao = false
			continue
		}
		if !emTranscricao {
			if len(participantes) == 0 && strings.Contains(linha, ",") {
				for _, p := range strings.Split(linha, ",") {
					if p = strings.TrimSpace(p); p != "" {
						participantes = append(participantes, p)
					}
				}
			}
			continue
		}

		if m := reFalaPDF.FindStringSubmatch(linha); m != nil {
			fechar()
			falanteAtual = strings.TrimSpace(m[1])
			partes = []string{strings.TrimSpace(m[2])}
			continue
		}
		if falanteAtual != "" {
			partes = append(partes, linha)
		}
	}
	fechar()

	t.TextoCanonico = canonico.String()
	if len(t.Linhas) == 0 {
		return nil, fmt.Errorf("nenhuma fala reconhecida — não parece transcrição do Gemini")
	}

	t.Participante = participanteDaTranscricao(t.TituloBruto, participantes, nomeCoordenador)
	if t.Participante == "" {
		return nil, fmt.Errorf(
			"não dá para dizer de quem é esta conversa (%d participantes) — vai para revisão",
			len(participantes))
	}
	return t, nil
}

// participanteDaTranscricao decide de quem é a conversa.
//
// Ordem deliberada, e o último caso importa mais que os dois primeiros:
//
//  1. O título "FULANO <> COORDENAÇÃO - Reunião 1-1" é explícito sobre a dupla.
//  2. Com exatamente duas pessoas na lista, o liderado é quem não é o líder.
//  3. **Com três ou mais, devolve vazio.** Há PDF de apresentação em grupo
//     nesta pasta, e chutar o primeiro nome penduraria a reunião inteira — com
//     a fala de todo mundo — na pessoa errada. Evidência no histórico de quem
//     não participou é pior do que evidência nenhuma, porque ninguém desconfia.
func participanteDaTranscricao(titulo string, participantes []string, coordenador string) string {
	if i := strings.Index(titulo, "<>"); i > 0 {
		if nome := strings.TrimSpace(titulo[:i]); nome != "" {
			return nome
		}
	}
	if len(participantes) == 2 {
		coord := normalizaSimples(coordenador)
		for _, p := range participantes {
			if normalizaSimples(p) != coord {
				return p
			}
		}
	}
	return ""
}

// normalizaSimples deixa o nome comparável: sem acento, maiúsculo, sem espaço
// duplicado. Só para comparar strings em memória — o que vai ao banco usa a
// `normaliza_nome()` do Postgres.
func normalizaSimples(s string) string {
	r := strings.NewReplacer(
		"á", "a", "à", "a", "â", "a", "ã", "a", "é", "e", "ê", "e", "í", "i",
		"ó", "o", "ô", "o", "õ", "o", "ú", "u", "ü", "u", "ç", "c",
	)
	return strings.Join(strings.Fields(r.Replace(strings.ToLower(s))), " ")
}
