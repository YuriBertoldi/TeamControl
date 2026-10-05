package ingest

import "testing"

func TestLerPrazoSeparaCondutaDeEntrega(t *testing.T) {
	// O maior balde da pasta real. Se isto virar prazo, 28 encaminhamentos
	// entram no board como vencidos sem nunca terem sido entrega.
	for _, s := range []string{"Contínuo", "Continuo", "Sob demanda",
		"A partir de agora", "Permanente", "Diário"} {
		if l := LerPrazo(s); l.Natureza != NaturezaContinuo {
			t.Errorf("%q virou %q, esperado conduta contínua", s, l.Natureza)
		}
	}
}

func TestLerPrazoProximaConversaNaoInventaDias(t *testing.T) {
	// Este é o único caso em que a data existe de verdade e o banco a conhece.
	// Propor "+14 dias" aqui seria inventar, tendo a resposta à mão.
	for _, s := range []string{"Até a próxima 1:1", "Próxima 1:1", "Próxima conversa"} {
		l := LerPrazo(s)
		if !l.ProximaConversa {
			t.Errorf("%q não foi reconhecido como próxima conversa", s)
		}
		if l.Dias != 0 {
			t.Errorf("%q propôs %d dias — a data vem da agenda, não de aritmética", s, l.Dias)
		}
	}
}

func TestLerPrazoTextosReaisDaPasta(t *testing.T) {
	casos := []struct {
		texto    string
		natureza string
		dias     int
	}{
		{"Imediato", NaturezaPrazo, 2},
		{"Próximos dias", NaturezaPrazo, 7},
		{"Semana corrente", NaturezaPrazo, 5},
		{"Próximas semanas", NaturezaPrazo, 21},
		{"Próxima sprint", NaturezaPrazo, 14},
		{"Antes do início do quarter", NaturezaPrazo, 90},
		{"", NaturezaIndefinido, 0},
		{"Quando der", NaturezaIndefinido, 0},
		// "A definir" diz, com todas as letras, que não foi definido. Ler 14
		// dias aqui seria inventar um combinado que a conversa não teve — e
		// este é precisamente o item que precisa voltar para a pessoa.
		{"A definir na sprint", NaturezaIndefinido, 0},
	}
	for _, c := range casos {
		l := LerPrazo(c.texto)
		if l.Natureza != c.natureza || l.Dias != c.dias {
			t.Errorf("%q → (%s, %d dias), esperado (%s, %d dias)",
				c.texto, l.Natureza, l.Dias, c.natureza, c.dias)
		}
	}
}

func TestLerPrazoSempreExplicaALeitura(t *testing.T) {
	// A sugestão precisa poder ser recusada com conhecimento de causa. Uma
	// data que aparece sem dizer de onde veio só pode ser aceita no escuro.
	for _, s := range []string{"Imediato", "Contínuo", "Próximas semanas", "Quando der"} {
		if LerPrazo(s).Como == "" {
			t.Errorf("%q não explicou a leitura", s)
		}
	}
}

func TestDataExplicitaUsaOAnoDaConversa(t *testing.T) {
	// Um encaminhamento de dezembro com prazo "05/01" é do ano seguinte.
	if d := DataExplicita("entregar até 05/01", "2026-12-10"); d != "2027-01-05" {
		t.Errorf("%q, esperado 2027-01-05", d)
	}
	// E um de 2025 relido hoje não pode virar 2026.
	if d := DataExplicita("até 20/11", "2025-10-01"); d != "2025-11-20" {
		t.Errorf("%q, esperado 2025-11-20", d)
	}
}

func TestDataExplicitaRecusaDataImpossivel(t *testing.T) {
	// 31/02 o calendário "corrige" para 03/03. Quem escreveu errado precisa
	// ver "não consegui ler", não uma data plausível e falsa.
	if d := DataExplicita("até 31/02", "2026-01-10"); d != "" {
		t.Errorf("%q, esperado vazio para data que não existe", d)
	}
}

func TestDataExplicitaAceitaISO(t *testing.T) {
	if d := DataExplicita("prazo 2026-03-15 combinado", "2026-01-10"); d != "2026-03-15" {
		t.Errorf("%q, esperado 2026-03-15", d)
	}
}
