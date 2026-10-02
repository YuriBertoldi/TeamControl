package models

import "time"

const LayoutData = "2006-01-02"

// mesesDesde conta meses cheios entre duas datas ISO. Usado no corte de
// elegibilidade do ciclo: contar dias/30 erraria em fevereiro e em anos
// bissextos, e esse corte decide quem entra na avaliação.
// MesesEntre é o mesmo cálculo, exportado para a camada de API.
func MesesEntre(de, ate string) int { return mesesDesde(de, ate) }

func mesesDesde(de, ate string) int {
	d, err1 := time.Parse(LayoutData, de)
	a, err2 := time.Parse(LayoutData, ate)
	if err1 != nil || err2 != nil || a.Before(d) {
		return 0
	}
	meses := (a.Year()-d.Year())*12 + int(a.Month()) - int(d.Month())
	if a.Day() < d.Day() {
		meses-- // ainda não completou o mês corrente
	}
	if meses < 0 {
		return 0
	}
	return meses
}

// DiasEntre devolve a diferença em dias entre duas datas ISO.
func DiasEntre(de, ate string) int {
	d, err1 := time.Parse(LayoutData, de)
	a, err2 := time.Parse(LayoutData, ate)
	if err1 != nil || err2 != nil {
		return 0
	}
	return int(a.Sub(d).Hours() / 24)
}

func Hoje() string { return time.Now().Format(LayoutData) }
