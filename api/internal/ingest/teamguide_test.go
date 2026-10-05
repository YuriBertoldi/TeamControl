package ingest

import (
	"strings"
	"testing"
)

const pacoteTG = `{
 "ciclo": "Ciclo de Desempenho Exemplo",
 "assessmentId": 6661,
 "lider": "COORDENACAO EXEMPLO",
 "pessoas": [
  {
   "participant": 1001, "employeeId": 55, "nome": "PARTICIPANTE EXEMPLO",
   "cargo": "DESENVOLVEDOR SENIOR", "admissao": "2025-09-15",
   "categorias": [
    {"nome": "Comportamento", "lider": 3.3, "self": 4.0, "media": 3.6},
    {"nome": "Desempenho", "lider": 3.1, "self": 4.0, "media": 3.5}
   ],
   "criterios": [
    {"ord": 12, "eixo": "comportamento", "ordem": 1, "formato": "SCALE",
     "texto": "Vai além do que foi solicitado?", "notaLider": 3, "notaSelf": 4,
     "comentarios": [
      {"autorId": 99, "deQuem": "lider", "texto": "Entrega consistente."},
      {"autorId": 55, "deQuem": "auto", "texto": "Acho que vou além."}
     ]},
    {"ord": 20, "eixo": "desempenho", "ordem": 1, "formato": "SCALE",
     "texto": "Demonstra domínio técnico?", "notaLider": 3, "notaSelf": 3,
     "comentarios": [{"autorId": 99, "deQuem": "lider", "texto": "Domina a frente dele."}]},
    {"ord": 26, "eixo": "aberta", "ordem": 1, "formato": "TEXT",
     "texto": "O que deve continuar?", "notaLider": null, "notaSelf": null,
     "comentarios": [{"autorId": 99, "deQuem": "lider", "texto": "Continuar a esteira."}]}
   ]
  }
 ]
}`

func TestParseTeamGuide(t *testing.T) {
	p, err := ParseTeamGuide(strings.NewReader(pacoteTG))
	if err != nil {
		t.Fatalf("parse falhou: %v", err)
	}
	if p.AssessmentID != 6661 || len(p.Pessoas) != 1 {
		t.Fatalf("ciclo %d com %d pessoas", p.AssessmentID, len(p.Pessoas))
	}
	pe := p.Pessoas[0]
	if len(pe.Criterios) != 3 {
		t.Fatalf("%d critérios, esperados 3", len(pe.Criterios))
	}
	if pe.Admissao != "2025-09-15" {
		t.Errorf("admissão %q", pe.Admissao)
	}
}

func TestTeamGuideSeparaLiderDeAutoavaliacao(t *testing.T) {
	// É a razão de existir desta importação: a nota que a pessoa deu a si
	// mesma só existe na ferramenta, e é o gap contra a do líder que carrega
	// o sinal. Misturar as duas apagaria exatamente o que se foi buscar.
	p, _ := ParseTeamGuide(strings.NewReader(pacoteTG))
	c := p.Pessoas[0].Criterios[0]

	if *c.NotaLider != 3 || *c.NotaSelf != 4 {
		t.Errorf("notas líder=%d self=%d, esperadas 3 e 4", *c.NotaLider, *c.NotaSelf)
	}
	if c.Comentario("lider") != "Entrega consistente." {
		t.Errorf("comentário do líder: %q", c.Comentario("lider"))
	}
	if c.Comentario("auto") != "Acho que vou além." {
		t.Errorf("comentário da autoavaliação: %q", c.Comentario("auto"))
	}
}

func TestTeamGuideComentarioAusenteNaoViraDoOutro(t *testing.T) {
	// O segundo critério só tem comentário do líder. Devolver o dele quando se
	// pede o da pessoa atribuiria a ela uma frase que ela não escreveu — numa
	// tela que vai para a mesa de calibragem.
	p, _ := ParseTeamGuide(strings.NewReader(pacoteTG))
	c := p.Pessoas[0].Criterios[1]
	if c.Comentario("auto") != "" {
		t.Errorf("comentário da autoavaliação %q, esperado vazio", c.Comentario("auto"))
	}
	if c.Comentario("lider") == "" {
		t.Error("comentário do líder sumiu")
	}
}

func TestTeamGuideMediaPorLeitura(t *testing.T) {
	p, _ := ParseTeamGuide(strings.NewReader(pacoteTG))
	pe := p.Pessoas[0]
	if v := pe.MediaDe("comportamento", "lider"); v == nil || *v != 3.3 {
		t.Errorf("média de comportamento do líder: %v", v)
	}
	if v := pe.MediaDe("desempenho", "auto"); v == nil || *v != 4.0 {
		t.Errorf("média de desempenho da autoavaliação: %v", v)
	}
}

func TestTeamGuideRecusaPacoteIncompleto(t *testing.T) {
	// Metade de um ciclo de AVD no banco é pior que nenhum: a calibragem
	// sairia com gente faltando e sem nada avisando.
	casos := map[string]string{
		"sem ciclo":       `{"pessoas":[{"nome":"X","criterios":[{"ord":1}]}]}`,
		"sem pessoas":     `{"ciclo":"C","pessoas":[]}`,
		"pessoa sem nome": `{"ciclo":"C","pessoas":[{"criterios":[{"ord":1}]}]}`,
		"sem critérios":   `{"ciclo":"C","pessoas":[{"nome":"X","criterios":[]}]}`,
		"json quebrado":   `{"ciclo":`,
	}
	for nome, j := range casos {
		if _, err := ParseTeamGuide(strings.NewReader(j)); err == nil {
			t.Errorf("%s: esperado erro", nome)
		}
	}
}
