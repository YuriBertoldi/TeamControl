package ingest_test

// Testes contra a pasta REAL de registros.
//
// São pulados quando PASTA_REGISTROS não aponta para nada — e é assim que o
// repositório continua sem dado nenhum: o teste conhece o formato, não o
// conteúdo. Nenhuma asserção aqui cita nome de pessoa.
//
// O que eles protegem: os parsers leem arquivos escritos à mão, que mudam de
// formato sem aviso. Um parser que silenciosamente devolve zero drivers é pior
// que um que falha, porque a AVD fica vazia e ninguém percebe até a mesa.

import (
	"os"
	"path/filepath"
	"testing"

	"teamcontrol/internal/ingest"
)

func pasta(t *testing.T) string {
	t.Helper()
	p := os.Getenv("PASTA_REGISTROS")
	if p == "" {
		t.Skip("PASTA_REGISTROS não definida — teste de formato pulado")
	}
	if _, err := os.Stat(p); err != nil {
		t.Skipf("PASTA_REGISTROS inacessível: %v", err)
	}
	return p
}

func TestRegistrosReaisParseiam(t *testing.T) {
	raiz := pasta(t)
	arquivos, err := filepath.Glob(filepath.Join(raiz, "registros-1-1", "*.md"))
	if err != nil || len(arquivos) == 0 {
		t.Skip("sem registros 1:1 na pasta")
	}

	var comAvaliacao, comEncaminhamento, comOmissao int
	for _, a := range arquivos {
		f, err := os.Open(a)
		if err != nil {
			t.Fatalf("abrir %s: %v", filepath.Base(a), err)
		}
		reg, err := ingest.ParseRegistro(f)
		f.Close()
		if err != nil {
			t.Errorf("%s: %v", filepath.Base(a), err)
			continue
		}
		if reg.NomeBruto == "" {
			t.Errorf("%s: não identificou o liderado", filepath.Base(a))
		}
		if reg.Compartilhavel == "" {
			t.Errorf("%s: Parte 1 vazia", filepath.Base(a))
		}
		if reg.Performance != "" {
			comAvaliacao++
		}
		if len(reg.Encaminhamentos) > 0 {
			comEncaminhamento++
		}
		if len(reg.Omissoes) > 0 {
			comOmissao++
		}
	}

	// Não fixo o número exato — a pasta cresce. Fixo que o parser extrai cada
	// uma das três coisas de ALGUM arquivo: se um dia parar de extrair, isto
	// quebra em vez de produzir banco vazio em silêncio.
	if comAvaliacao == 0 {
		t.Error("nenhum registro rendeu avaliação — o parser do formulário quebrou")
	}
	if comEncaminhamento == 0 {
		t.Error("nenhum registro rendeu encaminhamento — a tabela mudou de formato")
	}
	if comOmissao == 0 {
		t.Error("nenhum registro rendeu omissão — a seção mudou de formato")
	}
	t.Logf("%d registros · %d com avaliação · %d com encaminhamento · %d com omissão",
		len(arquivos), comAvaliacao, comEncaminhamento, comOmissao)
}

func TestRascunhosAVDReaisParseiam(t *testing.T) {
	raiz := pasta(t)
	arquivos, err := filepath.Glob(filepath.Join(raiz, "AVD-*", "Rascunhos", "*.md"))
	if err != nil || len(arquivos) == 0 {
		t.Skip("sem rascunhos de AVD na pasta")
	}

	var avaliados int
	for _, a := range arquivos {
		nome := filepath.Base(a)
		if nome == "00-LEIA-ME.md" {
			continue
		}
		f, err := os.Open(a)
		if err != nil {
			t.Fatalf("abrir %s: %v", nome, err)
		}
		ras, err := ingest.ParseRascunho(f)
		f.Close()
		if err != nil {
			t.Errorf("%s: %v", nome, err)
			continue
		}
		avaliados++

		// 8 comportamentais + 6 técnicos é a estrutura do ciclo. Um arquivo que
		// renda menos que isso significa driver perdido — e driver perdido vira
		// nota faltando na hora de defender.
		if len(ras.Drivers) != 14 {
			t.Errorf("%s: %d drivers, esperado 14", nome, len(ras.Drivers))
		}
		var comp, desemp int
		for _, d := range ras.Drivers {
			switch d.Eixo {
			case "comportamento":
				comp++
			case "desempenho":
				desemp++
			}
			if d.Nota < 1 || d.Nota > 4 {
				t.Errorf("%s: driver %q com nota %d fora da escala", nome, d.Nome, d.Nota)
			}
			if d.Comentario == "" {
				t.Errorf("%s: driver %q sem comentário", nome, d.Nome)
			}
		}
		if comp != 8 || desemp != 6 {
			t.Errorf("%s: %d comportamento / %d desempenho, esperado 8/6", nome, comp, desemp)
		}
		if len(ras.Abertas) != 2 {
			t.Errorf("%s: %d perguntas abertas, esperado 2", nome, len(ras.Abertas))
		}
		if ras.QuadranteAlvo == "" {
			t.Errorf("%s: sem quadrante-alvo", nome)
		}
	}
	if avaliados == 0 {
		t.Error("nenhum rascunho avaliado")
	}
	t.Logf("%d rascunhos de AVD parseados", avaliados)
}

func TestLeiaMeEDefesasReaisParseiam(t *testing.T) {
	raiz := pasta(t)

	leia, err := filepath.Glob(filepath.Join(raiz, "AVD-*", "Rascunhos", "00-LEIA-ME.md"))
	if err == nil && len(leia) > 0 {
		f, err := os.Open(leia[0])
		if err != nil {
			t.Fatal(err)
		}
		c, err := ingest.ParseLeiaMe(f)
		f.Close()
		if err != nil {
			t.Fatalf("LEIA-ME: %v", err)
		}
		if c.EscalaMin != 1 || c.EscalaMax != 4 {
			t.Errorf("escala %d–%d, esperado 1–4", c.EscalaMin, c.EscalaMax)
		}
		if c.FaixaBaixo <= 0 || c.FaixaMedio <= c.FaixaBaixo {
			t.Errorf("faixas incoerentes: baixo<=%.2f medio<=%.2f", c.FaixaBaixo, c.FaixaMedio)
		}
		if len(c.Alvos) == 0 {
			t.Error("nenhum quadrante-alvo lido — a tabela mudou de formato")
		}
		t.Logf("ciclo %d · escala %d–%d · faixas %.2f/%.2f · %d alvos",
			c.Ano, c.EscalaMin, c.EscalaMax, c.FaixaBaixo, c.FaixaMedio, len(c.Alvos))
	}

	def, err := filepath.Glob(filepath.Join(raiz, "AVD-*", "Defesas-Calibragem.md"))
	if err != nil || len(def) == 0 {
		t.Skip("sem arquivo de defesas")
	}
	f, err := os.Open(def[0])
	if err != nil {
		t.Fatal(err)
	}
	ds, inicio, fim, err := ingest.ParseDefesas(f)
	f.Close()
	if err != nil {
		t.Fatalf("defesas: %v", err)
	}
	if inicio == "" || fim == "" {
		// Sem período o ciclo não tem corte de elegibilidade, e o sistema
		// passaria a classificar quem entra na AVD por um valor inventado.
		t.Error("não li o período do ciclo no cabeçalho das defesas")
	}
	if len(ds) == 0 {
		t.Fatal("nenhuma defesa lida — o cabeçalho de seção mudou")
	}
	var semTese int
	for _, d := range ds {
		// A contra-evidência é o que a mesa pergunta. Defesa sem ela é peça de
		// advocacia cega, e o sistema existe justamente para não produzir isso.
		// Por isso ela é obrigatória aqui, e a tese não: a tese é resumo, e há
		// caso real de defesa escrita sem ela.
		if d.PorQueNaoMaior == "" {
			t.Errorf("defesa de %q sem contra-evidência", d.NomeBruto)
		}
		if d.Tese == "" {
			semTese++
		}
	}
	t.Logf("%d defesas parseadas · %d sem tese", len(ds), semTese)
}

func TestDossiesReaisParseiam(t *testing.T) {
	raiz := pasta(t)
	arquivos, _ := filepath.Glob(filepath.Join(raiz, "AVD-*", "Dossies*", "*.md"))
	if len(arquivos) == 0 {
		t.Skip("sem dossiês na pasta")
	}

	var dossies, reunioes, feedbacks, comAdmissao, semPerformance int
	for _, caminho := range arquivos {
		if filepath.Base(caminho) == "00-INDICE.md" {
			continue
		}
		f, err := os.Open(caminho)
		if err != nil {
			t.Fatalf("%s: %v", filepath.Base(caminho), err)
		}
		d, err := ingest.ParseDossie(f)
		f.Close()
		if err != nil {
			t.Fatalf("%s: %v", filepath.Base(caminho), err)
		}
		dossies++
		reunioes += len(d.Reunioes)
		feedbacks += len(d.Feedbacks)
		if d.Admissao != "" {
			comAdmissao++
		}
		for _, r := range d.Reunioes {
			// Performance vazia significa rótulo que o mapa não conhece. Uma
			// avaliação sem performance é uma linha a menos na calibragem, e
			// some sem erro nenhum — exatamente o que estes testes existem
			// para pegar.
			if r.Performance == "" {
				semPerformance++
			}
			if r.Avaliacao == "" {
				t.Errorf("%s: reunião %s sem avaliação do líder",
					filepath.Base(caminho), r.Data)
			}
		}
	}

	if semPerformance > 0 {
		t.Errorf("%d reuniões com performance não reconhecida", semPerformance)
	}
	if reunioes == 0 || feedbacks == 0 {
		t.Errorf("%d dossiês renderam %d reuniões e %d feedbacks — esperado mais que zero",
			dossies, reunioes, feedbacks)
	}
	t.Logf("%d dossiês · %d reuniões · %d feedbacks · %d com data de admissão",
		dossies, reunioes, feedbacks, comAdmissao)
}
