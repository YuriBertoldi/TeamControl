package pauta

// Detecção de tema no texto das conversas.
//
// Serve a duas perguntas que são a mesma moeda: o que **se repete** sem sair do
// lugar, e o que **sumiu** sem ninguém notar. A segunda é a mais difícil de
// perceber sozinho — você cobra seis temas estratégicos e é humanamente
// impossível rastrear seis temas por vinte e duas pessoas de cabeça.
//
// A detecção é por palavra-chave, deliberadamente. A alternativa seria
// classificar com LLM, e isso trocaria uma regra que qualquer um lê e corrige
// por um julgamento que ninguém audita — num dado que entra em pauta de 1:1.
// Palavra-chave erra para menos (deixa passar), e errar para menos aqui é
// barato: o tema deixa de ser sugerido, não é sugerido errado.

import (
	"regexp"
	"strings"
)

// Tema é um assunto rastreado ao longo das conversas.
type Tema struct {
	Nome string
	// Estrategico entra na checagem de ausência: é tema que você cobra, e
	// sumir dele é sinal. Tema não estratégico só conta quando aparece.
	Estrategico bool
	// Tensao marca o tema em que REPETIR é sintoma.
	//
	// A distinção decide se a recorrência vira alerta ou não. Carga voltando em
	// quatro das cinco últimas conversas significa que as ações combinadas não
	// resolveram — é problema estrutural. Já Go aparecendo em todas significa
	// apenas que é a frente dele; tratar isso como "pode ser estrutural, não
	// pontual" seria transformar foco de trabalho em suspeita.
	Tensao bool
	// Pergunta é a abertura sugerida quando o tema vira assunto de pauta.
	Pergunta string
	padrao   *regexp.Regexp
}

// catalogo é o conjunto rastreado.
//
// Fica em código, e não em tabela, enquanto for lista curta e estável — mover
// para cadastro antes de alguém querer editar é inventar tela que ninguém
// pediu. O dia em que o primeiro tema precisar ser criado pela interface, isto
// vira migration.
var catalogo = []Tema{
	{
		Nome: "Carga de trabalho", Estrategico: true, Tensao: true,
		Pergunta: "Isso aparece há algumas conversas e continuamos tratando como ritmo. " +
			"Vale olhar como problema de alocação?",
		padrao: p(`sobrecarg|carga\s+de\s+trabalho|muita\s+demanda|apertad|correria|` +
			`sem\s+tempo|acumul(ou|ado|ando)|estourad|capacidade`),
	},
	{
		Nome: "PDI e carreira", Estrategico: true,
		Pergunta: "Faz um tempo que não falamos do seu desenvolvimento. O que você " +
			"gostaria de estar fazendo daqui a um ano?",
		padrao: p(`\bPDI\b|plano\s+de\s+desenvolvimento|carreira|crescimento\s+profissional|` +
			`pr[óo]ximo\s+n[íi]vel|evolu[çc][ãa]o\s+profissional`),
	},
	{
		Nome: "Go", Estrategico: true,
		Pergunta: "Como está sendo a aproximação com Go? Onde você sente que trava?",
		padrao:   p(`\bGo\b|golang|API\s+em\s+Go`),
	},
	{
		Nome: "IA aplicada", Estrategico: true,
		Pergunta: "Onde a IA está de fato te poupando tempo, e onde ela ainda atrapalha?",
		padrao: p(`\bIA\b|intelig[êe]ncia\s+artificial|Claude|Copilot|LLM|` +
			`prompt|esteira\s+de\s+feature|EsteiraFeature`),
	},
	{
		Nome: "Qualidade e testes", Estrategico: true, Tensao: true,
		Pergunta: "O que mais tem chegado como bug que a gente poderia ter pego antes?",
		padrao: p(`teste\s+automatizado|cobertura|regress[ãa]o|Robot\s+Framework|` +
			`qualidade\s+do\s+c[óo]digo|bug|defeito|sustenta[çc][ãa]o`),
	},
	{
		Nome: "Migração para PostgreSQL", Estrategico: true,
		Pergunta: "Como está o avanço do estrangulamento do Btrieve na sua frente?",
		padrao:   p(`Btrieve|PostgreSQL|\bPG\b|estrangula|migra[çc][ãa]o\s+de\s+banco`),
	},
	{
		Nome: "Bem-estar", Estrategico: false, Tensao: true,
		Pergunta: "Como você tem estado, fora do trabalho?",
		padrao: p(`bem[\s-]estar|cansa[çd]|exaust|desanima|ansiedad|` +
			`fam[íi]lia|f[ée]rias|descans`),
	},
	{
		Nome: "Liderança técnica", Estrategico: false, Tensao: true,
		Pergunta: "Como está sendo conciliar o apoio ao time com as suas próprias entregas?",
		padrao:   p(`tech\s*lead|\bTL\b|lideran[çc]a|mentori|apoiar\s+o\s+time|revis(ar|[ãa]o)\s+de\s+PR`),
	},
	{
		Nome: "Relação com o time", Estrategico: false, Tensao: true,
		Pergunta: "Como está a sua relação com o resto do time hoje?",
		padrao:   p(`conflito|rela[çc][ãa]o\s+com\s+o\s+time|clima\s+do\s+time|comunica[çc][ãa]o\s+com`),
	},
}

func p(s string) *regexp.Regexp { return regexp.MustCompile(`(?i)` + s) }

// Catalogo devolve os temas rastreados.
func Catalogo() []Tema { return catalogo }

// TemasDoTexto diz quais temas aparecem num texto.
//
// Devolve nomes, não contagens: duas menções a "carga" na mesma conversa não
// fazem o tema ser mais recorrente que uma — recorrência se mede em conversas,
// não em palavras. Contar palavras premiaria quem escreve ata longa.
func TemasDoTexto(texto string) map[string]bool {
	achados := map[string]bool{}
	if strings.TrimSpace(texto) == "" {
		return achados
	}
	for _, t := range catalogo {
		if t.padrao.MatchString(texto) {
			achados[t.Nome] = true
		}
	}
	return achados
}

// PerguntaDe devolve a abertura sugerida do tema.
func PerguntaDe(nome string) string {
	for _, t := range catalogo {
		if t.Nome == nome {
			return t.Pergunta
		}
	}
	return ""
}

// EhTensao diz se repetir o tema é sintoma de algo não resolvido.
func EhTensao(nome string) bool {
	for _, t := range catalogo {
		if t.Nome == nome {
			return t.Tensao
		}
	}
	return false
}

// EhEstrategico diz se a ausência do tema é sinal.
func EhEstrategico(nome string) bool {
	for _, t := range catalogo {
		if t.Nome == nome {
			return t.Estrategico
		}
	}
	return false
}
