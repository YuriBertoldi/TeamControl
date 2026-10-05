package pauta

import "testing"

func a(id, prio, cat string, min int) Assunto {
	return Assunto{ID: id, Prioridade: prio, Categoria: cat, Minutos: min}
}

func ids(as []Assunto) []string {
	out := []string{}
	for _, x := range as {
		out = append(out, x.ID)
	}
	return out
}

func contem(as []Assunto, id string) bool {
	for _, x := range as {
		if x.ID == id {
			return true
		}
	}
	return false
}

func TestCaberRespeitaOOrcamento(t *testing.T) {
	m := Caber([]Assunto{
		a("a1", Alta, "Compromisso", 10),
		a("a2", Alta, "Risco", 10),
		a("m1", Media, "Desenvolvimento", 8),
		a("b1", Baixa, "Outro", 10),
		a("e", Escuta, "Escuta", 10),
	}, 30)

	if m.Alocados > 30 {
		t.Errorf("alocou %d minutos num orçamento de 30: %v", m.Alocados, ids(m.Dentro))
	}
	if len(m.Dentro)+len(m.Fora) != 5 {
		t.Errorf("%d dentro + %d fora, esperados 5 no total", len(m.Dentro), len(m.Fora))
	}
}

func TestCaberPrioridadeEhEstrita(t *testing.T) {
	// Três itens ALTA consomem o orçamento inteiro. Nenhuma garantia pode
	// deslocá-los: se há três coisas urgentes, elas entram.
	m := Caber([]Assunto{
		a("a1", Alta, "Compromisso", 10),
		a("a2", Alta, "Risco", 10),
		a("a3", Alta, "Compromisso", 10),
		a("m1", Media, "Desenvolvimento", 8),
		a("e", Escuta, "Escuta", 10),
	}, 30)

	for _, id := range []string{"a1", "a2", "a3"} {
		if !contem(m.Dentro, id) {
			t.Errorf("%s ficou de fora — prioridade alta não pode ser deslocada", id)
		}
	}
	if m.Aviso == "" {
		t.Error("esperado aviso de que a pauta virou só cobrança")
	}
	if m.MinimoReal <= 30 {
		t.Errorf("mínimo real %d, esperado acima dos 30 pedidos", m.MinimoReal)
	}
}

func TestCaberReservaEspacoDasGarantias(t *testing.T) {
	// O item de prioridade BAIXA não pode espremer a escuta para fora. Sem a
	// reserva prévia é exatamente isso que aconteceria, porque a escuta é a
	// última da ordem de prioridade.
	m := Caber([]Assunto{
		a("a1", Alta, "Compromisso", 10),
		a("b1", Baixa, "Outro", 20),
		a("m1", Media, "Desenvolvimento", 10),
		a("e", Escuta, "Escuta", 10),
	}, 45)

	if !contem(m.Dentro, "e") {
		t.Errorf("escuta ficou de fora: dentro=%v", ids(m.Dentro))
	}
	if !contem(m.Dentro, "m1") {
		t.Errorf("item de desenvolvimento ficou de fora: dentro=%v", ids(m.Dentro))
	}
	if contem(m.Dentro, "b1") {
		t.Error("item de prioridade baixa ocupou o espaço reservado às garantias")
	}
}

func TestCaberNaoAvisaQuandoAsGarantiasCabem(t *testing.T) {
	m := Caber([]Assunto{
		a("a1", Alta, "Compromisso", 10),
		a("m1", Media, "Desenvolvimento", 10),
		a("e", Escuta, "Escuta", 10),
	}, 60)
	if m.Aviso != "" {
		t.Errorf("avisou sem motivo: %q", m.Aviso)
	}
	if len(m.Injetados) != 2 {
		t.Errorf("injetados %v, esperadas as duas garantias", m.Injetados)
	}
}

func TestCaberOrdenaPorPrioridade(t *testing.T) {
	m := Caber([]Assunto{
		a("e", Escuta, "Escuta", 5),
		a("b1", Baixa, "Outro", 5),
		a("a1", Alta, "Compromisso", 5),
		a("m1", Media, "Desenvolvimento", 5),
	}, 60)

	esperado := []string{"a1", "m1", "b1", "e"}
	for i, id := range esperado {
		if i >= len(m.Dentro) || m.Dentro[i].ID != id {
			t.Fatalf("ordem %v, esperada %v", ids(m.Dentro), esperado)
		}
	}
}

func TestCaberPautaVaziaNaoQuebra(t *testing.T) {
	m := Caber(nil, 45)
	if len(m.Dentro) != 0 || len(m.Fora) != 0 {
		t.Errorf("pauta vazia devolveu %d dentro e %d fora", len(m.Dentro), len(m.Fora))
	}
}
