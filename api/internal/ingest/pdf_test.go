package ingest_test

// Testes dos parsers de PDF contra os arquivos reais.
//
// Pulados sem PASTA_REGISTROS, como os demais: conhecem o formato, nunca o
// conteúdo. Nenhuma asserção cita nome de pessoa.

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"teamcontrol/internal/ingest"
)

const coordenadorTeste = "Yuri Bulhões Bertoldi"

// pdfsPorTipo devolve os PDFs da pasta separados pelo que o nome indica.
func pdfsPorTipo(t *testing.T, raiz string) (notas, transcricoes []string) {
	t.Helper()
	_ = filepath.Walk(raiz, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.EqualFold(filepath.Ext(p), ".pdf") {
			return nil
		}
		nome := filepath.Base(p)
		switch {
		case strings.Contains(nome, "Anotações do Gemini"):
			notas = append(notas, p)
		case strings.Contains(nome, "Transcript"):
			transcricoes = append(transcricoes, p)
		}
		return nil
	})
	return
}

func TestPdftotextEstaDisponivel(t *testing.T) {
	if !ingest.PdftotextDisponivel() {
		t.Skip("pdftotext ausente — a ingestão de PDF fica pendente, por desenho")
	}
}

func TestNotasGeminiReaisParseiam(t *testing.T) {
	raiz := pasta(t)
	if !ingest.PdftotextDisponivel() {
		t.Skip("pdftotext ausente")
	}
	notas, _ := pdfsPorTipo(t, raiz)
	if len(notas) == 0 {
		t.Skip("sem anotações do Gemini na pasta")
	}

	var comData, comEtapas, comMarcacao int
	for _, p := range notas {
		nome := filepath.Base(p)

		texto, extrator, err := ingest.ExtrairTextoPDF(p)
		if err != nil {
			t.Errorf("%s: %v", nome, err)
			continue
		}
		if extrator != "pdftotext" {
			t.Errorf("%s: extrator inesperado %q", nome, extrator)
		}

		qual, motivo := ingest.QualidadeExtracao(texto)
		if qual == "falhou" {
			t.Errorf("%s: extração reprovada (%s)", nome, motivo)
			continue
		}

		n, err := ingest.ParseGeminiNotas(texto)
		if err != nil {
			t.Errorf("%s: %v", nome, err)
			continue
		}
		if n.Participante == "" {
			t.Errorf("%s: sem participante", nome)
		}
		if n.Resumo == "" {
			t.Errorf("%s: sem resumo — a seção mudou de nome", nome)
		}
		if n.DataConteudo != "" {
			comData++
		}
		if len(n.Etapas) > 0 {
			comEtapas++
		}
		if n.Marcacoes > 0 {
			comMarcacao++
		}
		for _, e := range n.Etapas {
			if e.Responsavel == "" || e.Descricao == "" {
				t.Errorf("%s: etapa incompleta %+v", nome, e)
			}
		}
	}

	// A data do conteúdo é o que permite flagrar nome de arquivo digitado
	// errado. Se o parser parar de lê-la, a divergência deixa de ser detectada
	// em silêncio — que é justamente o caso que ela existe para pegar.
	if comData == 0 {
		t.Error("nenhuma nota rendeu data de conteúdo — o formato da data mudou")
	}
	if comEtapas == 0 {
		t.Error("nenhuma nota rendeu próximas etapas — a seção mudou de formato")
	}
	t.Logf("%d notas · %d com data de conteúdo · %d com etapas · %d com marcação de tempo",
		len(notas), comData, comEtapas, comMarcacao)
}

func TestTranscricoesGeminiReaisParseiam(t *testing.T) {
	raiz := pasta(t)
	if !ingest.PdftotextDisponivel() {
		t.Skip("pdftotext ausente")
	}
	_, transcricoes := pdfsPorTipo(t, raiz)
	if len(transcricoes) == 0 {
		t.Skip("sem transcrições do Gemini na pasta")
	}

	var atribuidas, recusadas int
	for _, p := range transcricoes {
		nome := filepath.Base(p)

		texto, _, err := ingest.ExtrairTextoPDF(p)
		if err != nil {
			t.Errorf("%s: %v", nome, err)
			continue
		}
		tr, err := ingest.ParseGeminiTranscricao(texto, coordenadorTeste)
		if err != nil {
			// Recusar é um resultado legítimo, e o mais importante deles: há
			// PDF de apresentação em grupo nesta pasta, e atribuí-lo a alguém
			// penduraria a fala de várias pessoas no histórico de uma só.
			recusadas++
			t.Logf("%s: recusada (vai para revisão) — %v", nome, err)
			continue
		}
		atribuidas++
		if tr.Participante == "" {
			t.Errorf("%s: sem participante", nome)
		}
		if len(tr.Linhas) < 10 {
			t.Errorf("%s: só %d falas — o parser perdeu a transcrição", nome, len(tr.Linhas))
		}

		// O offset tem que apontar para o texto canônico, senão toda citação
		// futura abre no lugar errado. É a mesma garantia exigida do Tactiq.
		runas := []byte(tr.TextoCanonico)
		for _, l := range tr.Linhas {
			if l.CharInicio < 0 || l.CharFim > len(runas) || l.CharInicio > l.CharFim {
				t.Errorf("%s: offset fora do texto na fala %d", nome, l.Ord)
				break
			}
			if trecho := string(runas[l.CharInicio:l.CharFim]); trecho != l.Texto {
				t.Errorf("%s: fala %d — offset aponta para %q, esperado %q",
					nome, l.Ord, trunca(trecho), trunca(l.Texto))
				break
			}
		}

		var doCoordenador int
		for _, l := range tr.Linhas {
			if l.EhCoordenador {
				doCoordenador++
			}
		}
		if doCoordenador == 0 {
			t.Errorf("%s: nenhuma fala atribuída ao coordenador", nome)
		}
		t.Logf("%s: %d falas, %d do coordenador", nome, len(tr.Linhas), doCoordenador)
	}

	if atribuidas == 0 {
		t.Error("nenhuma transcrição foi atribuída — o parser parou de reconhecer o formato")
	}
	t.Logf("%d transcrições · %d atribuídas · %d recusadas por ambiguidade",
		len(transcricoes), atribuidas, recusadas)
}

func trunca(s string) string {
	if len(s) > 48 {
		return s[:45] + "..."
	}
	return s
}
