package ingest

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Relatorio consolida o que a varredura encontrou.
type Relatorio struct {
	Vistos      int
	JaConhecido int
	PorTipo     map[string]int
	PorStatus   map[string]int
	Revisao     []string
}

func (r Relatorio) Resumo() string {
	var b strings.Builder
	fmt.Fprintf(&b, "seed: %d arquivos vistos, %d já conhecidos\n", r.Vistos, r.JaConhecido)
	for t, n := range r.PorTipo {
		fmt.Fprintf(&b, "  %-24s %d\n", t, n)
	}
	for s, n := range r.PorStatus {
		fmt.Fprintf(&b, "  [%s] %d\n", s, n)
	}
	for _, m := range r.Revisao {
		fmt.Fprintf(&b, "  revisão manual: %s\n", m)
	}
	return b.String()
}

var (
	// 2026_09_22 11_15 GMT-03_00 — gerado pela ferramenta, confiável.
	reDataGemini = regexp.MustCompile(`(\d{4})_(\d{2})_(\d{2})`)
	// 22-09-26 no começo do nome — digitado, às vezes errado.
	reDataNome = regexp.MustCompile(`^(\d{2})-(\d{2})-(\d{2})\b`)
	// 2026-09-22_diego-nunes.md
	reDataRegistro = regexp.MustCompile(`^(\d{4})-(\d{2})-(\d{2})_`)
)

// DetectarTipo classifica o arquivo pelo caminho e pelas primeiras linhas.
func DetectarTipo(caminho string, cabecalho string) string {
	nome := filepath.Base(caminho)
	ext := strings.ToLower(filepath.Ext(nome))
	pasta := filepath.ToSlash(filepath.Dir(caminho))

	switch {
	case ext == ".txt" && strings.Contains(cabecalho, "Meeting started"):
		return "tactiq_txt"
	case ext == ".pdf" && strings.Contains(nome, "Anotações do Gemini"):
		return "gemini_notes_pdf"
	case ext == ".pdf" && strings.Contains(nome, "Transcript"):
		return "gemini_transcript_pdf"
	case ext == ".pdf" && strings.Contains(pasta, "AVD-"):
		return "material_avd_pdf"
	case ext == ".md" && strings.Contains(pasta, "registros-1-1"):
		return "registro_md"
	case ext == ".md" && strings.Contains(pasta, "Dossies"):
		return "dossie_md"
	case ext == ".md" && strings.Contains(pasta, "Rascunhos"):
		return "rascunho_avd_md"
	case ext == ".md" && strings.Contains(pasta, "Feedback"):
		return "feedback_md"
	}
	return "desconhecido"
}

// DataDoNome extrai a data do nome do arquivo, em ISO.
//
// Vale como AUDITORIA, não como verdade: o nome é digitado e erra. Há pelo
// menos dois casos reais na pasta — um arquivo do Felipe com ano 2025 e um do
// Eduardo com 29/09 para uma reunião de 25/09. A data que vale é a do
// cabeçalho; a divergência fica registrada e vira revisão manual.
func DataDoNome(nome string) string {
	if m := reDataRegistro.FindStringSubmatch(nome); m != nil {
		return m[1] + "-" + m[2] + "-" + m[3]
	}
	if m := reDataGemini.FindStringSubmatch(nome); m != nil {
		return m[1] + "-" + m[2] + "-" + m[3]
	}
	if m := reDataNome.FindStringSubmatch(nome); m != nil {
		ano := "20" + m[3]
		return ano + "-" + m[2] + "-" + m[1]
	}
	return ""
}

// reDataDigitada casa SÓ o prefixo que alguém escreveu à mão: "29-09-26" ou
// "07-07-2026" no começo do nome.
var reDataDigitada = regexp.MustCompile(`^(\d{2})-(\d{2})-(\d{2}(?:\d{2})?)\b`)

// DataDigitadaNoNome extrai apenas a data TECLADA no começo do arquivo.
//
// Diferente de `DataDoNome`, que devolve a melhor data disponível: aqui quero
// a pior de propósito. O nome dos PDFs do Gemini traz duas datas — a digitada
// no começo e o carimbo da ferramenta no fim ("2026_09_25 11_00 GMT-03_00").
// `DataDoNome` prefere o carimbo, que é confiável, e com isso a divergência
// some: comparar carimbo com conteúdo dá sempre igual.
//
// É exatamente o caso real que ficou pendente: um arquivo nomeado 29/09 para
// uma conversa de 25/09. Quem procura a 1:1 pela data do arquivo não acha, e a
// contagem de 1:1s do ciclo sai errada. Para flagrar isso é a data digitada
// que precisa ser confrontada com a do conteúdo.
func DataDigitadaNoNome(nome string) string {
	m := reDataDigitada.FindStringSubmatch(nome)
	if m == nil {
		return ""
	}
	ano := m[3]
	if len(ano) == 2 {
		ano = "20" + ano
	}
	return ano + "-" + m[2] + "-" + m[1]
}

var ignorar = []string{".claude", "node_modules", ".git", "~$"}

// Seed varre a pasta e registra cada arquivo em source_files.
//
// Idempotente por sha256: rodar duas vezes não duplica nada. É o que permite
// repetir a carga sem medo enquanto os parsers evoluem.
func Seed(db *sql.DB, tenantID int64, raiz string, dryRun bool) (Relatorio, error) {
	rel := Relatorio{PorTipo: map[string]int{}, PorStatus: map[string]int{}}

	err := filepath.WalkDir(raiz, func(caminho string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // pasta ilegível não derruba a varredura inteira
		}
		if d.IsDir() {
			for _, ig := range ignorar {
				if strings.Contains(filepath.Base(caminho), ig) {
					return filepath.SkipDir
				}
			}
			return nil
		}

		ext := strings.ToLower(filepath.Ext(caminho))
		if ext != ".txt" && ext != ".pdf" && ext != ".md" {
			return nil
		}

		conteudo, err := os.ReadFile(caminho)
		if err != nil {
			return nil
		}
		soma := sha256.Sum256(conteudo)
		hash := hex.EncodeToString(soma[:])

		cabecalho := string(conteudo)
		if len(cabecalho) > 2048 {
			cabecalho = cabecalho[:2048]
		}
		tipo := DetectarTipo(caminho, cabecalho)
		nome := filepath.Base(caminho)

		rel.Vistos++
		rel.PorTipo[tipo]++

		// Material de processo não é dado de pessoa.
		status := "pendente"
		if tipo == "material_avd_pdf" || tipo == "desconhecido" {
			status = "ignorado"
		}

		dataArquivo := DataDoNome(nome)
		var dataReuniao string
		if tipo == "tactiq_txt" {
			if t, errP := ParseTactiq(strings.NewReader(string(conteudo)), "Coordenação"); errP == nil {
				dataReuniao = t.Data
				if dataReuniao != "" && dataArquivo != "" && dataReuniao != dataArquivo {
					status = "revisao_manual"
					rel.Revisao = append(rel.Revisao,
						fmt.Sprintf("%s — conteúdo %s ≠ nome %s", nome, dataReuniao, dataArquivo))
				}
			}
		}
		rel.PorStatus[status]++

		if dryRun {
			return nil
		}

		// xmax = 0 no RETURNING significa INSERT; diferente de zero, foi UPDATE —
		// é como o Postgres deixa distinguir arquivo novo de já conhecido.
		var id int64
		var jaExistia bool
		errIns := db.QueryRow(`
			INSERT INTO source_files
			  (tenant_id, caminho, nome_arquivo, sha256, bytes, tipo_detectado,
			   status, data_reuniao, data_arquivo)
			VALUES ($1,$2,$3,$4,$5,$6,$7,NULLIF($8,'')::date,NULLIF($9,'')::date)
			ON CONFLICT (tenant_id, sha256) DO UPDATE SET visto_em = NOW()
			RETURNING id, (xmax <> 0)`,
			tenantID, caminho, nome, hash, int64(len(conteudo)), tipo,
			status, dataReuniao, dataArquivo).Scan(&id, &jaExistia)
		if errIns != nil {
			return fmt.Errorf("registrar %s: %w", nome, errIns)
		}
		if jaExistia {
			rel.JaConhecido++
		}
		return nil
	})

	return rel, err
}
