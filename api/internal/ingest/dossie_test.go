package ingest

import (
	"strings"
	"testing"
)

// Formato exato dos dossiês, incluindo as duas armadilhas reais: a mesma data
// aparecendo em duas reuniões seguidas, e a admissão escrita como "-" com um
// comentário atrás, que não é data nenhuma.
const dossieExemplo = `# PARTICIPANTE EXEMPLO

- **Cargo:** DESENVOLVEDOR SENIOR (promovido no período)
- **Admissão:** - (recontratado, com experiência anterior)
- **1:1s em 2026:** 3

> Time de exemplo. Lidera tecnicamente a frente mais complexa.

## Reuniões 1:1 (2026)

### 2026-01-12 — Performance: Satisfatória

**Avaliação do líder:** Primeira avaliação do período.

### 2026-01-12 — Performance: Satisfatória

**Avaliação do líder:** Lançamento duplicado na ferramenta.

### 2026-02-09 — Performance: Excepcional

**Avaliação do líder:** Contribuiu muito com o time.

**Notas compartilhadas:** Pessoal — tudo certo.
Técnico — desenhando a estratégia da refatoração.

## Feedbacks recebidos (2)

- **[Positivo]** 2025-10-14 — de OUTRA PESSOA:
  > Reconhecimento pelo trabalho na força-tarefa.

- **[Construtivo]** 2026-03-02 — de TERCEIRA PESSOA *(autoria registrada assim no sistema — conferir)*:
  > Ponto de melhoria na comunicação escrita.
`

func TestParseDossieCabecalho(t *testing.T) {
	d, err := ParseDossie(strings.NewReader(dossieExemplo))
	if err != nil {
		t.Fatalf("parse falhou: %v", err)
	}
	if d.Nome != "PARTICIPANTE EXEMPLO" {
		t.Errorf("nome %q", d.Nome)
	}
	if !strings.HasPrefix(d.Cargo, "DESENVOLVEDOR SENIOR") {
		t.Errorf("cargo %q", d.Cargo)
	}
	// "- (recontratado…)" não é data. Gravar qualquer coisa aqui classificaria
	// a pessoa como elegível ou inelegível à AVD por um palpite.
	if d.Admissao != "" {
		t.Errorf("admissão %q, esperado vazio quando o arquivo não traz data", d.Admissao)
	}
	if d.Contexto == "" {
		t.Error("contexto vazio, esperado o bloco de citação do cabeçalho")
	}
}

func TestParseDossieAdmissaoQuandoExiste(t *testing.T) {
	d, err := ParseDossie(strings.NewReader(
		strings.Replace(dossieExemplo,
			"- **Admissão:** - (recontratado, com experiência anterior)",
			"- **Admissão:** 2025-09-15", 1)))
	if err != nil {
		t.Fatal(err)
	}
	if d.Admissao != "2025-09-15" {
		t.Errorf("admissão %q, esperado 2025-09-15", d.Admissao)
	}
}

func TestParseDossieReunioes(t *testing.T) {
	d, err := ParseDossie(strings.NewReader(dossieExemplo))
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Reunioes) != 3 {
		t.Fatalf("%d reuniões, esperadas 3 (a data repetida conta duas vezes)", len(d.Reunioes))
	}
	if d.Reunioes[0].Performance != "satisfatoria" {
		t.Errorf("performance %q, esperada satisfatoria", d.Reunioes[0].Performance)
	}
	if d.Reunioes[2].Performance != "excepcional" {
		t.Errorf("performance %q, esperada excepcional", d.Reunioes[2].Performance)
	}
	if d.Reunioes[0].Avaliacao != "Primeira avaliação do período." {
		t.Errorf("avaliação %q", d.Reunioes[0].Avaliacao)
	}
	// O rótulo abre o bloco e o texto continua na linha seguinte — o mesmo
	// caso que fez o parser das defesas precisar de máquina de estados.
	if !strings.Contains(d.Reunioes[2].Notas, "refatoração") {
		t.Errorf("notas %q, esperada a continuação da linha seguinte", d.Reunioes[2].Notas)
	}
}

func TestParseDossieFeedbacks(t *testing.T) {
	d, err := ParseDossie(strings.NewReader(dossieExemplo))
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Feedbacks) != 2 {
		t.Fatalf("%d feedbacks, esperados 2", len(d.Feedbacks))
	}
	if d.Feedbacks[0].Tipo != "positivo" || d.Feedbacks[0].Autor != "OUTRA PESSOA" {
		t.Errorf("feedback 1: tipo %q autor %q", d.Feedbacks[0].Tipo, d.Feedbacks[0].Autor)
	}
	if d.Feedbacks[1].Tipo != "construtivo" {
		t.Errorf("feedback 2: tipo %q, esperado construtivo", d.Feedbacks[1].Tipo)
	}
	// A ressalva colada ao nome tem que sair: com ela, o autor não casa com o
	// cadastro e um feedback de par entra marcado como de fora do time.
	if d.Feedbacks[1].Autor != "TERCEIRA PESSOA" {
		t.Errorf("autor %q, esperado sem a ressalva entre parênteses", d.Feedbacks[1].Autor)
	}
	if !strings.Contains(d.Feedbacks[0].Texto, "força-tarefa") {
		t.Errorf("texto do feedback 1: %q", d.Feedbacks[0].Texto)
	}
}

func TestParseDossieRecusaSemNome(t *testing.T) {
	// Sem nome não há a quem pendurar as avaliações, e gravá-las na pessoa
	// errada é pior que não gravar.
	_, err := ParseDossie(strings.NewReader("## Reuniões 1:1 (2026)\n\n### 2026-01-12 — Performance: Satisfatória\n"))
	if err == nil {
		t.Fatal("esperado erro para dossiê sem título")
	}
}

/* ---------- feedback avulso ---------- */

const feedbackAvulsoExemplo = `# Elogio — Participante (registro TeamGuide)

**Data:** 16/09/2026
**Tipo:** Elogio / Reconhecimento
**Título:** Entrega da esteira — protagonismo no trabalho com IA

---

Obrigado pelo trabalho que você vem fazendo. A entrega foi conduzida de ponta
a ponta.

- **Fez a esteira ser do time.** Style guide oficial e referência no rodapé.
`

func TestParseFeedbackAvulso(t *testing.T) {
	f, err := ParseFeedbackAvulso(strings.NewReader(feedbackAvulsoExemplo))
	if err != nil {
		t.Fatalf("parse falhou: %v", err)
	}
	if f.Pessoa != "Participante" {
		t.Errorf("pessoa %q", f.Pessoa)
	}
	if f.Data != "2026-09-16" {
		t.Errorf("data %q, esperada 2026-09-16", f.Data)
	}
	if f.Tipo != "positivo" {
		t.Errorf("tipo %q", f.Tipo)
	}
	if !strings.Contains(f.Titulo, "esteira") {
		t.Errorf("título %q", f.Titulo)
	}
	// O corpo precisa vir inteiro: é ele que vira a evidência citável.
	if !strings.Contains(f.Texto, "Style guide oficial") {
		t.Errorf("texto perdeu o corpo depois da régua: %q", f.Texto)
	}
	if strings.Contains(f.Texto, "**Data:**") {
		t.Errorf("cabeçalho vazou para o corpo: %q", f.Texto)
	}
}

func TestParseFeedbackAvulsoRecusaSemData(t *testing.T) {
	semData := strings.Replace(feedbackAvulsoExemplo, "**Data:** 16/09/2026", "", 1)
	if _, err := ParseFeedbackAvulso(strings.NewReader(semData)); err == nil {
		t.Fatal("esperado erro: feedback sem data não entra na linha do tempo")
	}
}
