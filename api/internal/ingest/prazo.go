package ingest

// Leitura de prazo escrito à mão.
//
// Os encaminhamentos das 1:1 não trazem data: trazem "Imediato", "Próximas
// semanas", "Até a próxima 1:1", "Contínuo". Enquanto isso for só texto, o
// board não consegue responder "o que venceu hoje", que é a pergunta pela qual
// ele existe.
//
// Duas decisões sustentam este arquivo.
//
// **A primeira: nem todo prazo textual é prazo.** 28 dos 161 encaminhamentos
// dizem "Contínuo", e outros dizem "Sob demanda" ou "A partir de agora". Isso
// é combinado de conduta — não vence, não atrasa, não deve aparecer em lista
// de pendência. Classificar tudo como prazo encheria o board de vencido falso,
// e board que grita por engano é board que se aprende a ignorar junto com o
// que gritava com razão.
//
// **A segunda: o que sai daqui é sugestão, não decisão.** A função devolve uma
// data proposta e quem grava a põe em `prazo_sugerido`, nunca em `prazo_date`.
// A direção importa: o sistema oferece a leitura, a pessoa que assumiu o
// compromisso confirma. Um board cobrando data que ninguém combinou perde a
// confiança de quem o usa na primeira 1:1 em que isso aparecer.

import (
	"regexp"
	"strings"
	"time"
)

// Natureza do que foi combinado.
const (
	// NaturezaPrazo tem data: "até sexta", "próximas semanas".
	NaturezaPrazo = "prazo"
	// NaturezaContinuo é modo de trabalhar, não entrega. Não vence.
	NaturezaContinuo = "continuo"
	// NaturezaIndefinido o texto não deixa ler. Vai para a curadoria humana.
	NaturezaIndefinido = "indefinido"
)

// LeituraPrazo é o que o sistema entendeu do texto.
type LeituraPrazo struct {
	Natureza string
	// Dias a somar à data da reunião. Zero quando não há data a propor.
	Dias int
	// ProximaConversa marca o caso que só o banco sabe resolver: a data é a da
	// próxima 1:1 com a pessoa, e quem chama precisa buscá-la.
	ProximaConversa bool
	// Como explica a leitura na tela, para a sugestão poder ser recusada com
	// conhecimento de causa em vez de no escuro.
	Como string
}

var (
	// Conduta contínua. Reconhecida primeiro porque "a partir de agora" e
	// "sob demanda" contêm palavras que as regras de prazo também olham.
	reContinuo = regexp.MustCompile(`(?i)^\s*(cont[ií]nu[oa]|sob\s+demanda|a\s+partir\s+de\s+agora|permanente|sempre|di[áa]ri[oa]|recorrente)`)

	reProxima1a1  = regexp.MustCompile(`(?i)(pr[óo]xima\s+1[\s:-]*1|pr[óo]ximo\s+encontro|pr[óo]xima\s+conversa)`)
	reImediato    = regexp.MustCompile(`(?i)^\s*(imediato|agora|hoje|urgente)`)
	reDias        = regexp.MustCompile(`(?i)pr[óo]ximos?\s+dias`)
	reSemanaAtual = regexp.MustCompile(`(?i)(semana\s+corrente|esta\s+semana|at[ée]\s+sexta|fim\s+da\s+semana)`)
	reSemanas     = regexp.MustCompile(`(?i)pr[óo]ximas?\s+semanas?`)
	reSprint      = regexp.MustCompile(`(?i)(pr[óo]xima\s+sprint|sprint\s+que\s+vem)`)
	reQuarter     = regexp.MustCompile(`(?i)(quarter|trimestre)`)
	reMes         = regexp.MustCompile(`(?i)(pr[óo]ximo\s+m[êe]s|at[ée]\s+o\s+fim\s+do\s+m[êe]s)`)

	// Data escrita por extenso no texto, que às vezes aparece.
	rePrazoDataBR  = regexp.MustCompile(`\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b`)
	rePrazoDataISO = regexp.MustCompile(`\b(\d{4})-(\d{2})-(\d{2})\b`)
)

// LerPrazo interpreta o prazo escrito à mão.
//
// A ordem das regras não é arbitrária: "contínuo" vem primeiro porque frases
// como "a partir de agora" casariam com a regra de "agora"; e a data explícita
// vem logo depois porque, quando alguém escreveu uma data, não há o que
// interpretar.
func LerPrazo(texto string) LeituraPrazo {
	t := strings.TrimSpace(texto)
	if t == "" {
		return LeituraPrazo{Natureza: NaturezaIndefinido}
	}

	if reContinuo.MatchString(t) {
		return LeituraPrazo{
			Natureza: NaturezaContinuo,
			Como:     "combinado de conduta, não entrega — não vence",
		}
	}

	// "Até a próxima 1:1" é o único caso em que a data existe de verdade e o
	// sistema a conhece: é a data da próxima conversa agendada.
	if reProxima1a1.MatchString(t) {
		return LeituraPrazo{
			Natureza:        NaturezaPrazo,
			ProximaConversa: true,
			Como:            "vence na próxima 1:1",
		}
	}

	switch {
	case reImediato.MatchString(t):
		return LeituraPrazo{Natureza: NaturezaPrazo, Dias: 2,
			Como: `"imediato" lido como dois dias depois da conversa`}
	case reSemanaAtual.MatchString(t):
		return LeituraPrazo{Natureza: NaturezaPrazo, Dias: 5,
			Como: "fim da semana da conversa"}
	case reDias.MatchString(t):
		return LeituraPrazo{Natureza: NaturezaPrazo, Dias: 7,
			Como: `"próximos dias" lido como uma semana`}
	case reSemanas.MatchString(t):
		return LeituraPrazo{Natureza: NaturezaPrazo, Dias: 21,
			Como: `"próximas semanas" lido como três semanas`}
	case reSprint.MatchString(t):
		return LeituraPrazo{Natureza: NaturezaPrazo, Dias: 14,
			Como: "uma sprint de duas semanas a partir da conversa"}
	case reMes.MatchString(t):
		return LeituraPrazo{Natureza: NaturezaPrazo, Dias: 30,
			Como: "um mês depois da conversa"}
	case reQuarter.MatchString(t):
		return LeituraPrazo{Natureza: NaturezaPrazo, Dias: 90,
			Como: "fim do trimestre a partir da conversa"}
	}

	return LeituraPrazo{
		Natureza: NaturezaIndefinido,
		Como:     "não consegui ler uma data neste texto",
	}
}

// DataExplicita devolve a data escrita no texto, se houver.
//
// Separada de LerPrazo porque é de outra natureza: aqui não há interpretação
// nenhuma, alguém escreveu a data. O ano assumido é o da reunião, e não o
// corrente — um encaminhamento de dezembro com prazo "05/01" é do ano
// seguinte, e um de 2025 relido hoje não pode virar 2026.
func DataExplicita(texto, dataReuniao string) string {
	if m := rePrazoDataISO.FindStringSubmatch(texto); m != nil {
		return m[0]
	}
	m := rePrazoDataBR.FindStringSubmatch(texto)
	if m == nil {
		return ""
	}
	base, err := time.Parse("2006-01-02", dataReuniao)
	if err != nil {
		return ""
	}
	dia, mes := atoiSeguro(m[1]), atoiSeguro(m[2])
	if dia < 1 || dia > 31 || mes < 1 || mes > 12 {
		return ""
	}
	ano := base.Year()
	if m[3] != "" {
		ano = atoiSeguro(m[3])
		if ano < 100 {
			ano += 2000
		}
	} else if mes < int(base.Month()) {
		ano++ // mês menor que o da conversa: virou o ano
	}
	d := time.Date(ano, time.Month(mes), dia, 0, 0, 0, 0, time.UTC)
	// Recusa data que o calendário corrigiu (31/02 vira 03/03): quem escreveu
	// errado precisa ver "não consegui ler", não uma data plausível e falsa.
	if d.Day() != dia || int(d.Month()) != mes {
		return ""
	}
	return d.Format("2006-01-02")
}

func atoiSeguro(s string) int {
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return -1
		}
		n = n*10 + int(r-'0')
	}
	return n
}
