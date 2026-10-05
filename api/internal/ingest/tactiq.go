// Package ingest lê os arquivos de registros-demo e os leva ao banco.
package ingest

import (
	"bufio"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"

	"teamcontrol/internal/models"
)

// Formato confirmado nos 40 arquivos reais (note a indentação de 2 espaços no
// bloco de cabeçalho):
//
//	# <NOME> <> COORDENACAO - Reunião 1-1
//	  Meeting started: 27/08/2026, 15:02:47
//	  Duration: 18 minutes
//	  Participants: Participante Exemplo, Coordenação
//	  [View original transcript](https://app.tactiq.io/...)
//	  ## Transcript
//	  00:00 Bruno Gonçalves Pereira Júnior: Tá com delay.
var (
	reTitulo = regexp.MustCompile(`^#\s*(.+?)\s*<>\s*(.+?)\s*-\s*(.+)$`)
	reInicio = regexp.MustCompile(`Meeting started:\s*(\d{2})/(\d{2})/(\d{4}),\s*(\d{2}:\d{2}:\d{2})`)
	reDur    = regexp.MustCompile(`Duration:\s*(\d+)\s*minutes?`)
	rePart   = regexp.MustCompile(`Participants:\s*(.+)$`)
	reURL    = regexp.MustCompile(`\[View original transcript\]\((https?://[^)]+)\)`)
	reLinha  = regexp.MustCompile(`^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s+([^:]{2,80}?):\s*(.*)$`)

	// A extensão do Tactiq injeta esta linha no meio da conversa e, pior,
	// atribuída ao coordenador. Marcar como ruído evita que ela vire evidência
	// e tira do cálculo de offsets.
	reRuido = regexp.MustCompile(`(?i)estou transcrevendo esta chamada|tactiq\.io/r/transcribing|i'm transcribing this call`)
)

type Transcricao struct {
	TituloBruto  string
	Participante string // o liderado: Participants menos o coordenador
	Coordenador  string
	Data         string // ISO
	HoraInicio   string
	DuracaoMin   int
	URLOriginal  string

	// Participantes é a lista crua do cabeçalho, na ordem em que o Tactiq
	// escreveu, e existe porque `Participante` sozinho mente quando o nome do
	// coordenador não está configurado: sem ter com quem comparar, sobra pegar
	// o primeiro da lista, e o Tactiq às vezes põe o coordenador primeiro.
	//
	// Guardar a lista inteira deixa quem chama tentar o segundo nome quando o
	// primeiro não resolve, e assim a carga para de depender de uma variável de
	// ambiente estar preenchida para acertar de quem é a conversa.
	Participantes []string

	// TextoCanonico é a concatenação normalizada "MM:SS Falante: fala\n".
	// Os offsets das evidências apontam para ELE, nunca para o arquivo bruto —
	// é o que impede CRLF e BOM de deslocarem citação.
	TextoCanonico string
	Linhas        []models.LinhaTranscricao
}

// ParseTactiq lê uma transcrição do Tactiq.
//
// nomeCoordenador é usado para três coisas: identificar o liderado na lista de
// participantes, marcar as falas do coordenador e detectar a linha de ruído.
func ParseTactiq(r io.Reader, nomeCoordenador string) (*Transcricao, error) {
	t := &Transcricao{Coordenador: nomeCoordenador}
	var sb strings.Builder
	coordNorm := normaliza(nomeCoordenador)

	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024) // falas longas estouram o default

	ord := 0
	for sc.Scan() {
		linha := strings.TrimRight(sc.Text(), "\r")

		if m := reTitulo.FindStringSubmatch(strings.TrimSpace(linha)); m != nil && t.TituloBruto == "" {
			t.TituloBruto = strings.TrimSpace(m[1])
			continue
		}
		if m := reInicio.FindStringSubmatch(linha); m != nil {
			t.Data = m[3] + "-" + m[2] + "-" + m[1]
			t.HoraInicio = m[4]
			continue
		}
		if m := reDur.FindStringSubmatch(linha); m != nil {
			t.DuracaoMin, _ = strconv.Atoi(m[1])
			continue
		}
		if m := rePart.FindStringSubmatch(linha); m != nil {
			for _, p := range strings.Split(m[1], ",") {
				p = strings.TrimSpace(p)
				if p == "" {
					continue
				}
				t.Participantes = append(t.Participantes, p)
				if t.Participante == "" && normaliza(p) != coordNorm {
					t.Participante = p // melhor fonte do nome: melhor que o arquivo
				}
			}
			continue
		}
		if m := reURL.FindStringSubmatch(linha); m != nil {
			t.URLOriginal = m[1]
			continue
		}

		m := reLinha.FindStringSubmatch(linha)
		if m == nil {
			continue
		}

		mm, _ := strconv.Atoi(m[1])
		ss, _ := strconv.Atoi(m[2])
		offset := mm*60 + ss
		if m[3] != "" { // formato HH:MM:SS
			hh := mm
			mm, _ = strconv.Atoi(m[2])
			s2, _ := strconv.Atoi(m[3])
			offset = hh*3600 + mm*60 + s2
			ss = s2
		}
		falante := strings.TrimSpace(m[4])
		fala := strings.TrimSpace(m[5])
		if fala == "" {
			continue
		}

		canonica := formatarTempo(offset) + " " + falante + ": " + fala + "\n"
		inicio := len([]rune(sb.String()))
		sb.WriteString(canonica)
		fim := len([]rune(sb.String()))

		off := offset
		t.Linhas = append(t.Linhas, models.LinhaTranscricao{
			Ord:           ord,
			TSOffsetSeg:   &off,
			FalanteRaw:    falante,
			EhCoordenador: normaliza(falante) == coordNorm,
			Texto:         fala,
			CharInicio:    inicio,
			CharFim:       fim,
			Ruido:         reRuido.MatchString(fala),
		})
		ord++
		_ = ss
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}

	t.TextoCanonico = sb.String()
	if t.Participante == "" && t.TituloBruto != "" {
		t.Participante = t.TituloBruto // fallback: o título traz o nome
	}

	// Arquivo sem data nem fala nenhuma não é uma transcrição do Tactiq.
	//
	// Devolver uma Transcricao vazia sem erro é pior que falhar: o chamador
	// grava uma reunião sem data, e a checagem de divergência entre a data do
	// nome e a do conteúdo (`dataReuniao != ""`) passa a não fazer nada — em
	// silêncio, justamente no caso que ela existe para pegar.
	if t.Data == "" && len(t.Linhas) == 0 {
		return nil, fmt.Errorf("não parece uma transcrição do Tactiq: sem 'Meeting started' e sem falas")
	}

	return t, sc.Err()
}

func formatarTempo(seg int) string {
	if seg >= 3600 {
		return pad(seg/3600) + ":" + pad((seg%3600)/60) + ":" + pad(seg%60)
	}
	return pad(seg/60) + ":" + pad(seg%60)
}

func pad(n int) string {
	if n < 10 {
		return "0" + strconv.Itoa(n)
	}
	return strconv.Itoa(n)
}

// normaliza prepara nome para comparação: sem acento, caixa alta, espaço único.
func normaliza(s string) string {
	s = strings.ToUpper(strings.TrimSpace(s))
	trocas := map[rune]rune{
		'Á': 'A', 'À': 'A', 'Ã': 'A', 'Â': 'A', 'Ä': 'A',
		'É': 'E', 'Ê': 'E', 'È': 'E', 'Ë': 'E',
		'Í': 'I', 'Î': 'I', 'Ì': 'I', 'Ï': 'I',
		'Ó': 'O', 'Õ': 'O', 'Ô': 'O', 'Ò': 'O', 'Ö': 'O',
		'Ú': 'U', 'Û': 'U', 'Ù': 'U', 'Ü': 'U',
		'Ç': 'C', 'Ñ': 'N',
	}
	var b strings.Builder
	for _, r := range s {
		if t, ok := trocas[r]; ok {
			b.WriteRune(t)
		} else {
			b.WriteRune(r)
		}
	}
	return strings.Join(strings.Fields(b.String()), " ")
}
