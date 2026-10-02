package ingest

// Parsers do material de AVD.
//
// Três arquivos de naturezas diferentes:
//
//	00-LEIA-ME.md          escala, faixas do 9-box e o quadrante-alvo de cada um
//	Rascunhos/<Nome>.md    14 drivers com nota e comentário + as 2 perguntas abertas
//	Defesas-Calibragem.md  a tese e as contra-evidências que vão para a mesa
//
// O terceiro é o de maior valor e o mais caro de reconstruir à mão: é o que
// responde "por que Médio e não Alto" na frente de outros gestores, e hoje é
// reescrito todo ciclo relendo 28 arquivos.

import (
	"bufio"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var (
	reEscala    = regexp.MustCompile(`\*\*Escala[^:]*:\*\*\s*(\d)\s*\w+.*?(\d)\s*\w+\s*\.?\s*$`)
	reFaixas    = regexp.MustCompile(`Baixo\s*([\d,\.]+)[–-]([\d,\.]+)\s*·\s*Médio\s*([\d,\.]+)[–-]([\d,\.]+)\s*·\s*Alto\s*([\d,\.]+)[–-]([\d,\.]+)`)
	reQuadLinha = regexp.MustCompile(`^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*\*{0,2}([^|*]+?)\*{0,2}\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|`)

	reRascTitulo = regexp.MustCompile(`^#\s*Rascunho AVD\s*(\d{4})\s*[—-]\s*(.+)$`)
	// "Quadrante-alvo:" e "Quadrante-alvo **pedido**:" convivem nos arquivos.
	// O "pedido" é justamente o caso em que o alvo solicitado não se sustentou
	// na evidência — ou seja, o que mais importa registrar, e era o único que
	// o parser deixava passar em branco.
	reAlvo     = regexp.MustCompile(`\*\*Quadrante-alvo[^:]*:\*\*\s*([^(]+?)\s*\(`)
	reEixo     = regexp.MustCompile(`^##\s*(Comportamento|Desempenho)\s*[—-]\s*média\s*([\d,]+)`)
	reDriver   = regexp.MustCompile(`^###\s*(\d+)\.\s*(.+?)\s*[—-]\s*Nota\s*(\d)`)
	rePergunta = regexp.MustCompile(`^###\s*(.+\?)\s*$`)

	// `\p{L}`, e não `\w`: em Go o `\w` é ASCII puro, então "Médio" não casava
	// e só as defesas com Alto/Alto eram lidas — 3 de 8, em silêncio. Foi o
	// teste contra os arquivos reais que pegou.
	reDefTitulo = regexp.MustCompile(`^##\s*(.+?)\s*[—-]\s*(.+?)\s*\(Comp\s+(\p{L}+)\s+([\d,]+)\s*·\s*Desemp\s+(\p{L}+)\s+([\d,]+)\)`)
	// A contra-evidência aparece sob três rótulos diferentes nos arquivos
	// reais — "Por que X (e não Y)", "Contraponto à calibragem" e "Âncoras
	// objetivas contra". São o mesmo papel: o argumento que a mesa vai usar
	// para derrubar a nota, escrito antes por quem defende. É o bloco que o
	// sistema trata como obrigatório, então reconhecer só um dos rótulos
	// deixaria defesas aparentando estar sem contra-evidência quando têm.
	rePorQue = regexp.MustCompile(`^\*\*((?:Por que|Contraponto|Âncoras objetivas contra)[^:]*):\*\*\s*(.*)$`)
	// "Tese:" e "Tese (defesa de notas altas):" — mesma coisa, rótulo variado.
	reTese = regexp.MustCompile(`^\*\*Tese[^:]*:\*\*\s*(.*)$`)

	// O período avaliado não está no LEIA-ME; está no cabeçalho das defesas,
	// como "(Jan–Jul/2026)". Importa mais do que parece: é ele que define o
	// corte de 6 meses de admissão, ou seja, quem entra no ciclo.
	rePeriodo = regexp.MustCompile(`\((\p{L}{3})[–-](\p{L}{3})/(\d{4})\)`)
)

// mesesPT mapeia a abreviação usada nos arquivos para o número do mês.
var mesesPT = map[string]int{
	"jan": 1, "fev": 2, "mar": 3, "abr": 4, "mai": 5, "jun": 6,
	"jul": 7, "ago": 8, "set": 9, "out": 10, "nov": 11, "dez": 12,
}

// CicloAVD é o que o LEIA-ME define para o ciclo inteiro.
type CicloAVD struct {
	Ano        int
	EscalaMin  int
	EscalaMax  int
	FaixaBaixo float64 // teto do Baixo
	FaixaMedio float64 // teto do Médio
	Rotulos    map[int]string
	Alvos      []AlvoQuadrante
}

// AlvoQuadrante é uma linha da tabela "Quadrantes definidos".
type AlvoQuadrante struct {
	NomeBruto    string
	Time         string
	Quadrante    string
	FaixaComport string
	FaixaDesemp  string
}

// ParseLeiaMe lê a escala, as faixas e os quadrantes-alvo do ciclo.
func ParseLeiaMe(r io.Reader) (*CicloAVD, error) {
	c := &CicloAVD{
		EscalaMin: 1, EscalaMax: 4,
		FaixaBaixo: 2.4, FaixaMedio: 3.5,
		Rotulos: map[int]string{1: "Nunca", 2: "Raramente", 3: "Frequentemente", 4: "Sempre"},
	}
	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 1<<16), 1<<20)
	for sc.Scan() {
		linha := strings.TrimSpace(sc.Text())

		if m := regexp.MustCompile(`AVD\s*(\d{4})`).FindStringSubmatch(linha); m != nil && c.Ano == 0 {
			c.Ano, _ = strconv.Atoi(m[1])
		}
		if m := reEscala.FindStringSubmatch(linha); m != nil {
			c.EscalaMin, _ = strconv.Atoi(m[1])
			c.EscalaMax, _ = strconv.Atoi(m[2])
		}
		if m := reFaixas.FindStringSubmatch(linha); m != nil {
			c.FaixaBaixo = decimalBR(m[2])
			c.FaixaMedio = decimalBR(m[4])
		}
		// Linha da tabela de quadrantes. O cabeçalho e o separador caem fora
		// porque a terceira coluna não casa com um quadrante conhecido.
		if m := reQuadLinha.FindStringSubmatch(linha); m != nil {
			nome := strings.TrimSpace(strings.Trim(m[1], "~*"))
			quad := strings.TrimSpace(m[3])
			if !quadranteConhecido(quad) {
				continue
			}
			c.Alvos = append(c.Alvos, AlvoQuadrante{
				NomeBruto:    nome,
				Time:         strings.TrimSpace(m[2]),
				Quadrante:    quad,
				FaixaComport: strings.TrimSpace(m[4]),
				FaixaDesemp:  strings.TrimSpace(m[5]),
			})
		}
	}
	return c, sc.Err()
}

var quadrantes = map[string]bool{
	"estrela": true, "forte desempenho": true, "forte comportamento": true,
	"mantenedor": true, "eficaz": true, "comprometido": true,
	"questionável": true, "insuficiente": true, "enigma": true,
}

func quadranteConhecido(q string) bool {
	return quadrantes[strings.ToLower(strings.TrimSpace(q))]
}

// NotaDriver é um driver avaliado.
type NotaDriver struct {
	Eixo       string // comportamento · desempenho
	Ordem      int
	Nome       string
	Nota       int
	Comentario string
}

// Rascunho é a avaliação completa de uma pessoa no ciclo.
type Rascunho struct {
	NomeBruto     string
	Ano           int
	QuadranteAlvo string
	Cargo         string
	MediaComport  float64
	MediaDesemp   float64
	Drivers       []NotaDriver
	Abertas       []RespostaAberta
}

// RespostaAberta é uma das duas perguntas dissertativas do ciclo.
type RespostaAberta struct {
	Pergunta string
	Resposta string
}

// ParseRascunho lê a avaliação de uma pessoa.
func ParseRascunho(r io.Reader) (*Rascunho, error) {
	ras := &Rascunho{}
	var eixo string
	var atual *NotaDriver
	var perguntaAtual string
	var buf strings.Builder

	fecharDriver := func() {
		if atual != nil {
			atual.Comentario = strings.TrimSpace(buf.String())
			ras.Drivers = append(ras.Drivers, *atual)
			atual = nil
		}
		buf.Reset()
	}
	fecharPergunta := func() {
		if perguntaAtual != "" {
			ras.Abertas = append(ras.Abertas, RespostaAberta{
				Pergunta: perguntaAtual, Resposta: strings.TrimSpace(buf.String()),
			})
			perguntaAtual = ""
		}
		buf.Reset()
	}

	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 1<<16), 1<<21)
	for sc.Scan() {
		linha := strings.TrimSpace(sc.Text())

		if m := reRascTitulo.FindStringSubmatch(linha); m != nil {
			ras.Ano, _ = strconv.Atoi(m[1])
			ras.NomeBruto = strings.TrimSpace(m[2])
			continue
		}
		if m := reAlvo.FindStringSubmatch(linha); m != nil {
			ras.QuadranteAlvo = strings.TrimSpace(m[1])
			continue
		}
		if strings.HasPrefix(linha, "**Cargo:**") {
			ras.Cargo = strings.TrimSpace(strings.TrimPrefix(linha, "**Cargo:**"))
			continue
		}
		if m := reEixo.FindStringSubmatch(linha); m != nil {
			fecharDriver()
			fecharPergunta()
			eixo = strings.ToLower(m[1])
			if eixo == "comportamento" {
				ras.MediaComport = decimalBR(m[2])
			} else {
				ras.MediaDesemp = decimalBR(m[2])
			}
			continue
		}
		if m := reDriver.FindStringSubmatch(linha); m != nil {
			fecharDriver()
			ordem, _ := strconv.Atoi(m[1])
			nota, _ := strconv.Atoi(m[3])
			atual = &NotaDriver{Eixo: eixo, Ordem: ordem, Nome: strings.TrimSpace(m[2]), Nota: nota}
			continue
		}
		if m := rePergunta.FindStringSubmatch(linha); m != nil {
			fecharDriver()
			fecharPergunta()
			perguntaAtual = strings.TrimSpace(m[1])
			continue
		}
		if strings.HasPrefix(linha, "## ") { // fecha o que estiver aberto
			fecharDriver()
			fecharPergunta()
			continue
		}
		if linha != "" && (atual != nil || perguntaAtual != "") {
			if buf.Len() > 0 {
				buf.WriteString("\n")
			}
			buf.WriteString(linha)
		}
	}
	fecharDriver()
	fecharPergunta()

	if err := sc.Err(); err != nil {
		return nil, fmt.Errorf("ler rascunho: %w", err)
	}
	if ras.NomeBruto == "" {
		return nil, fmt.Errorf("rascunho sem nome no título")
	}
	return ras, nil
}

// Defesa é o argumento de calibragem de uma pessoa.
type Defesa struct {
	NomeBruto      string
	Quadrante      string
	FaixaComport   string
	MediaComport   float64
	FaixaDesemp    string
	MediaDesemp    float64
	Tese           string
	PorQueNaoMaior string
	Trajetoria     string
	Markdown       string
}

// ParseDefesas lê o arquivo de defesas inteiro, uma seção por pessoa.
//
// Devolve também o período do ciclo, declarado no cabeçalho — é o único lugar
// dos arquivos onde ele aparece.
func ParseDefesas(r io.Reader) ([]Defesa, string, string, error) {
	var out []Defesa
	var atual *Defesa
	var capturando bool
	var inicio, fim string
	var buf strings.Builder

	fechar := func() {
		if atual != nil {
			atual.Markdown = strings.TrimSpace(buf.String())
			out = append(out, *atual)
			atual = nil
		}
		buf.Reset()
	}

	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 1<<16), 1<<22)
	for sc.Scan() {
		linha := strings.TrimSpace(sc.Text())

		if inicio == "" {
			if m := rePeriodo.FindStringSubmatch(linha); m != nil {
				mi := mesesPT[strings.ToLower(m[1])]
				mf := mesesPT[strings.ToLower(m[2])]
				if mi > 0 && mf > 0 {
					inicio = fmt.Sprintf("%s-%02d-01", m[3], mi)
					fim = ultimoDiaDoMes(m[3], mf)
				}
			}
		}

		if m := reDefTitulo.FindStringSubmatch(linha); m != nil {
			fechar()
			// Sem isto, uma seção que termina no meio da captura faria a
			// próxima herdar as primeiras linhas como se fossem dela.
			capturando = false
			atual = &Defesa{
				NomeBruto:    strings.TrimSpace(m[1]),
				Quadrante:    strings.TrimSpace(m[2]),
				FaixaComport: strings.TrimSpace(m[3]),
				MediaComport: decimalBR(m[4]),
				FaixaDesemp:  strings.TrimSpace(m[5]),
				MediaDesemp:  decimalBR(m[6]),
			}
			continue
		}
		if atual == nil {
			continue
		}
		if m := reTese.FindStringSubmatch(linha); m != nil {
			atual.Tese = strings.TrimSpace(m[1])
		}
		if strings.HasPrefix(linha, "**Trajetória:**") {
			atual.Trajetoria = strings.TrimSpace(strings.TrimPrefix(linha, "**Trajetória:**"))
		}
		// "Por que Desempenho Médio (e não Alto)" — a contra-evidência, que é
		// o que a mesa de calibragem de fato pergunta.
		//
		// O conteúdo vem na mesma linha do rótulo na maioria dos casos, mas há
		// defesa em que o rótulo abre um bloco e os argumentos vêm em lista
		// abaixo. Gravar só a primeira linha deixava a contra-evidência vazia
		// justamente na defesa mais delicada do ciclo.
		if m := rePorQue.FindStringSubmatch(linha); m != nil {
			atual.PorQueNaoMaior = strings.TrimSpace(m[2])
			capturando = atual.PorQueNaoMaior == ""
		} else if capturando {
			if linha == "" || strings.HasPrefix(linha, "**") || strings.HasPrefix(linha, "#") {
				capturando = false
			} else {
				if atual.PorQueNaoMaior != "" {
					atual.PorQueNaoMaior += "\n"
				}
				atual.PorQueNaoMaior += linha
			}
		}
		buf.WriteString(linha)
		buf.WriteString("\n")
	}
	fechar()
	return out, inicio, fim, sc.Err()
}

// ultimoDiaDoMes devolve o último dia do mês em ISO.
//
// Calculado como "véspera do dia 1º do mês seguinte" em vez de tabela fixa:
// resolve fevereiro bissexto sem caso especial.
func ultimoDiaDoMes(ano string, mes int) string {
	a, _ := strconv.Atoi(ano)
	return time.Date(a, time.Month(mes)+1, 1, 0, 0, 0, 0, time.UTC).
		AddDate(0, 0, -1).Format("2006-01-02")
}

// decimalBR converte "3,75" em 3.75. Os arquivos são escritos em pt-BR.
func decimalBR(s string) float64 {
	v, _ := strconv.ParseFloat(strings.Replace(strings.TrimSpace(s), ",", ".", 1), 64)
	return v
}
