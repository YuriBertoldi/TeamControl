package ingest

// Dossiês de AVD e feedbacks avulsos.
//
// Estes arquivos ficavam catalogados e nunca lidos: o catálogo dizia
// "pendente", nenhum processador os reivindicava, e eles seguiam pendentes
// para sempre sem erro, sem aviso e sem conteúdo no banco. Silêncio é a pior
// resposta possível aqui — quem olha a tela conclui que o sistema vai
// processar depois, e nunca vai.
//
// O dossiê é o retrato da TeamGuide: as avaliações mensais com a performance
// que foi lançada lá e os feedbacks que a pessoa recebeu, inclusive de quem
// não é o coordenador. É a única fonte das 1:1s anteriores ao início dos
// registros locais, e a única dos feedbacks de terceiros.

import (
	"bufio"
	"fmt"
	"io"
	"regexp"
	"strings"
)

var (
	// # NOME DA PESSOA
	reDosTitulo = regexp.MustCompile(`^#\s+(.+?)\s*$`)
	// - **Cargo:** ... / - **Admissão:** ...
	reDosCampo = regexp.MustCompile(`^-\s+\*\*([^:*]+):\*\*\s*(.*)$`)
	// ### 2026-01-12 — Performance: Satisfatória
	reDosReuniao = regexp.MustCompile(`^###\s+(\d{4}-\d{2}-\d{2})\s*[—-]\s*Performance:\s*(.+?)\s*$`)
	// **Avaliação do líder:** ... / **Notas compartilhadas:** ...
	reDosRotulo = regexp.MustCompile(`^\*\*([^:*]+):\*\*\s*(.*)$`)
	// - **[Positivo]** 2026-02-12 — de FULANO:
	reDosFeedback = regexp.MustCompile(`^-\s+\*\*\[(\p{L}+)\]\*\*\s+(\d{4}-\d{2}-\d{2})\s*[—-]\s*de\s+(.+?):\s*$`)
	// O nome do autor às vezes vem com uma ressalva colada: "FULANO *(autoria
	// registrada assim no sistema — conferir)*". Sem tirá-la, o nome não casa
	// com o cadastro e um feedback de par entra como se fosse de fora do time.
	reDosNota = regexp.MustCompile(`\s*\*?\([^)]*\)\*?\s*$`)
	// A admissão vem "2025-09-15", "-" ou "- (recontratado, ...)". Só a data serve.
	reDosData = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2})`)
)

// ReuniaoDossie é uma avaliação mensal lançada na TeamGuide.
type ReuniaoDossie struct {
	Data        string // ISO
	Performance string // precisa_melhorar · satisfatoria · excepcional
	Avaliacao   string // justificativa escrita pelo líder
	Notas       string // o que foi compartilhado com a pessoa
}

// FeedbackDossie é um feedback recebido, frequentemente de terceiros.
type FeedbackDossie struct {
	Tipo  string // positivo · construtivo
	Data  string // ISO
	Autor string
	Texto string
}

type Dossie struct {
	Nome      string
	Cargo     string
	Admissao  string // ISO, vazio quando o arquivo traz "-"
	Contexto  string
	Reunioes  []ReuniaoDossie
	Feedbacks []FeedbackDossie
}

// ParseDossie lê um dossiê de AVD.
//
// Recusa arquivo sem nome no título: sem ele não há a quem pendurar nada, e
// gravar as avaliações na pessoa errada é pior que não gravar.
func ParseDossie(r io.Reader) (*Dossie, error) {
	d := &Dossie{}

	// Rótulo em curso. O texto de "Avaliação do líder" começa na mesma linha do
	// rótulo mas pode continuar nas seguintes — a mesma máquina de estados que
	// o parser das defesas precisou, pela mesma razão.
	var rotulo string
	var buf []string

	fechar := func() {
		if rotulo == "" || len(d.Reunioes) == 0 {
			rotulo, buf = "", nil
			return
		}
		texto := strings.TrimSpace(strings.Join(buf, "\n"))
		u := &d.Reunioes[len(d.Reunioes)-1]
		switch {
		case strings.HasPrefix(strings.ToLower(rotulo), "avaliação do líder"):
			u.Avaliacao = texto
		case strings.HasPrefix(strings.ToLower(rotulo), "notas compartilhadas"):
			u.Notas = texto
		}
		rotulo, buf = "", nil
	}

	// Feedback em curso: o texto vem nas linhas de citação seguintes.
	var fb *FeedbackDossie
	var fbBuf []string
	fecharFB := func() {
		if fb == nil {
			return
		}
		fb.Texto = strings.TrimSpace(strings.Join(fbBuf, "\n"))
		if fb.Texto != "" {
			d.Feedbacks = append(d.Feedbacks, *fb)
		}
		fb, fbBuf = nil, nil
	}

	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024) // feedbacks longos estouram o default

	for sc.Scan() {
		linha := strings.TrimRight(sc.Text(), "\r")
		corte := strings.TrimSpace(linha)

		if m := reDosFeedback.FindStringSubmatch(corte); m != nil {
			fechar()
			fecharFB()
			fb = &FeedbackDossie{
				Tipo:  tipoFeedback(m[1]),
				Data:  m[2],
				Autor: strings.TrimSpace(reDosNota.ReplaceAllString(m[3], "")),
			}
			continue
		}
		if fb != nil {
			if cit := strings.TrimPrefix(corte, ">"); cit != corte {
				fbBuf = append(fbBuf, strings.TrimSpace(cit))
				continue
			}
			if corte == "" {
				continue // linha em branco entre citações do mesmo feedback
			}
			fecharFB()
		}

		if m := reDosReuniao.FindStringSubmatch(corte); m != nil {
			fechar()
			d.Reunioes = append(d.Reunioes, ReuniaoDossie{
				Data:        m[1],
				Performance: performanceCanonica[strings.ToLower(strings.TrimSpace(m[2]))],
			})
			continue
		}
		if strings.HasPrefix(corte, "## ") {
			fechar()
			continue
		}
		if m := reDosTitulo.FindStringSubmatch(corte); m != nil && d.Nome == "" &&
			!strings.HasPrefix(corte, "##") {
			d.Nome = strings.TrimSpace(m[1])
			continue
		}
		if m := reDosCampo.FindStringSubmatch(corte); m != nil && len(d.Reunioes) == 0 {
			switch strings.ToLower(strings.TrimSpace(m[1])) {
			case "cargo":
				d.Cargo = strings.TrimSpace(m[2])
			case "admissão", "admissao":
				// "-" e "- (recontratado…)" significam "não sei", não uma data.
				if dm := reDosData.FindStringSubmatch(strings.TrimSpace(m[2])); dm != nil {
					d.Admissao = dm[1]
				}
			}
			continue
		}
		if strings.HasPrefix(corte, "> ") && len(d.Reunioes) == 0 {
			d.Contexto = strings.TrimSpace(strings.TrimPrefix(corte, ">"))
			continue
		}
		if m := reDosRotulo.FindStringSubmatch(corte); m != nil {
			fechar()
			rotulo = strings.TrimSpace(m[1])
			if v := strings.TrimSpace(m[2]); v != "" {
				buf = append(buf, v)
			}
			continue
		}
		if rotulo != "" {
			buf = append(buf, linha)
		}
	}
	fechar()
	fecharFB()

	if err := sc.Err(); err != nil {
		return nil, err
	}
	if d.Nome == "" {
		return nil, fmt.Errorf("sem nome no título — não dá para saber de quem é o dossiê")
	}
	return d, nil
}

// tipoFeedback traduz a valência do dossiê para o domínio do banco.
//
// O CHECK aceita positivo, construtivo, elogio e reconhecimento; o dossiê só
// escreve as duas primeiras. Qualquer coisa fora disso vira "positivo" — e
// não é descuido: um valor desconhecido quebraria a carga inteira por causa
// de uma palavra, e a valência não muda o que a pessoa recebeu.
func tipoFeedback(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "construtivo":
		return "construtivo"
	default:
		return "positivo"
	}
}

/* ---------- feedback avulso ---------- */

var (
	// # Elogio — Michell (registro TeamGuide)
	reAvTitulo = regexp.MustCompile(`^#\s+(.+?)\s*[—-]\s*(.+?)\s*(?:\(.*\))?\s*$`)
	reAvCampo  = regexp.MustCompile(`^\*\*([^:*]+):\*\*\s*(.*)$`)
	reAvData   = regexp.MustCompile(`^(\d{2})/(\d{2})/(\d{4})`)
)

// FeedbackAvulso é um feedback registrado fora do ciclo, num arquivo próprio.
type FeedbackAvulso struct {
	Pessoa string
	Data   string // ISO
	Tipo   string
	Titulo string
	Texto  string
}

// ParseFeedbackAvulso lê um feedback registrado em arquivo próprio.
//
// O corpo começa depois da régua `---` que separa o cabeçalho: antes dela são
// os campos, depois é o texto que a pessoa recebeu.
func ParseFeedbackAvulso(r io.Reader) (*FeedbackAvulso, error) {
	f := &FeedbackAvulso{Tipo: "positivo"}
	var corpo []string
	noCorpo := false

	sc := bufio.NewScanner(r)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)

	for sc.Scan() {
		linha := strings.TrimRight(sc.Text(), "\r")
		corte := strings.TrimSpace(linha)

		if !noCorpo && corte == "---" {
			noCorpo = true
			continue
		}
		if noCorpo {
			corpo = append(corpo, linha)
			continue
		}
		if m := reAvTitulo.FindStringSubmatch(corte); m != nil && f.Pessoa == "" &&
			strings.HasPrefix(corte, "# ") {
			f.Pessoa = strings.TrimSpace(m[2])
			continue
		}
		if m := reAvCampo.FindStringSubmatch(corte); m != nil {
			v := strings.TrimSpace(m[2])
			switch strings.ToLower(strings.TrimSpace(m[1])) {
			case "data":
				if dm := reAvData.FindStringSubmatch(v); dm != nil {
					f.Data = dm[3] + "-" + dm[2] + "-" + dm[1]
				}
			case "tipo":
				f.Tipo = tipoFeedback(strings.SplitN(v, "/", 2)[0])
			case "título", "titulo":
				f.Titulo = v
			}
			continue
		}
	}
	if err := sc.Err(); err != nil {
		return nil, err
	}

	f.Texto = strings.TrimSpace(strings.Join(corpo, "\n"))
	if f.Pessoa == "" {
		return nil, fmt.Errorf("sem nome no título — não dá para saber de quem é o feedback")
	}
	if f.Data == "" {
		return nil, fmt.Errorf("sem data — feedback sem data não entra na linha do tempo")
	}
	if f.Texto == "" {
		return nil, fmt.Errorf("sem corpo depois da régua ---")
	}
	return f, nil
}
