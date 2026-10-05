package pauta

// Os gatilhos determinísticos.
//
// Cada função abaixo responde a uma pergunta que o coordenador faria se
// tivesse lido tudo de novo antes da conversa — e é justamente isso que ele
// não tem tempo de fazer vinte e duas vezes por ciclo.
//
// Uma regra que vale para todas: **o assunto cita a conversa de onde saiu.**
// A única exceção é a regra de ausência, que afirma algo sobre o que NÃO foi
// dito e portanto não tem o que citar.

import (
	"fmt"
	"time"
)

func montarAssuntos(p *Preparo, cadenciaDias int, hoje time.Time) []Assunto {
	var a []Assunto
	a = append(a, gatilhoVenceAgora(p)...)
	a = append(a, gatilhoPrometido(p)...)
	a = append(a, gatilhoHerdado(p)...)
	a = append(a, gatilhoSemData(p)...)
	a = append(a, gatilhoProximaConversa(p)...)
	a = append(a, gatilhoCadencia(p, cadenciaDias)...)
	a = append(a, gatilhoRecorrente(p)...)
	a = append(a, gatilhoAusente(p)...)
	a = append(a, gatilhoReconhecimento(p)...)
	a = append(a, gatilhoEscuta())

	for i := range a {
		if a[i].ID == "" {
			a[i].ID = fmt.Sprintf("as-%02d", i)
		}
	}
	return a
}

// gatilhoVenceAgora — o que vence NESTA conversa.
//
// São os combinados cujo prazo foi escrito como "até a próxima 1:1". A próxima
// 1:1 é esta. Não vencem um dia qualquer do calendário: vencem na sala, agora.
//
// Este é o gatilho de maior retorno do catálogo, e é invisível sem o sistema:
// para enxergá-lo à mão seria preciso reler a ata anterior inteira procurando
// a coluna de prazo. Por isso entra antes até do que eu devo — não porque
// importe mais, mas porque some mais fácil.
func gatilhoVenceAgora(p *Preparo) []Assunto {
	var vencem []Compromisso
	for _, c := range p.Compromissos {
		if c.VenceAgora {
			vencem = append(vencem, c)
		}
	}
	if len(vencem) == 0 {
		return nil
	}

	refs, linhas, meus := []string{}, []string{}, 0
	for _, c := range vencem {
		if c.OrigemMeeting != "" {
			refs = append(refs, c.OrigemMeeting)
		}
		linhas = append(linhas, resumir(c.Descricao, 80))
		if c.Responsavel == "coordenador" {
			meus++
		}
	}
	deQuem := ""
	if meus > 0 {
		deQuem = fmt.Sprintf(" — %d deles meus", meus)
	}

	return []Assunto{{
		ID: "vence-agora", Prioridade: Alta, Minutos: limitar(5+3*len(vencem), 15),
		Categoria: "Compromisso", Origem: "regra_compromisso",
		Titulo: fmt.Sprintf("%s %s nesta conversa%s",
			plural(len(vencem), "combinado", "combinados"),
			plural2(len(vencem), "vence", "vencem"), deQuem),
		PorQueAgora: "Foram combinados \"até a próxima 1:1\", e a próxima 1:1 é esta: " +
			juntar(linhas),
		Refs:     unicos(refs),
		Pergunta: "Combinamos resolver isto até hoje. Vamos passar item a item?",
		PorQueAssim: "O prazo era literalmente esta conversa. Deixar para a seguinte " +
			"sem dizer nada é como o combinado nunca ter existido.",
		Toca: []string{"Compromisso"},
	}}
}

// gatilhoPrometido — o que EU devo.
//
// Primeiro e em prioridade máxima, por decisão de produto: encaminhamento do
// líder que morre é o que mais corrói a confiança na 1:1, e é o mais fácil de
// esquecer porque não há ninguém para te cobrar. Numa conversa com nove
// encaminhamentos, oito são do liderado e um é seu — adivinhe qual some.
func gatilhoPrometido(p *Preparo) []Assunto {
	var devo []Compromisso
	for _, c := range p.Compromissos {
		if c.Responsavel == "coordenador" && c.Natureza != "continuo" {
			devo = append(devo, c)
		}
	}
	if len(devo) == 0 {
		return nil
	}

	refs, linhas := []string{}, []string{}
	for _, c := range devo {
		if c.OrigemMeeting != "" {
			refs = append(refs, c.OrigemMeeting)
		}
		linhas = append(linhas, resumir(c.Descricao, 90))
	}
	titulo := "Devo uma devolutiva"
	if len(devo) > 1 {
		titulo = fmt.Sprintf("Devo %d coisas a ele", len(devo))
	}
	return []Assunto{{
		ID: "prometi", Prioridade: Alta, Minutos: 5 + 2*len(devo),
		Categoria: "Compromisso", Origem: "regra_compromisso",
		Titulo: titulo,
		PorQueAgora: "Assumi isto numa conversa anterior e segue em aberto: " +
			juntar(linhas),
		Refs:     unicos(refs),
		Pergunta: "Antes de qualquer coisa: eu te devo " + juntar(linhas) + ". Deixa eu te dar o retorno.",
		PorQueAssim: "Abrir reconhecendo a própria pendência é o que mantém a 1:1 " +
			"como lugar de troca em vez de cobrança de mão única.",
		Toca: []string{"Confiança no ritual"},
	}}
}

// gatilhoHerdado — o que atravessou conversas sem sair do lugar.
//
// Item que aparece em duas ou mais conversas não é "ele não fez ainda": é
// sintoma de que o combinado não cabia, não era prioridade real, ou dependia
// de algo que ninguém destravou. A ação sugerida é renegociar ou matar — nunca
// repetir a cobrança pela terceira vez.
func gatilhoHerdado(p *Preparo) []Assunto {
	var out []Assunto
	for _, c := range p.Compromissos {
		if c.Herdado < 2 || c.Natureza == "continuo" {
			continue
		}
		refs := []string{}
		if c.OrigemMeeting != "" {
			refs = append(refs, c.OrigemMeeting)
		}
		out = append(out, Assunto{
			ID: fmt.Sprintf("herdado-%d", c.ID), Prioridade: Alta, Minutos: 8,
			Categoria: "Compromisso", Origem: "regra_compromisso", Herdado: true,
			Titulo: "Renegociar ou matar: " + resumir(c.Descricao, 60),
			PorQueAgora: fmt.Sprintf(
				"Atravessou %d conversas e continua em aberto. Repetir a cobrança "+
					"uma terceira vez não vai mudar o resultado.", c.Herdado),
			Refs: refs,
			Pergunta: "Isto já apareceu em " + fmt.Sprint(c.Herdado) +
				" conversas nossas. Antes de recombinar: o que está travando de verdade?",
			PorQueAssim: "A pergunta assume que há um impedimento, e não falta de " +
				"empenho. Se o impedimento for meu, é melhor descobrir agora.",
			Toca: []string{"Compromisso herdado"},
		})
		if len(out) >= 3 {
			break // três já é o recado; mais que isso vira lista de cobrança
		}
	}
	return out
}

// gatilhoSemData — o combinado que nunca virou data.
//
// Agrupado num assunto só, de propósito: são dezenas, e um item de pauta por
// encaminhamento transformaria a conversa em revisão de planilha.
func gatilhoSemData(p *Preparo) []Assunto {
	n, refs := 0, []string{}
	for _, c := range p.Compromissos {
		if c.PrazoVago && c.PrazoDate == nil && c.Natureza != "continuo" {
			n++
			if c.OrigemMeeting != "" && len(refs) < 3 {
				refs = append(refs, c.OrigemMeeting)
			}
		}
	}
	if n < 3 {
		return nil
	}
	return []Assunto{{
		ID: "sem-data", Prioridade: Media, Minutos: 6,
		Categoria: "Compromisso", Origem: "regra_compromisso",
		Titulo: plural(n, "combinado nunca virou data", "combinados nunca viraram data"),
		PorQueAgora: "Prazo escrito como \"próximas semanas\" não vence nunca, " +
			"e o que não vence não é cobrado — nem por mim, nem por ele.",
		Refs: unicos(refs),
		Pergunta: "Tem um punhado de coisas nossas sem data. Vamos pôr data nas " +
			"três que mais importam e deixar o resto cair?",
		PorQueAssim: "Pedir data para tudo seria burocrático e ninguém cumpriria. " +
			"Três é o que cabe numa quinzena.",
		Toca: []string{"Compromisso"},
	}}
}

// gatilhoProximaConversa — o que ficou combinado para hoje.
//
// Literal, transcrito da ata anterior. É o gatilho mais barato e o mais
// honesto do catálogo: não é inferência sobre a pessoa, é o que vocês dois
// decidiram que seria tratado agora.
func gatilhoProximaConversa(p *Preparo) []Assunto {
	if len(p.ProximaConversa) == 0 {
		return nil
	}
	refs := []string{}
	if p.UltimaConversa != nil {
		refs = append(refs, *p.UltimaConversa)
	}
	// Teto de 15 minutos. Cinco tópicos a cinco minutos cada consumiriam uma
	// conversa de trinta inteira, e aí nada mais do histórico entra — a pauta
	// vira a leitura da ata anterior.
	return []Assunto{{
		ID: "prox-conversa", Prioridade: Alta,
		Minutos:   limitar(5*len(p.ProximaConversa), 15),
		Categoria: "Combinado", Origem: "ata_anterior",
		Titulo:      "Ficou para esta conversa: " + resumir(p.ProximaConversa[0], 60),
		PorQueAgora: "Vocês combinaram isto no fim da última 1:1: " + juntar(p.ProximaConversa),
		Refs:        refs,
		Pergunta:    "Combinamos tratar " + resumir(p.ProximaConversa[0], 60) + " hoje. Começamos por aí?",
		PorQueAssim: "Retomar o combinado em voz alta mostra que a ata não é " +
			"formalidade — é o que faz a próxima valer alguma coisa.",
		Toca: []string{"Combinado anterior"},
	}}
}

// gatilhoCadencia — tempo demais sem conversa.
func gatilhoCadencia(p *Preparo, cadenciaDias int) []Assunto {
	if p.DiasSemConversa == nil || *p.DiasSemConversa <= cadenciaDias {
		return nil
	}
	d := *p.DiasSemConversa
	return []Assunto{{
		ID: "cadencia", Prioridade: Alta, Minutos: 10,
		Categoria: "Ritual", Origem: "regra_cadencia",
		Titulo: fmt.Sprintf("%d dias sem conversa — %d acima da cadência", d, d-cadenciaDias),
		PorQueAgora: "Intervalo longo acumula assunto e faz a conversa virar " +
			"status report. O que mudou nesse período provavelmente não cabe numa pauta.",
		Pergunta: "Faz " + fmt.Sprint(d) + " dias que não conversamos direito. " +
			"O que aconteceu nesse tempo que eu deveria saber e não sei?",
		PorQueAssim: "A pergunta assume a minha falha de ritmo, não a dele. " +
			"O intervalo foi decisão minha, não dele.",
		Toca: []string{"Cadência"},
	}}
}

// gatilhoRecorrente — o tema que volta e não se resolve.
//
// Só temas de TENSÃO entram. A distinção é o que separa sinal de ruído:
// "carga" voltando em quatro das cinco últimas conversas significa que o que
// foi combinado não resolveu. Já "Go" aparecendo em todas significa apenas que
// é a frente dele — e levantar isso como "pode ser estrutural, não pontual"
// transformaria o foco de trabalho da pessoa em suspeita, numa tela que vai
// ser lida minutos antes de olhar para ela.
func gatilhoRecorrente(p *Preparo) []Assunto {
	var out []Assunto
	for _, t := range p.Temas.Recorrentes {
		if !EhTensao(t.Tema) {
			continue
		}
		out = append(out, Assunto{
			ID: "rec-" + t.Tema, Prioridade: Alta, Minutos: 10,
			Categoria: "Risco", Origem: "regra_tema",
			Titulo:      t.Tema + " — pode ser estrutural, não pontual",
			PorQueAgora: t.Nota + ", e as ações combinadas não mudaram o quadro.",
			Refs:        t.Refs,
			Pergunta:    PerguntaDe(t.Tema),
			PorQueAssim: "Depois de três conversas sobre o mesmo assunto, tratar " +
				"como caso isolado já foi testado e não funcionou.",
			Toca: []string{t.Tema},
		})
		if len(out) >= 2 {
			break
		}
	}
	return out
}

// gatilhoAusente — o tema que sumiu.
//
// O mais difícil de perceber sozinho, e por isso o de maior valor: ausência
// não chama atenção. É também o único gatilho que não cita conversa — ele
// afirma algo sobre o que NÃO foi dito.
func gatilhoAusente(p *Preparo) []Assunto {
	var out []Assunto
	for _, t := range p.Temas.Ausentes {
		porque := fmt.Sprintf("Sem menção há %d conversas", t.ConversasSem)
		if t.Ultimo != nil {
			porque += " (último registro: " + *t.Ultimo + ")"
		} else {
			porque += " — nunca apareceu"
		}
		out = append(out, Assunto{
			ID: "aus-" + t.Tema, Prioridade: Media, Minutos: 8,
			Categoria: "Desenvolvimento", Origem: "regra_ausencia",
			Titulo:      t.Tema + " não aparece há um tempo",
			PorQueAgora: porque + ". É tema que eu cobro, e parei de perguntar.",
			Pergunta:    PerguntaDe(t.Tema),
			PorQueAssim: "Ausência não chama atenção sozinha. Se eu não trouxer, " +
				"não vem — e daqui a seis meses vira lacuna na avaliação.",
			Toca: []string{t.Tema},
		})
		if len(out) >= 2 {
			break
		}
	}
	return out
}

// gatilhoReconhecimento — entrega que ninguém reconheceu em voz alta.
func gatilhoReconhecimento(p *Preparo) []Assunto {
	for _, n := range p.Novidades {
		if n.Tipo != "entrega" {
			continue
		}
		return []Assunto{{
			ID: "reconhecer", Prioridade: Media, Minutos: 5,
			Categoria: "Reconhecimento", Origem: "regra_reconhecimento",
			Titulo:      "Reconhecer o que chegou desde a última conversa",
			PorQueAgora: "Feedback registrado em " + n.Data + " " + n.Origem + ", ainda não comentado entre vocês.",
			Refs:        []string{n.Data},
			Pergunta:    "Vi o retorno sobre o seu trabalho. Queria te dizer isso olhando no olho, não só no sistema.",
			PorQueAssim: "Reconhecimento que só existe por escrito na ferramenta " +
				"não chega como reconhecimento — chega como registro.",
			Toca: []string{"Reconhecimento"},
			Conf: n.Conf,
		}}
	}
	return nil
}

// gatilhoEscuta — o espaço que não é meu.
//
// Entra sempre. É a garantia que impede a pauta de virar lista de cobrança:
// se tudo que eu levo é pendência, a 1:1 deixa de ser 1:1.
func gatilhoEscuta() Assunto {
	return Assunto{
		ID: "escuta", Prioridade: Escuta, Minutos: 10,
		Categoria: "Escuta", Origem: "garantia",
		Titulo:      "Espaço aberto — o que ELE trouxer",
		PorQueAgora: "Reservado antes de a pauta ser preenchida, não com o que sobrou do tempo.",
		Pergunta:    "O que você queria ter trazido hoje e eu não perguntei?",
		PorQueAssim: "Pergunta fechada no fim da conversa não abre nada. Esta " +
			"assume que existe algo e devolve a vez.",
		Toca: []string{"Escuta"},
	}
}

/* ---------- auxiliares ---------- */

func juntar(itens []string) string {
	switch len(itens) {
	case 0:
		return ""
	case 1:
		return itens[0]
	case 2:
		return itens[0] + " e " + itens[1]
	}
	s := ""
	for i, it := range itens[:len(itens)-1] {
		if i > 0 {
			s += ", "
		}
		s += it
	}
	return s + " e " + itens[len(itens)-1]
}

// limitar põe teto no tempo de um assunto.
//
// Um item que sozinho consome a conversa inteira não é prioridade: é a pauta
// inteira. O teto força a escolha a acontecer dentro do assunto, e não à custa
// de todo o resto.
func limitar(v, max int) int {
	if v > max {
		return max
	}
	return v
}

func plural(n int, um, varios string) string {
	if n == 1 {
		return "1 " + um
	}
	return fmt.Sprintf("%d %s", n, varios)
}

func plural2(n int, um, varios string) string {
	if n == 1 {
		return um
	}
	return varios
}

func unicos(s []string) []string {
	visto, out := map[string]bool{}, []string{}
	for _, v := range s {
		if v != "" && !visto[v] {
			visto[v] = true
			out = append(out, v)
		}
	}
	return out
}
