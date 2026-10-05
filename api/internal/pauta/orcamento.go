package pauta

// Orçamento de tempo.
//
// Pauta de quinze itens numa conversa de trinta minutos é pauta ignorada. O
// sistema não devolve tudo o que achou: devolve o que cabe, e diz o que ficou
// de fora.
//
// Duas regras, e a ordem entre elas é a decisão de produto que mais pesa aqui:
//
//  1. **Prioridade é estrita.** Item ALTA nunca é deslocado por garantia
//     nenhuma. Se há três coisas urgentes, elas entram.
//  2. **As garantias RESERVAM espaço antes do preenchimento.** Um item de
//     prioridade baixa não pode espremer a escuta para fora — e sem a reserva
//     é exatamente isso que aconteceria, porque a escuta é a última da ordem.
//
// Quando nem assim cabe, o sistema **não corta**: ele avisa que a pauta ficou
// só cobrança, diz quanto tempo faltaria, e deixa a decisão com quem conduz.

import "sort"

// Montagem é a pauta que coube, mais o que ficou de fora.
type Montagem struct {
	Dentro     []Assunto `json:"dentro"`
	Fora       []Assunto `json:"fora"`
	Minutos    int       `json:"minutos"`
	Alocados   int       `json:"alocados"`
	Injetados  []string  `json:"injetados"`
	Aviso      string    `json:"aviso,omitempty"`
	MinimoReal int       `json:"minimoReal,omitempty"`
}

// Caber monta a pauta dentro do orçamento.
func Caber(assuntos []Assunto, minutos int) Montagem {
	m := Montagem{Dentro: []Assunto{}, Fora: []Assunto{}, Minutos: minutos,
		Injetados: []string{}}

	var escutas, resto []Assunto
	for _, a := range assuntos {
		if a.Prioridade == Escuta {
			escutas = append(escutas, a)
		} else {
			resto = append(resto, a)
		}
	}
	sort.SliceStable(resto, func(i, j int) bool {
		return ordemPrioridade[resto[i].Prioridade] < ordemPrioridade[resto[j].Prioridade]
	})

	dentro := map[string]bool{}
	usado := 0

	// 1. Todo ALTA entra, antes de qualquer garantia.
	for _, a := range resto {
		if a.Prioridade != Alta {
			continue
		}
		if usado+a.Minutos <= minutos {
			m.Dentro = append(m.Dentro, a)
			dentro[a.ID] = true
			usado += a.Minutos
		}
	}

	// 2. Reserva o espaço das duas garantias: um item de desenvolvimento e a
	//    escuta aberta. Reservar ANTES de preencher é o que impede um item de
	//    prioridade baixa de ocupar o lugar delas.
	var dev *Assunto
	for i := range resto {
		if !dentro[resto[i].ID] && resto[i].Categoria == "Desenvolvimento" {
			dev = &resto[i]
			break
		}
	}
	custoEscuta := 0
	for _, e := range escutas {
		custoEscuta += e.Minutos
	}
	custoDev := 0
	if dev != nil {
		custoDev = dev.Minutos
	}
	cabeEscuta := usado+custoEscuta <= minutos
	cabeDev := usado+boolInt(cabeEscuta, custoEscuta)+custoDev <= minutos
	reservado := boolInt(cabeEscuta, custoEscuta) + boolInt(cabeDev, custoDev)

	// 3. Preenche o que sobra com MÉDIA e BAIXA.
	for _, a := range resto {
		if dentro[a.ID] || (dev != nil && a.ID == dev.ID) {
			continue
		}
		if usado+a.Minutos <= minutos-reservado {
			m.Dentro = append(m.Dentro, a)
			dentro[a.ID] = true
			usado += a.Minutos
		}
	}

	// 4. Aplica as garantias no espaço reservado.
	if dev != nil && cabeDev {
		m.Dentro = append(m.Dentro, *dev)
		dentro[dev.ID] = true
		m.Injetados = append(m.Injetados, dev.ID)
		usado += dev.Minutos
	}
	if cabeEscuta {
		for _, e := range escutas {
			m.Dentro = append(m.Dentro, e)
			dentro[e.ID] = true
			m.Injetados = append(m.Injetados, e.ID)
			usado += e.Minutos
		}
	}

	for _, a := range assuntos {
		if !dentro[a.ID] {
			m.Fora = append(m.Fora, a)
		}
	}
	sort.SliceStable(m.Dentro, func(i, j int) bool {
		return ordemPrioridade[m.Dentro[i].Prioridade] < ordemPrioridade[m.Dentro[j].Prioridade]
	})
	m.Alocados = usado

	// 5. O aviso. Não corta nada — informa e devolve a decisão.
	if !cabeEscuta || !cabeDev {
		falta := 0
		for _, a := range assuntos {
			if a.Prioridade == Alta || a.Prioridade == Escuta ||
				(dev != nil && a.ID == dev.ID) {
				falta += a.Minutos
			}
		}
		m.MinimoReal = falta
		m.Aviso = "Esta pauta ficou só cobrança — a 1:1 vira status report. " +
			"Para caber o item de desenvolvimento e a escuta aberta seriam necessários " +
			itoa(falta) + " minutos."
	}
	return m
}

func boolInt(b bool, v int) int {
	if b {
		return v
	}
	return 0
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var b []byte
	for n > 0 {
		b = append([]byte{byte('0' + n%10)}, b...)
		n /= 10
	}
	if neg {
		return "-" + string(b)
	}
	return string(b)
}
