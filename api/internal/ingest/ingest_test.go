package ingest

// Testes dos parsers de ingestão.
//
// Os casos aqui são os arquivos REAIS da pasta, não exemplos inventados. Isso
// importa: o Tactiq indenta o cabeçalho com dois espaços, injeta uma linha de
// ruído atribuída ao coordenador no meio da fala do liderado, e pelo menos dois
// arquivos têm a data do nome divergindo da data do conteúdo. Um fixture limpo
// passaria em todos os testes e falharia na primeira pasta de verdade.

import (
	"strings"
	"testing"
)

// Cabeçalho no formato exato do Tactiq, com a indentação de dois espaços.
const transcricaoTactiq = `# PARTICIPANTE EXEMPLO <> COORDENACAO EXEMPLO - Reunião 1-1
  Meeting started: 27/08/2026, 15:02:47
  Duration: 18 minutes
  Participants: Participante Exemplo, Coordenação Exemplo
  [View original transcript](https://app.tactiq.io/xyz)
  ## Transcript
  00:00 Participante Exemplo: Tá com delay.
  00:04 Coordenação Exemplo: Agora melhorou.
  00:09 Participante Exemplo: Então, sobre a sprint.
  00:15 Participante Exemplo: A capacidade ficou apertada.
`

func TestParseTactiqCabecalho(t *testing.T) {
	tr, err := ParseTactiq(strings.NewReader(transcricaoTactiq), "Coordenação Exemplo")
	if err != nil {
		t.Fatalf("parse falhou: %v", err)
	}

	if tr.Data != "2026-08-27" {
		t.Errorf("data %q, esperado 2026-08-27", tr.Data)
	}
	if tr.DuracaoMin != 18 {
		t.Errorf("duração %d, esperado 18", tr.DuracaoMin)
	}
}

func TestParseTactiqParticipanteEhAMelhorFonteDoNome(t *testing.T) {
	// Melhor que o nome do arquivo, que costuma vir abreviado ou com grafia errada.
	tr, err := ParseTactiq(strings.NewReader(transcricaoTactiq), "Coordenação Exemplo")
	if err != nil {
		t.Fatal(err)
	}
	if tr.Participante != "Participante Exemplo" {
		t.Errorf("liderado %q, esperado o participante que não é o coordenador", tr.Participante)
	}
}

func TestParseTactiqTextoCanonicoEhEstavel(t *testing.T) {
	// Os offsets das evidências apontam para este texto. Se o formato mudar,
	// toda evidência já gravada passa a apontar para o lugar errado — por isso
	// o teste trava o formato "MM:SS Falante: fala\n".
	tr, err := ParseTactiq(strings.NewReader(transcricaoTactiq), "Coordenação Exemplo")
	if err != nil {
		t.Fatal(err)
	}

	if !strings.Contains(tr.TextoCanonico, "00:00 Participante Exemplo: Tá com delay.") {
		t.Errorf("texto canônico fora do formato esperado:\n%s", tr.TextoCanonico)
	}
	if strings.Contains(tr.TextoCanonico, "\r") {
		t.Error("texto canônico tem CRLF — offsets quebram entre sistemas")
	}
	if strings.Contains(tr.TextoCanonico, "Meeting started") {
		t.Error("cabeçalho vazou para o texto canônico")
	}
}

func TestParseTactiqOffsetsApontamParaOTextoCanonico(t *testing.T) {
	tr, err := ParseTactiq(strings.NewReader(transcricaoTactiq), "Coordenação Exemplo")
	if err != nil {
		t.Fatal(err)
	}
	if len(tr.Linhas) == 0 {
		t.Fatal("nenhuma linha extraída")
	}

	runas := []rune(tr.TextoCanonico)
	for _, l := range tr.Linhas {
		if l.CharInicio < 0 || l.CharFim > len(runas) || l.CharInicio > l.CharFim {
			t.Fatalf("offset fora do texto: [%d,%d] em texto de %d runas",
				l.CharInicio, l.CharFim, len(runas))
		}
		trecho := string(runas[l.CharInicio:l.CharFim])
		if !strings.Contains(trecho, l.Texto) {
			t.Errorf("offset [%d,%d] devolve %q, não contém a fala %q",
				l.CharInicio, l.CharFim, trecho, l.Texto)
		}
	}
}

func TestParseTactiqSeparaFalasConsecutivas(t *testing.T) {
	tr, err := ParseTactiq(strings.NewReader(transcricaoTactiq), "Coordenação Exemplo")
	if err != nil {
		t.Fatal(err)
	}
	// Quatro falas no fixture. Falante com linhas seguidas é agrupado para o
	// LLM, mas persistido linha a linha para os offsets continuarem válidos.
	if len(tr.Linhas) != 4 {
		t.Errorf("%d linhas, esperado 4", len(tr.Linhas))
	}
}

func TestParseTactiqMarcaRuido(t *testing.T) {
	comRuido := `# X <> COORDENACAO - Reunião 1-1
  Meeting started: 27/08/2026, 15:02:47
  Duration: 5 minutes
  Participants: Outro Participante, Coordenação Exemplo
  ## Transcript
  00:00 Outro Participante: Começando.
  00:02 Coordenação Exemplo: Estou transcrevendo esta chamada com o Tactiq.
  00:05 Outro Participante: Seguindo.
`
	tr, err := ParseTactiq(strings.NewReader(comRuido), "Coordenação Exemplo")
	if err != nil {
		t.Fatal(err)
	}

	var ruidos int
	for _, l := range tr.Linhas {
		if l.Ruido {
			ruidos++
		}
	}
	if ruidos == 0 {
		t.Error("a linha de ruído do Tactiq não foi marcada — ela entra como fala do coordenador no meio da conversa")
	}
}

func TestParseTactiqRecusaArquivoQueNaoEhTactiq(t *testing.T) {
	_, err := ParseTactiq(strings.NewReader("# Registro de 1:1\n\nTexto qualquer.\n"),
		"Coordenação Exemplo")
	if err == nil {
		t.Error("parser aceitou arquivo sem cabeçalho do Tactiq")
	}
}

func TestDetectarTipo(t *testing.T) {
	casos := []struct {
		nome      string
		caminho   string
		cabecalho string
		esperado  string
	}{
		{"tactiq", "Pessoa/27-08-26 - PESSOA.txt", "# X\n  Meeting started: 27/08/2026", "tactiq_txt"},
		{"notas gemini", "Bruno/Anotações do Gemini 2026_09_22.pdf", "", "gemini_notes_pdf"},
		{"transcript gemini", "Bruno/Transcript 2026_09_22.pdf", "", "gemini_transcript_pdf"},
		{"material avd", "AVD-2026/00-LEIA-ME.pdf", "", "material_avd_pdf"},
		{"registro", "registros-1-1/2026-09-22_diego-nunes.md", "", "registro_md"},
		{"dossiê", "AVD-2026/Dossies/pessoa.md", "", "dossie_md"},
		{"rascunho", "AVD-2026/Rascunhos/pessoa.md", "", "rascunho_avd_md"},
		{"feedback", "Zeca/Feedback/2026-09-16 - Feedback.md", "", "feedback_md"},
		{"desconhecido", "qualquer/coisa.md", "", "desconhecido"},
	}
	for _, c := range casos {
		if got := DetectarTipo(c.caminho, c.cabecalho); got != c.esperado {
			t.Errorf("%s: tipo %q, esperado %q", c.nome, got, c.esperado)
		}
	}
}

func TestDetectarTipoNaoConfundeTxtSemCabecalho(t *testing.T) {
	// `.txt` só é Tactiq se tiver "Meeting started". Um `.txt` solto na pasta
	// não pode virar transcrição e entrar na contagem de 1:1 do ciclo.
	if got := DetectarTipo("notas.txt", "anotações soltas"); got == "tactiq_txt" {
		t.Error("txt sem cabeçalho foi classificado como Tactiq")
	}
}

func TestDataDoNome(t *testing.T) {
	casos := []struct{ nome, esperado string }{
		{"2026-09-22_diego-nunes.md", "2026-09-22"},
		{"2026-09-25_pessoa_compartilhavel.md", "2026-09-25"},
		{"Anotações do Gemini 2026_09_22 11_15 GMT-03_00.pdf", "2026-09-22"},
		{"27-08-26 - NOME SOBRENOME.txt", "2026-08-27"},
		{"sem data nenhuma.md", ""},
	}
	for _, c := range casos {
		if got := DataDoNome(c.nome); got != c.esperado {
			t.Errorf("%q: data %q, esperado %q", c.nome, got, c.esperado)
		}
	}
}

func TestDataDoNomeCasoRealDoFelipe(t *testing.T) {
	// Arquivo real: o nome diz ano 25, o conteúdo diz 2026. A data do nome é
	// auditoria, não verdade — mas precisa ser extraída para a divergência
	// poder ser detectada.
	if got := DataDoNome("17-08-25 - FELIPE ARAÚJO.txt"); got != "2025-08-17" {
		t.Errorf("data %q, esperado 2025-08-17 (o valor errado do nome, de propósito)", got)
	}
}

func TestDataDoNomePrefereOFormatoISO(t *testing.T) {
	// Nome que casa com mais de um padrão: o ISO no começo vence, porque é o
	// formato que o próprio sistema gera.
	if got := DataDoNome("2026-09-22_pessoa_2025_01_01.md"); got != "2026-09-22" {
		t.Errorf("data %q, esperado 2026-09-22", got)
	}
}
