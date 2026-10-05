package ingest

// Processar: transforma o que foi catalogado em dado consultável.
//
// O `Seed` registra QUE o arquivo existe. Isto lê o conteúdo e cria reunião,
// registro, encaminhamento, omissão, avaliação e defesa. É a fronteira entre
// "pasta organizada" e "sistema".
//
// Três garantias que valem mais que a velocidade:
//
//  1. **Idempotente.** Rodar duas vezes não duplica: reunião tem chave natural
//     (pessoa + data + tipo) e os filhos são regravados a partir dela. Isso é
//     o que permite repetir a carga enquanto os parsers ainda estão mudando.
//  2. **Falha de um arquivo não derruba a carga.** Cada arquivo é uma
//     transação própria e o erro fica registrado em `source_files.erro`. Uma
//     carga que para no arquivo 7 de 121 não serve para nada.
//  3. **Nada é inventado.** Arquivo sem data, ou de pessoa que não resolve,
//     vira `revisao_manual` com o motivo — não entra com valor-padrão.

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// RelProcessamento é o resumo do que a passada fez.
type RelProcessamento struct {
	Reunioes        int
	Registros       int
	Encaminhamentos int
	Omissoes        int
	Avaliacoes      int
	Drivers         int
	Abertas         int
	Defesas         int
	Transcricoes    int
	Notas           int
	Etapas          int
	Linhas          int
	Aliases         int
	Feedbacks       int
	Admissoes       int
	Revisao         []string
	Erros           []string
}

func (r RelProcessamento) Resumo() string {
	var b strings.Builder
	fmt.Fprintf(&b, "processamento:\n")
	fmt.Fprintf(&b, "  reuniões          %d\n", r.Reunioes)
	fmt.Fprintf(&b, "  registros         %d\n", r.Registros)
	fmt.Fprintf(&b, "  encaminhamentos   %d\n", r.Encaminhamentos)
	fmt.Fprintf(&b, "  omissões          %d\n", r.Omissoes)
	fmt.Fprintf(&b, "  avaliações 1:1    %d\n", r.Avaliacoes)
	fmt.Fprintf(&b, "  avaliações AVD    %d (%d notas, %d abertas)\n", r.Abertas/2, r.Drivers, r.Abertas)
	fmt.Fprintf(&b, "  defesas           %d\n", r.Defesas)
	fmt.Fprintf(&b, "  transcrições      %d (%d falas)\n", r.Transcricoes, r.Linhas)
	fmt.Fprintf(&b, "  notas do Gemini   %d (%d próximas etapas no texto)\n", r.Notas, r.Etapas)
	fmt.Fprintf(&b, "  aliases criados   %d\n", r.Aliases)
	for _, m := range r.Revisao {
		fmt.Fprintf(&b, "  revisão manual: %s\n", m)
	}
	for _, e := range r.Erros {
		fmt.Fprintf(&b, "  ERRO: %s\n", e)
	}
	return b.String()
}

// Processar lê os arquivos pendentes e grava o conteúdo.
func Processar(db *sql.DB, tenantID int64, raiz, coordenador string) (RelProcessamento, error) {
	var rel RelProcessamento

	// O que o coordenador já decidiu sobre cada arquivo. Carregado uma vez por
	// passada: a resposta é a mesma para os 121 arquivos, e uma consulta por
	// arquivo seriam 121 idas ao banco para a mesma pergunta.
	dec := carregarDecisoes(db, tenantID)

	if err := processarRegistros(db, tenantID, raiz, dec, &rel); err != nil {
		return rel, err
	}
	if err := processarTranscricoes(db, tenantID, raiz, coordenador, dec, &rel); err != nil {
		return rel, err
	}
	if err := processarPDFs(db, tenantID, raiz, coordenador, dec, &rel); err != nil {
		return rel, err
	}
	// Depois dos registros, de propósito: o registro local é quem escreve a
	// avaliação da 1:1, e o dossiê só preenche o que ficou vazio.
	if err := processarDossies(db, tenantID, raiz, dec, &rel); err != nil {
		return rel, fmt.Errorf("dossiês: %w", err)
	}
	if err := processarFeedbacksAvulsos(db, tenantID, raiz, dec, &rel); err != nil {
		return rel, fmt.Errorf("feedbacks avulsos: %w", err)
	}
	if err := processarAVD(db, tenantID, raiz, dec, &rel); err != nil {
		return rel, err
	}

	// Por último: quem sobrou na fila sem nenhum processador o ter tocado
	// ganha o motivo escrito, para a tela parar de dizer só "na fila".
	explicarNaoProcessados(db, tenantID)
	return rel, nil
}

/* ---------- PDFs do Gemini ---------- */

// processarPDFs lê as anotações e as transcrições em PDF.
//
// Sobre os encaminhamentos: as anotações trazem uma seção "Próximas etapas"
// pronta, e seria fácil virar action item. NÃO vira, de propósito. O registro
// `.md` é a versão CURADA da mesma conversa, e é de lá que os encaminhamentos
// saem. Gravar os dois produziria board com a tarefa duplicada — uma escrita
// por você, outra gerada pela ferramenta — e você teria de conciliar as duas
// toda semana. As etapas ficam no texto da fonte, pesquisáveis; promovê-las a
// compromisso é decisão da curadoria do pós-1:1, não da carga.
func processarPDFs(db *sql.DB, tenantID int64, raiz, coordenador string,
	dec decisoes, rel *RelProcessamento) error {

	var arquivos []string
	_ = filepath.Walk(raiz, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.EqualFold(filepath.Ext(p), ".pdf") {
			return nil
		}
		arquivos = append(arquivos, p)
		return nil
	})
	sort.Strings(arquivos)
	if len(arquivos) == 0 {
		return nil
	}

	if !PdftotextDisponivel() {
		rel.Revisao = append(rel.Revisao, fmt.Sprintf(
			"%d PDFs não processados: pdftotext ausente no PATH (pacote poppler-utils)",
			len(arquivos)))
		return nil
	}

	for _, caminho := range arquivos {
		nome := filepath.Base(caminho)

		if dec.fora[nome] { // ver carregarIgnorados: pular, não só preservar o status
			continue
		}

		notas := strings.Contains(nome, "Anotações do Gemini")
		transcricao := strings.Contains(nome, "Transcript")
		if !notas && !transcricao {
			continue // material de apoio da AVD e afins — já ignorados no catálogo
		}

		texto, extrator, err := ExtrairTextoPDF(caminho)
		if err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			marcarArquivo(db, tenantID, nome, "erro", err.Error())
			continue
		}
		qualidade, motivo := QualidadeExtracao(texto)
		if qualidade == "falhou" {
			rel.Revisao = append(rel.Revisao, fmt.Sprintf("%s: %s", nome, motivo))
			marcarArquivo(db, tenantID, nome, "revisao_manual", motivo)
			continue
		}

		var pessoaID int64
		if transcricao {
			pessoaID, err = gravarPDFTranscricao(db, tenantID, nome, texto, extrator,
				qualidade, coordenador, dec, rel)
		} else {
			pessoaID, err = gravarPDFNotas(db, tenantID, nome, texto, extrator,
				qualidade, dec, rel)
		}
		if err != nil {
			rel.Revisao = append(rel.Revisao, fmt.Sprintf("%s: %v", nome, err))
			var np naoResolvi
			if errors.As(err, &np) {
				marcarRevisaoPessoa(db, tenantID, nome, np.candidatos)
			} else {
				marcarArquivo(db, tenantID, nome, "revisao_manual", err.Error())
			}
			continue
		}
		marcarArquivo(db, tenantID, nome, "processado", "", pessoaID)
	}
	return nil
}

// naoResolvi carrega os nomes que a carga tentou, para a tela poder oferecer a
// escolha da pessoa em vez de só relatar que não deu.
//
// É erro tipado, e não string, porque quem chama precisa distinguir "não sei
// de quem é" — que uma pessoa resolve num clique — de "o arquivo está
// quebrado", que ninguém resolve escolhendo nome.
type naoResolvi struct{ candidatos []string }

func (e naoResolvi) Error() string {
	return "não identifiquei de quem é: " + strings.Join(e.candidatos, " · ")
}

func gravarPDFNotas(db *sql.DB, tenantID int64, arquivo, texto, extrator,
	qualidade string, dec decisoes, rel *RelProcessamento) (int64, error) {

	n, err := ParseGeminiNotas(texto)
	if err != nil {
		return 0, err
	}
	m := dec.pessoaDe(arquivo)
	if m == nil {
		if m, err = ResolverPessoa(db, tenantID, n.Participante); err != nil {
			return 0, err
		}
	}
	if m == nil {
		return 0, naoResolvi{candidatos: []string{n.Participante}}
	}
	if m.Como != "exata" && m.Como != "manual" {
		if err := GravarAlias(db, tenantID, m.PersonID, n.Participante, "arquivo"); err == nil {
			rel.Aliases++
		}
	}

	// A data do CONTEÚDO, impressa pelo Gemini no corpo, é a que vale. A do
	// nome é digitada e erra — este é exatamente o caso que estava pendente:
	// até agora a divergência só era checada nos .txt do Tactiq, então um PDF
	// com nome errado entrava com a data errada e ninguém via.
	data := n.DataConteudo
	if data == "" {
		return 0, fmt.Errorf("sem data no corpo das anotações")
	}
	// A comparação é contra a data DIGITADA no começo do nome, não contra o
	// carimbo do Gemini. O carimbo é gerado pela ferramenta e bate sempre com
	// o conteúdo; confrontá-lo não acusaria nada. Quem erra é quem digita.
	dataArquivo := DataDigitadaNoNome(arquivo)
	divergente := dataArquivo != "" && dataArquivo != data

	tx, err := db.Begin()
	if err != nil {
		return 0, err
	}
	defer func() { _ = tx.Rollback() }()

	var meetingID int64
	err = tx.QueryRow(`
		INSERT INTO meetings (tenant_id, person_id, tipo, data, data_arquivo, tem_divergencia_data)
		VALUES ($1,$2,'one_on_one',$3,NULLIF($4,'')::date,$5)
		ON CONFLICT (tenant_id, person_id, data, tipo) DO UPDATE SET
		  -- Quando diverge, a data do nome que vale guardar é a ERRADA: é ela
		  -- que precisa ser corrigida no arquivo, e uma coluna de auditoria que
		  -- mostra o valor certo não serve para auditar nada.
		  data_arquivo = CASE WHEN EXCLUDED.tem_divergencia_data
		                      THEN EXCLUDED.data_arquivo
		                      ELSE COALESCE(meetings.data_arquivo, EXCLUDED.data_arquivo) END,
		  tem_divergencia_data = meetings.tem_divergencia_data OR EXCLUDED.tem_divergencia_data
		RETURNING id`,
		tenantID, m.PersonID, data, dataArquivo, divergente).Scan(&meetingID)
	if err != nil {
		return 0, fmt.Errorf("reunião: %w", err)
	}

	soma := sha256.Sum256([]byte(texto))
	// Confidencialidade 3, e não negociável: as anotações trazem o que o
	// registro compartilhável deliberadamente OMITIU — remuneração, projeção
	// de carreira não confirmada, comentário sobre terceiros. Classificar como
	// pública entregaria ao liderado justamente o que foi cortado.
	_, err = tx.Exec(`
		INSERT INTO meeting_sources
		  (tenant_id, meeting_id, fonte, kind, texto, texto_sha256, extrator,
		   qualidade_extracao, confidencialidade)
		VALUES ($1,$2,'gemini_notes','notas_sumarizadas',$3,$4,$5,$6,'privado_coordenador')
		ON CONFLICT (tenant_id, meeting_id, texto_sha256) DO UPDATE SET
		  qualidade_extracao = EXCLUDED.qualidade_extracao`,
		tenantID, meetingID, texto, hex.EncodeToString(soma[:]), extrator, qualidade)
	if err != nil {
		return 0, fmt.Errorf("fonte: %w", err)
	}

	rel.Notas++
	rel.Etapas += len(n.Etapas)
	if divergente {
		rel.Revisao = append(rel.Revisao, fmt.Sprintf(
			"%s: data do nome (%s) difere da do conteúdo (%s)", arquivo, dataArquivo, data))
	}
	return m.PersonID, tx.Commit()
}

func gravarPDFTranscricao(db *sql.DB, tenantID int64, arquivo, texto, extrator,
	qualidade, coordenador string, dec decisoes, rel *RelProcessamento) (int64, error) {

	t, err := ParseGeminiTranscricao(texto, coordenador)
	if err != nil {
		return 0, err
	}
	// O PDF de transcrição não imprime a data no corpo; o carimbo do nome é
	// gerado pela ferramenta e, nesse formato, é confiável.
	t.Data = DataDoNome(arquivo)
	if t.Data == "" {
		return 0, fmt.Errorf("sem data no nome do arquivo")
	}

	m, nome := dec.pessoaDe(arquivo), ""
	if m == nil {
		if m, nome, err = resolverEntreParticipantes(db, tenantID,
			t.Participante, t.Participantes); err != nil {
			return 0, err
		}
	}
	if m == nil {
		return 0, naoResolvi{candidatos: t.Participantes}
	}
	if m.Como != "exata" && m.Como != "manual" {
		if err := GravarAlias(db, tenantID, m.PersonID, nome, "transcricao"); err == nil {
			rel.Aliases++
		}
	}
	return m.PersonID, gravarTranscricaoFonte(db, tenantID, m.PersonID, arquivo, t,
		"gemini_transcript", extrator, qualidade, rel)
}

/* ---------- transcrições do Tactiq ---------- */

// processarTranscricoes grava as transcrições .txt como fonte das reuniões.
//
// A transcrição não substitui o registro: ela é o LASTRO dele. É contra o
// texto canônico que as citações de evidência são ancoradas, e é dele que sai
// o trecho literal com o minuto quando alguém pergunta "onde foi que ele disse
// isso". Por isso o texto é gravado normalizado e imutável, e as linhas
// guardam offset — reprocessar com outro extrator cria fonte nova em vez de
// mexer na antiga, senão toda citação antiga passa a apontar para o lugar
// errado.
func processarTranscricoes(db *sql.DB, tenantID int64, raiz, coordenador string,
	dec decisoes, rel *RelProcessamento) error {

	var arquivos []string
	_ = filepath.Walk(raiz, func(p string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.EqualFold(filepath.Ext(p), ".txt") {
			return nil
		}
		arquivos = append(arquivos, p)
		return nil
	})
	sort.Strings(arquivos)

	for _, caminho := range arquivos {
		nome := filepath.Base(caminho)

		if dec.fora[nome] { // ver carregarIgnorados: pular, não só preservar o status
			continue
		}

		f, err := os.Open(caminho)
		if err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			continue
		}
		t, err := ParseTactiq(f, coordenador)
		f.Close()
		if err != nil {
			// Não é erro de carga: há .txt na pasta que não é do Tactiq.
			// O catálogo já os classificou, e forçar parse aqui produziria
			// reunião sem data — o furo que a checagem de divergência existe
			// para pegar.
			continue
		}

		m, quem := dec.pessoaDe(nome), ""
		if m == nil {
			m, quem, err = resolverEntreParticipantes(db, tenantID, t.Participante, t.Participantes)
			if err != nil {
				return err
			}
		}
		if m == nil {
			rel.Revisao = append(rel.Revisao,
				fmt.Sprintf("%s: não resolvi %q", nome, t.Participante))
			marcarRevisaoPessoa(db, tenantID, nome, t.Participantes)
			continue
		}
		if m.Como != "exata" && m.Como != "manual" {
			if err := GravarAlias(db, tenantID, m.PersonID, quem, "transcricao"); err == nil {
				rel.Aliases++
			}
		}

		if err := gravarTranscricaoFonte(db, tenantID, m.PersonID, nome, t,
			"tactiq", "tactiq_txt", "ok", rel); err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			marcarArquivo(db, tenantID, nome, "erro", err.Error())
			continue
		}
		marcarArquivo(db, tenantID, nome, "processado", "", m.PersonID)
	}
	return nil
}

// gravarTranscricaoFonte grava a transcrição, venha ela do Tactiq ou do PDF.
//
// Uma função só para as duas fontes é o que garante que a citação de evidência
// funcione igual nas duas: mesmo texto canônico, mesmos offsets, mesma
// deduplicação por sha256.
func gravarTranscricaoFonte(db *sql.DB, tenantID, personID int64, arquivo string,
	t *Transcricao, fonte, extrator, qualidade string, rel *RelProcessamento) error {

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	// A data do CONTEÚDO manda; a do nome do arquivo fica como auditoria.
	// Há casos reais em que divergem, e a divergência é o sinal — não o erro.
	dataArquivo := DataDoNome(arquivo)
	divergente := dataArquivo != "" && dataArquivo != t.Data

	var meetingID int64
	err = tx.QueryRow(`
		INSERT INTO meetings
		  (tenant_id, person_id, tipo, data, hora_inicio, duracao_min, titulo,
		   data_arquivo, tem_divergencia_data)
		VALUES ($1,$2,'one_on_one',$3,NULLIF($4,'')::time,NULLIF($5,0),$6,
		        NULLIF($7,'')::date,$8)
		ON CONFLICT (tenant_id, person_id, data, tipo) DO UPDATE SET
		  hora_inicio = COALESCE(meetings.hora_inicio, EXCLUDED.hora_inicio),
		  duracao_min = COALESCE(meetings.duracao_min, EXCLUDED.duracao_min),
		  data_arquivo = COALESCE(meetings.data_arquivo, EXCLUDED.data_arquivo),
		  tem_divergencia_data = meetings.tem_divergencia_data OR EXCLUDED.tem_divergencia_data
		RETURNING id`,
		tenantID, personID, t.Data, t.HoraInicio, t.DuracaoMin,
		nulo(t.TituloBruto), dataArquivo, divergente).Scan(&meetingID)
	if err != nil {
		return fmt.Errorf("reunião: %w", err)
	}

	// `texto_sha256` é a chave: mesma transcrição reimportada é no-op, e
	// reextraída por outro meio vira fonte nova, preservando os offsets
	// antigos.
	soma := sha256.Sum256([]byte(t.TextoCanonico))
	hash := hex.EncodeToString(soma[:])

	var sourceID int64
	var jaExistia bool
	err = tx.QueryRow(`
		INSERT INTO meeting_sources
		  (tenant_id, meeting_id, fonte, kind, texto, texto_sha256, extrator,
		   url_original, confidencialidade)
		VALUES ($1,$2,$6,'transcricao_bruta',$3,$4,$7,$5,'privado_coordenador')
		ON CONFLICT (tenant_id, meeting_id, texto_sha256) DO UPDATE SET fonte = EXCLUDED.fonte
		RETURNING id, (xmax <> 0)`,
		tenantID, meetingID, t.TextoCanonico, hash, nulo(t.URLOriginal),
		fonte, extrator).Scan(&sourceID, &jaExistia)
	if err != nil {
		return fmt.Errorf("fonte: %w", err)
	}
	if jaExistia {
		return tx.Commit() // linhas já gravadas; nada a refazer
	}

	for _, l := range t.Linhas {
		_, err := tx.Exec(`
			INSERT INTO transcript_lines
			  (meeting_source_id, ord, ts_offset_sec, falante_raw, eh_coordenador,
			   texto, char_start, char_end, ruido)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			sourceID, l.Ord, l.TSOffsetSeg, nulo(l.FalanteRaw), l.EhCoordenador,
			l.Texto, l.CharInicio, l.CharFim, l.Ruido)
		if err != nil {
			return fmt.Errorf("linha %d: %w", l.Ord, err)
		}
		rel.Linhas++
	}
	rel.Transcricoes++
	if divergente {
		rel.Revisao = append(rel.Revisao, fmt.Sprintf(
			"%s: data do nome (%s) difere da do conteúdo (%s)", arquivo, dataArquivo, t.Data))
	}
	return tx.Commit()
}

/* ---------- registros de 1:1 ---------- */

func processarRegistros(db *sql.DB, tenantID int64, raiz string,
	dec decisoes, rel *RelProcessamento) error {
	arquivos, _ := filepath.Glob(filepath.Join(raiz, "registros-1-1", "*.md"))
	sort.Strings(arquivos)

	for _, caminho := range arquivos {
		nome := filepath.Base(caminho)

		if dec.fora[nome] { // ver carregarIgnorados: pular, não só preservar o status
			continue
		}

		f, err := os.Open(caminho)
		if err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			continue
		}
		reg, err := ParseRegistro(f)
		f.Close()
		if err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			marcarArquivo(db, tenantID, nome, "erro", err.Error())
			continue
		}

		m, err := ResolverPessoa(db, tenantID, reg.NomeBruto)
		if err != nil {
			return err
		}
		if m == nil {
			msg := fmt.Sprintf("%s: não resolvi %q", nome, reg.NomeBruto)
			rel.Revisao = append(rel.Revisao, msg)
			marcarArquivo(db, tenantID, nome, "revisao_manual", "pessoa não resolvida")
			continue
		}
		if m.Como != "exata" {
			if err := GravarAlias(db, tenantID, m.PersonID, reg.NomeBruto, "arquivo"); err == nil {
				rel.Aliases++
			}
		}

		if err := gravarRegistro(db, tenantID, m.PersonID, nome, reg, rel); err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			marcarArquivo(db, tenantID, nome, "erro", err.Error())
			continue
		}
		marcarArquivo(db, tenantID, nome, "processado", "", m.PersonID)
	}
	return nil
}

func gravarRegistro(db *sql.DB, tenantID, personID int64, arquivo string,
	reg *Registro, rel *RelProcessamento) error {

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	// A reunião é a chave natural: mesma pessoa, mesma data, mesmo tipo é a
	// mesma conversa, tenha ela chegado por .md, por Tactiq ou por PDF.
	var meetingID int64
	err = tx.QueryRow(`
		INSERT INTO meetings (tenant_id, person_id, tipo, data, duracao_min, titulo)
		VALUES ($1, $2, 'one_on_one', $3, NULLIF($4,0), $5)
		ON CONFLICT (tenant_id, person_id, data, tipo)
		DO UPDATE SET duracao_min = COALESCE(EXCLUDED.duracao_min, meetings.duracao_min),
		              titulo      = COALESCE(EXCLUDED.titulo, meetings.titulo)
		RETURNING id`,
		tenantID, personID, reg.Data, reg.DuracaoMin, nulo(reg.Tema)).Scan(&meetingID)
	if err != nil {
		return fmt.Errorf("reunião: %w", err)
	}
	rel.Reunioes++

	// Os filhos são regravados por completo: o arquivo é a fonte da verdade e
	// reprocessar precisa convergir, não acumular.
	for _, t := range []string{"meeting_records", "record_omissions"} {
		if _, err := tx.Exec(`DELETE FROM `+t+` WHERE meeting_id = $1`, meetingID); err != nil {
			return fmt.Errorf("limpar %s: %w", t, err)
		}
	}
	if _, err := tx.Exec(`DELETE FROM action_items WHERE meeting_id = $1`, meetingID); err != nil {
		return fmt.Errorf("limpar encaminhamentos: %w", err)
	}
	if _, err := tx.Exec(`DELETE FROM meeting_evals WHERE meeting_id = $1`, meetingID); err != nil {
		return fmt.Errorf("limpar avaliação: %w", err)
	}

	// As três partes, cada uma com a confidencialidade que o CHECK do banco
	// exige. A Parte 1 é a única que pode chegar ao liderado.
	partes := []struct{ formato, conf, md string }{
		{"compartilhavel", "publico_liderado", reg.Compartilhavel},
		{"privado_coordenador", "privado_coordenador", reg.Privado},
		{"avaliacao_1a1", "rh_calibragem", reg.Avaliacao},
	}
	for _, p := range partes {
		if strings.TrimSpace(p.md) == "" {
			continue
		}
		_, err := tx.Exec(`
			INSERT INTO meeting_records
			  (tenant_id, meeting_id, formato, confidencialidade, versao, markdown,
			   resumo, tema, gerado_por, revisado_humano, arquivo_origem)
			VALUES ($1,$2,$3,$4,1,$5,$6,$7,'importado',TRUE,$8)`,
			tenantID, meetingID, p.formato, p.conf, p.md,
			nulo(reg.Resumo), nulo(reg.Tema), arquivo)
		if err != nil {
			return fmt.Errorf("registro %s: %w", p.formato, err)
		}
		rel.Registros++
	}

	if reg.Performance != "" {
		_, err := tx.Exec(`
			INSERT INTO meeting_evals
			  (tenant_id, meeting_id, performance, performance_justificativa,
			   impacto, impacto_justificativa, origem, confidencialidade)
			VALUES ($1,$2,$3,$4,NULLIF($5,0),$6,'local','rh_calibragem')`,
			tenantID, meetingID, reg.Performance, nulo(reg.PerfJustificativa),
			reg.Impacto, nulo(reg.ImpactoJustificativa))
		if err != nil {
			return fmt.Errorf("avaliação: %w", err)
		}
		rel.Avaliacoes++
	}

	for _, e := range reg.Encaminhamentos {
		tipo := tipoResponsavel(e.Responsavel)
		// Prazo textual não vira data inventada. "Próximas semanas" marcado
		// como vago é o que faz o board conseguir dizer "isto nunca virou
		// data" — que é a dor real dos encaminhamentos de hoje.
		_, err := tx.Exec(`
			INSERT INTO action_items
			  (tenant_id, person_id, meeting_id, responsavel_tipo, responsavel_nome,
			   descricao, prazo_texto, prazo_vago, status, confidencialidade, hash_dedupe)
			VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,'aberto','publico_liderado',
			        md5($8 || $6))
			ON CONFLICT DO NOTHING`,
			// $3 e $8 são o mesmo id. Repetir em vez de reaproveitar porque o
			// Postgres deduz o tipo do parâmetro pelo uso, e usar o mesmo
			// $3 como bigint na coluna e como texto dentro de md5() dá
			// "inconsistent types deduced for parameter".
			tenantID, personID, meetingID, tipo, e.Responsavel, e.Descricao, e.PrazoTexto,
			fmt.Sprint(meetingID))
		if err != nil {
			return fmt.Errorf("encaminhamento: %w", err)
		}
		rel.Encaminhamentos++
	}

	for _, o := range reg.Omissoes {
		_, err := tx.Exec(`
			INSERT INTO record_omissions
			  (tenant_id, meeting_id, item, onde_omitido, motivo, confidencialidade)
			VALUES ($1,$2,$3,$4,$5,'privado_coordenador')`,
			tenantID, meetingID, o.Item, o.Onde, o.Motivo)
		if err != nil {
			return fmt.Errorf("omissão: %w", err)
		}
		rel.Omissoes++
	}

	return tx.Commit()
}

// tipoResponsavel classifica quem ficou com o encaminhamento.
//
// A distinção importa: o bloco "o que EU prometi" da preparação de 1:1 sai
// daqui, e é o item que mais corrói confiança quando morre — porque não há
// ninguém do outro lado para cobrar.
func tipoResponsavel(nome string) string {
	n := strings.ToLower(strings.TrimSpace(nome))
	switch {
	case n == "yuri" || strings.HasPrefix(n, "yuri b"):
		return "coordenador"
	case strings.Contains(n, "ambos") || strings.Contains(n, " e "):
		return "ambos"
	case n == "":
		return "terceiro"
	}
	return "liderado"
}

/* ---------- AVD ---------- */

func processarAVD(db *sql.DB, tenantID int64, raiz string,
	dec decisoes, rel *RelProcessamento) error {
	leia, _ := filepath.Glob(filepath.Join(raiz, "AVD-*", "Rascunhos", "00-LEIA-ME.md"))
	if len(leia) == 0 {
		return nil // sem ciclo descrito, não há o que montar
	}
	f, err := os.Open(leia[0])
	if err != nil {
		return err
	}
	ciclo, err := ParseLeiaMe(f)
	f.Close()
	if err != nil {
		return fmt.Errorf("LEIA-ME: %w", err)
	}

	// O período vem do cabeçalho das defesas, lido antes de gravar o ciclo:
	// é ele que define o corte de elegibilidade, e um ciclo gravado com
	// período errado classifica gente como inelegível sem motivo.
	//
	// Esta leitura não consulta `fora` de propósito, e é a única assim. O
	// arquivo de defesas já nasce `ignorado` no catálogo — ele não é uma 1:1,
	// não vira reunião nem registro. O que se tira dele aqui são duas datas de
	// cabeçalho; honrar o `ignorado` faria o ciclo inteiro falhar por falta de
	// período, que é o oposto do que "tirar da fila de importação" quer dizer.
	inicio, fim := "", ""
	if defs, _ := filepath.Glob(filepath.Join(raiz, "AVD-*", "Defesas-Calibragem.md")); len(defs) > 0 {
		if fd, err := os.Open(defs[0]); err == nil {
			_, inicio, fim, _ = ParseDefesas(fd)
			fd.Close()
		}
	}
	if inicio == "" {
		return fmt.Errorf("não encontrei o período do ciclo nas defesas — " +
			"sem ele o corte de elegibilidade seria inventado")
	}

	cycleID, err := gravarCiclo(db, tenantID, ciclo, inicio, fim)
	if err != nil {
		return err
	}

	// Os drivers do ciclo saem do primeiro rascunho: é a mesma lista de 14
	// para todo mundo, e lê-la do arquivo evita manter uma cópia em código que
	// envelhece quando a empresa muda o modelo.
	rascunhos, _ := filepath.Glob(filepath.Join(raiz, "AVD-*", "Rascunhos", "*.md"))
	sort.Strings(rascunhos)

	driverIDs := map[string]int64{}
	questionIDs := map[string]int64{}

	for _, caminho := range rascunhos {
		nome := filepath.Base(caminho)

		if dec.fora[nome] { // ver carregarIgnorados: pular, não só preservar o status
			continue
		}
		if nome == "00-LEIA-ME.md" {
			continue
		}
		f, err := os.Open(caminho)
		if err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			continue
		}
		ras, err := ParseRascunho(f)
		f.Close()
		if err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			continue
		}

		m, err := ResolverPessoa(db, tenantID, ras.NomeBruto)
		if err != nil {
			return err
		}
		if m == nil {
			rel.Revisao = append(rel.Revisao,
				fmt.Sprintf("%s: não resolvi %q", nome, ras.NomeBruto))
			continue
		}
		if m.Como != "exata" {
			if err := GravarAlias(db, tenantID, m.PersonID, ras.NomeBruto, "arquivo"); err == nil {
				rel.Aliases++
			}
		}

		if err := gravarAvaliacao(db, tenantID, cycleID, m.PersonID, ciclo, ras,
			driverIDs, questionIDs, rel); err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			continue
		}
		marcarArquivo(db, tenantID, nome, "processado", "", m.PersonID)
	}

	// Defesas por último: dependem da avaliação já existir.
	defs, _ := filepath.Glob(filepath.Join(raiz, "AVD-*", "Defesas-Calibragem.md"))
	if len(defs) > 0 {
		f, err := os.Open(defs[0])
		if err != nil {
			return err
		}
		lista, _, _, err := ParseDefesas(f)
		f.Close()
		if err != nil {
			return fmt.Errorf("defesas: %w", err)
		}
		for _, d := range lista {
			m, err := ResolverPessoa(db, tenantID, d.NomeBruto)
			if err != nil {
				return err
			}
			if m == nil {
				rel.Revisao = append(rel.Revisao,
					fmt.Sprintf("defesas: não resolvi %q", d.NomeBruto))
				continue
			}
			if err := gravarDefesa(db, cycleID, m.PersonID, d); err != nil {
				rel.Erros = append(rel.Erros, fmt.Sprintf("defesa de %s: %v", d.NomeBruto, err))
				continue
			}
			rel.Defesas++
		}
	}
	return nil
}

func gravarCiclo(db *sql.DB, tenantID int64, c *CicloAVD, inicio, fim string) (int64, error) {
	codigo := fmt.Sprintf("AVD-%d", c.Ano)
	var id int64
	err := db.QueryRow(`
		INSERT INTO avd_cycles
		  (tenant_id, codigo, nome, periodo_inicio, periodo_fim, escala_min, escala_max,
		   faixa_baixo_max, faixa_medio_max, meses_minimos, status)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,6,'calibragem')
		ON CONFLICT (tenant_id, codigo) DO UPDATE SET
		  escala_min = EXCLUDED.escala_min, escala_max = EXCLUDED.escala_max,
		  faixa_baixo_max = EXCLUDED.faixa_baixo_max,
		  faixa_medio_max = EXCLUDED.faixa_medio_max
		RETURNING id`,
		tenantID, codigo, fmt.Sprintf("Ciclo de desempenho %d", c.Ano),
		inicio, fim, c.EscalaMin, c.EscalaMax, c.FaixaBaixo, c.FaixaMedio).Scan(&id)
	if err != nil {
		return 0, fmt.Errorf("ciclo: %w", err)
	}
	for nota, rotulo := range c.Rotulos {
		_, err := db.Exec(`
			INSERT INTO avd_scale_labels (cycle_id, nota, rotulo) VALUES ($1,$2,$3)
			ON CONFLICT (cycle_id, nota) DO UPDATE SET rotulo = EXCLUDED.rotulo`,
			id, nota, rotulo)
		if err != nil {
			return 0, fmt.Errorf("rótulo da escala: %w", err)
		}
	}
	return id, nil
}

func gravarAvaliacao(db *sql.DB, tenantID, cycleID, personID int64,
	c *CicloAVD, ras *Rascunho, driverIDs, questionIDs map[string]int64,
	rel *RelProcessamento) error {

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	// O quadrante-alvo é o que foi PEDIDO; o final é o que o ciclo fechou.
	// Guardar os dois é o que deixa visível quando um alvo não se sustentou na
	// evidência — caso real deste ciclo.
	final := quadranteFinal(c, ras.NomeBruto)

	var evalID int64
	err = tx.QueryRow(`
		INSERT INTO avd_evaluations
		  (tenant_id, cycle_id, person_id, tipo, status, quadrante_alvo, quadrante_final,
		   media_comportamento, media_desempenho, elegivel, contexto, confidencialidade)
		VALUES ($1,$2,$3,'lider','rascunho',$4,$5,$6,$7,TRUE,$8,'rh_calibragem')
		ON CONFLICT (tenant_id, cycle_id, person_id, tipo) DO UPDATE SET
		  quadrante_alvo = EXCLUDED.quadrante_alvo,
		  quadrante_final = EXCLUDED.quadrante_final,
		  media_comportamento = EXCLUDED.media_comportamento,
		  media_desempenho = EXCLUDED.media_desempenho,
		  contexto = EXCLUDED.contexto
		RETURNING id`,
		tenantID, cycleID, personID,
		nulo(codigoQuadrante(ras.QuadranteAlvo)), nulo(codigoQuadrante(final)),
		ras.MediaComport, ras.MediaDesemp, nulo(ras.Cargo)).Scan(&evalID)
	if err != nil {
		return fmt.Errorf("avaliação: %w", err)
	}

	for _, d := range ras.Drivers {
		chave := d.Eixo + "|" + d.Nome
		id, ok := driverIDs[chave]
		if !ok {
			err := tx.QueryRow(`
				INSERT INTO avd_drivers (cycle_id, eixo, ordem, nome)
				VALUES ($1,$2,$3,$4)
				ON CONFLICT (cycle_id, eixo, ordem) DO UPDATE SET nome = EXCLUDED.nome
				RETURNING id`, cycleID, d.Eixo, d.Ordem, d.Nome).Scan(&id)
			if err != nil {
				return fmt.Errorf("driver %q: %w", d.Nome, err)
			}
			driverIDs[chave] = id
		}
		_, err := tx.Exec(`
			INSERT INTO avd_driver_scores (evaluation_id, driver_id, nota, comentario)
			VALUES ($1,$2,$3,$4)
			ON CONFLICT (evaluation_id, driver_id) DO UPDATE SET
			  nota = EXCLUDED.nota, comentario = EXCLUDED.comentario`,
			evalID, id, d.Nota, nulo(d.Comentario))
		if err != nil {
			return fmt.Errorf("nota do driver %q: %w", d.Nome, err)
		}
		rel.Drivers++
	}

	for i, a := range ras.Abertas {
		id, ok := questionIDs[a.Pergunta]
		if !ok {
			err := tx.QueryRow(`
				INSERT INTO avd_open_questions (cycle_id, ordem, pergunta)
				VALUES ($1,$2,$3)
				ON CONFLICT (cycle_id, ordem) DO UPDATE SET pergunta = EXCLUDED.pergunta
				RETURNING id`, cycleID, i+1, a.Pergunta).Scan(&id)
			if err != nil {
				return fmt.Errorf("pergunta aberta: %w", err)
			}
			questionIDs[a.Pergunta] = id
		}
		_, err := tx.Exec(`
			INSERT INTO avd_open_answers (evaluation_id, question_id, resposta)
			VALUES ($1,$2,$3)
			ON CONFLICT (evaluation_id, question_id) DO UPDATE SET resposta = EXCLUDED.resposta`,
			evalID, id, a.Resposta)
		if err != nil {
			return fmt.Errorf("resposta aberta: %w", err)
		}
		rel.Abertas++
	}

	return tx.Commit()
}

// quadranteFinal procura no LEIA-ME o quadrante que o ciclo fechou.
func quadranteFinal(c *CicloAVD, nomeBruto string) string {
	alvo := strings.ToUpper(strings.TrimSpace(nomeBruto))
	for _, a := range c.Alvos {
		if strings.EqualFold(strings.TrimSpace(a.NomeBruto), nomeBruto) ||
			strings.Contains(strings.ToUpper(a.NomeBruto), alvo) ||
			strings.Contains(alvo, strings.ToUpper(a.NomeBruto)) {
			return a.Quadrante
		}
	}
	return ""
}

func gravarDefesa(db *sql.DB, cycleID, personID int64, d Defesa) error {
	var evalID int64
	err := db.QueryRow(`
		SELECT id FROM avd_evaluations
		 WHERE cycle_id = $1 AND person_id = $2 AND tipo = 'lider'`,
		cycleID, personID).Scan(&evalID)
	if err == sql.ErrNoRows {
		return fmt.Errorf("sem avaliação para pendurar a defesa")
	}
	if err != nil {
		return err
	}
	_, err = db.Exec(`
		INSERT INTO avd_calibration_defenses
		  (evaluation_id, tese, por_que_nao_maior, trajetoria, markdown, confidencialidade)
		VALUES ($1,$2,$3,$4,$5,'rh_calibragem')
		ON CONFLICT (evaluation_id) DO UPDATE SET
		  tese = EXCLUDED.tese, por_que_nao_maior = EXCLUDED.por_que_nao_maior,
		  trajetoria = EXCLUDED.trajetoria, markdown = EXCLUDED.markdown`,
		evalID, nulo(d.Tese), nulo(d.PorQueNaoMaior), nulo(d.Trajetoria), d.Markdown)
	return err
}

/* ---------- utilidades ---------- */

// marcarArquivo registra o desfecho do processamento de um arquivo.
//
// NÃO toca em quem está `ignorado`. "Ignorar" é decisão humana — "isto não é
// material de 1:1" — e a varredura roda toda vez que alguém aperta o botão ou
// sobe o ambiente. Sem a trava, cada passada devolveria para a fila tudo o que
// você tirou dela, e o trabalho de triagem nunca terminaria.
//
// Para desfazer existe caminho explícito: "Voltar para a fila" na tela, que
// passa por `marcarStatusArquivo` e devolve o arquivo para `pendente`.
// O parâmetro `pessoa` é variádico porque nem todo ponto de marcação sabe de
// quem é o arquivo — quando a carga falha antes de resolver a pessoa, não há o
// que gravar, e um zero obrigatório seria uma mentira com cara de dado.
func marcarArquivo(db *sql.DB, tenantID int64, nomeArquivo, status, erro string,
	pessoa ...int64) {

	var id any
	if len(pessoa) > 0 && pessoa[0] > 0 {
		id = pessoa[0]
	}
	_, _ = db.Exec(`
		UPDATE source_files
		   SET status = $3, erro = NULLIF($4,''), processado_em = now(),
		       -- A descoberta da carga não sobrescreve a decisão humana: quem
		       -- abriu o arquivo e escolheu a pessoa tem a palavra final, e a
		       -- passada seguinte não pode desfazer isso em silêncio.
		       person_id = CASE WHEN pessoa_manual THEN person_id
		                        ELSE COALESCE($5::bigint, person_id) END
		 WHERE tenant_id = $1 AND nome_arquivo = $2 AND status <> 'ignorado'`,
		tenantID, nomeArquivo, status, erro, id)
}

// nulo troca string vazia por NULL — coluna opcional vazia é ruído, e `”`
// mente dizendo que alguém preencheu com nada.
func nulo(s string) any { //nolint:revive // ver codigoQuadrante abaixo
	return nuloImpl(s)
}

// codigoQuadrante traduz o nome de exibição para o código do cadastro.
//
// Os arquivos escrevem "Forte Desempenho"; a coluna é chave estrangeira para
// `nine_box_quadrants.codigo`, que usa `forte_desempenho`. Gravar o nome
// quebrava a FK — e é bom que quebre: o cadastro de quadrantes é fechado de
// propósito, para não nascer quadrante novo por erro de digitação.
func codigoQuadrante(nome string) string {
	n := strings.ToLower(strings.TrimSpace(nome))
	n = strings.NewReplacer(
		"á", "a", "â", "a", "ã", "a", "é", "e", "ê", "e", "í", "i",
		"ó", "o", "ô", "o", "õ", "o", "ú", "u", "ç", "c",
	).Replace(n)
	return strings.ReplaceAll(n, " ", "_")
}

func nuloImpl(s string) any {
	if strings.TrimSpace(s) == "" {
		return nil
	}
	return s
}

// marcarRevisaoPessoa manda o arquivo para revisão dizendo o que fazer.
//
// Não basta dizer "pessoa não resolvida": quem lê a tela fica sabendo que algo
// falhou e não o que fazer a respeito. Os nomes que a carga tentou vão junto,
// porque é olhando para eles que dá para reconhecer o apelido, o nome
// abreviado ou a grafia errada — e `motivo_revisao` guarda a lista para a tela
// poder oferecer a escolha da pessoa em vez de só relatar o problema.
func marcarRevisaoPessoa(db *sql.DB, tenantID int64, arquivo string, candidatos []string) {
	var limpos []string
	for _, c := range candidatos {
		if c = strings.TrimSpace(c); c != "" {
			limpos = append(limpos, c)
		}
	}
	marcarArquivo(db, tenantID, arquivo, "revisao_manual",
		"não identifiquei de quem é: "+strings.Join(limpos, " · ")+
			" — escolha a pessoa ao lado")
	_, _ = db.Exec(`
		UPDATE source_files SET motivo_revisao = $3
		 WHERE tenant_id = $1 AND nome_arquivo = $2 AND status <> 'ignorado'`,
		tenantID, arquivo, strings.Join(limpos, "\n"))
}

// explicarNaoProcessados dá motivo a quem sobrou na fila.
//
// Um arquivo que nenhum processador reivindica fica `pendente` para sempre,
// sem erro e sem conteúdo no banco. Quem olha a tela vê "na fila" e conclui
// que o sistema processa depois — e nunca processa. Silêncio aqui é pior que
// falha: falha a pessoa vê.
//
// O status continua `pendente` de propósito. O arquivo está mesmo na fila; o
// que faltava era a tela conseguir dizer POR QUE ele não andou, e é isso que
// a coluna `erro` passa a responder.
func explicarNaoProcessados(db *sql.DB, tenantID int64) {
	_, _ = db.Exec(`
		UPDATE source_files SET erro = CASE tipo_detectado
		    WHEN 'desconhecido' THEN
		      'formato não reconhecido — nenhum parser sabe ler este arquivo'
		    WHEN 'material_avd_pdf' THEN
		      'material de apoio da AVD: não é 1:1 de ninguém, não vira registro'
		    ELSE
		      'nenhum processador lê ' || tipo_detectado || ' ainda'
		  END
		 WHERE tenant_id = $1 AND status = 'pendente' AND erro IS NULL`, tenantID)
}

/* ---------- dossiês e feedbacks avulsos ---------- */

// processarDossies lê os dossiês de AVD.
//
// Eles são o retrato da TeamGuide: as avaliações mensais com a performance que
// foi lançada lá, os feedbacks que a pessoa recebeu — inclusive de quem não é
// o coordenador — e, em alguns casos, a data de admissão. São a única fonte
// das 1:1s anteriores aos registros locais e dos feedbacks de terceiros.
//
// Ficavam catalogados e nunca lidos. A tela dizia "na fila" e ali seguiam,
// sem erro e sem conteúdo no banco.
func processarDossies(db *sql.DB, tenantID int64, raiz string,
	dec decisoes, rel *RelProcessamento) error {

	arquivos, _ := filepath.Glob(filepath.Join(raiz, "AVD-*", "Dossies*", "*.md"))
	sort.Strings(arquivos)

	for _, caminho := range arquivos {
		nome := filepath.Base(caminho)

		if dec.fora[nome] { // ver carregarIgnorados: pular, não só preservar o status
			continue
		}
		if nome == "00-INDICE.md" {
			// Índice da pasta, não dossiê de ninguém. Marcado explicitamente
			// para não ficar "na fila" para sempre dizendo nada.
			marcarArquivo(db, tenantID, nome, "ignorado", "índice da pasta, não é dossiê")
			continue
		}

		f, err := os.Open(caminho)
		if err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			continue
		}
		d, err := ParseDossie(f)
		f.Close()
		if err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			marcarArquivo(db, tenantID, nome, "erro", err.Error())
			continue
		}

		m := dec.pessoaDe(nome)
		if m == nil {
			if m, err = ResolverPessoa(db, tenantID, d.Nome); err != nil {
				return err
			}
		}
		if m == nil {
			rel.Revisao = append(rel.Revisao, fmt.Sprintf("%s: não resolvi %q", nome, d.Nome))
			marcarRevisaoPessoa(db, tenantID, nome, []string{d.Nome})
			continue
		}
		if m.Como != "exata" && m.Como != "manual" {
			if err := GravarAlias(db, tenantID, m.PersonID, d.Nome, "dossie"); err == nil {
				rel.Aliases++
			}
		}

		if err := gravarDossie(db, tenantID, m.PersonID, nome, d, rel); err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			marcarArquivo(db, tenantID, nome, "erro", err.Error())
			continue
		}
		marcarArquivo(db, tenantID, nome, "processado", "", m.PersonID)
	}
	return nil
}

func gravarDossie(db *sql.DB, tenantID, personID int64, arquivo string,
	d *Dossie, rel *RelProcessamento) error {

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // commit explícito no fim

	// A admissão só preenche buraco, nunca sobrescreve: é ela que decide
	// elegibilidade ao ciclo, e um dossiê do ano passado não pode rebaixar o
	// que alguém corrigiu no cadastro depois.
	if d.Admissao != "" {
		r, err := tx.Exec(`
			UPDATE people SET data_admissao = $3::date
			 WHERE tenant_id = $1 AND id = $2 AND data_admissao IS NULL`,
			tenantID, personID, d.Admissao)
		if err != nil {
			return fmt.Errorf("admissão: %w", err)
		}
		if n, _ := r.RowsAffected(); n > 0 {
			rel.Admissoes++
		}
	}

	// A TeamGuide tem lançamento duplicado no mesmo dia. As duas linhas caem na
	// mesma reunião, e só a primeira vira avaliação — o que é o certo, mas
	// precisa ser dito: uma avaliação descartada em silêncio é uma linha a
	// menos na calibragem que ninguém procura porque ninguém sabe que sumiu.
	vistas := map[string]bool{}

	for _, r := range d.Reunioes {
		if vistas[r.Data] {
			rel.Revisao = append(rel.Revisao, fmt.Sprintf(
				"%s: duas avaliações em %s — mantida a primeira", arquivo, r.Data))
		}
		vistas[r.Data] = true

		var meetingID int64
		err := tx.QueryRow(`
			INSERT INTO meetings (tenant_id, person_id, tipo, data)
			VALUES ($1,$2,'one_on_one',$3)
			ON CONFLICT (tenant_id, person_id, data, tipo) DO UPDATE
			  SET data = EXCLUDED.data
			RETURNING id`, tenantID, personID, r.Data).Scan(&meetingID)
		if err != nil {
			return fmt.Errorf("reunião %s: %w", r.Data, err)
		}
		rel.Reunioes++

		if r.Performance == "" {
			continue
		}
		// DO NOTHING, e não DO UPDATE: quando a 1:1 já tem avaliação vinda do
		// registro local, é ela que vale. O registro é o que EU escrevi sobre
		// a conversa, com justificativa e impacto; o dossiê é o resumo que a
		// ferramenta guardou. O dossiê preenche buraco, não corrige ninguém.
		//
		// É também o que protege a data repetida: a TeamGuide tem lançamento
		// duplicado no mesmo dia, as duas linhas caem na mesma reunião, e sem
		// isto a segunda apagaria a primeira em silêncio.
		res, err := tx.Exec(`
			INSERT INTO meeting_evals
			  (tenant_id, meeting_id, performance, performance_justificativa,
			   notas_compartilhadas, origem, confidencialidade)
			VALUES ($1,$2,$3,$4,$5,'teamguide','rh_calibragem')
			ON CONFLICT (tenant_id, meeting_id) DO NOTHING`,
			tenantID, meetingID, r.Performance, nulo(r.Avaliacao), nulo(r.Notas))
		if err != nil {
			return fmt.Errorf("avaliação %s: %w", r.Data, err)
		}
		if n, _ := res.RowsAffected(); n > 0 {
			rel.Avaliacoes++
		}
	}

	for _, fb := range d.Feedbacks {
		if err := gravarFeedback(tx, tenantID, personID, fb.Tipo, fb.Data,
			fb.Autor, "", fb.Texto, "arquivo_md", rel); err != nil {
			return fmt.Errorf("feedback %s: %w", fb.Data, err)
		}
	}
	return tx.Commit()
}

// gravarFeedback grava um feedback recebido, venha ele do dossiê ou de arquivo
// próprio.
//
// `autor_externo` sai de quem assina: feedback de par, de gestor de outra área
// ou de cliente interno é justamente o que não aparece em lugar nenhum hoje, e
// é o que mais pesa numa calibragem — vale saber que veio de fora.
//
// Confidencialidade 1: feedback foi escrito PARA a pessoa, ela já o leu na
// ferramenta. É o único material do sistema que nasce público ao liderado.
func gravarFeedback(tx *sql.Tx, tenantID, personID int64, tipo, data, autor,
	titulo, texto, fonte string, rel *RelProcessamento) error {

	var autorID *int64
	externo := true
	if autor != "" {
		var id int64
		err := tx.QueryRow(`
			SELECT id FROM people
			 WHERE tenant_id = $1 AND nome_normalizado = normaliza_nome($2)`,
			tenantID, autor).Scan(&id)
		if err == nil {
			autorID, externo = &id, false
		} else if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
	}

	// Hash calculado aqui, não no SQL: o mesmo `$N` servindo como bigint em
	// `person_id` e como texto dentro de `md5()` faz o Postgres recusar a
	// consulta inteira com "inconsistent types deduced for parameter".
	//
	// A chave é pessoa + data + texto. O autor fica de fora de propósito: o
	// mesmo feedback aparece no dossiê e em arquivo próprio, um com o nome de
	// quem assinou e o outro sem, e incluir o autor faria os dois entrarem
	// como se fossem dois reconhecimentos diferentes.
	soma := sha256.Sum256(fmt.Appendf(nil, "%d|%s|%s", personID, data, texto))

	res, err := tx.Exec(`
		INSERT INTO feedbacks
		  (tenant_id, person_id, direcao, tipo, autor_nome, autor_person_id,
		   autor_externo, data, titulo, texto, fonte, confidencialidade, hash_dedupe)
		VALUES ($1,$2,'recebido',$3,NULLIF($4,''),$5,$6,$7::date,NULLIF($8,''),$9,
		        $10,'publico_liderado',$11)
		ON CONFLICT (tenant_id, hash_dedupe) DO NOTHING`,
		tenantID, personID, tipo, autor, autorID, externo, data, titulo, texto,
		fonte, hex.EncodeToString(soma[:]))
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		rel.Feedbacks++
	}
	return nil
}

// processarFeedbacksAvulsos lê os feedbacks registrados em arquivo próprio.
//
// São os que não estavam na TeamGuide na hora do dossiê — elogio escrito na
// semana, reconhecimento de entrega. Ficavam na pasta da pessoa sem nenhum
// caminho para o banco, e sumiriam na AVD.
func processarFeedbacksAvulsos(db *sql.DB, tenantID int64, raiz string,
	dec decisoes, rel *RelProcessamento) error {

	arquivos, _ := filepath.Glob(filepath.Join(raiz, "*", "Feedback", "*.md"))
	sort.Strings(arquivos)

	for _, caminho := range arquivos {
		nome := filepath.Base(caminho)

		if dec.fora[nome] { // ver carregarIgnorados: pular, não só preservar o status
			continue
		}

		f, err := os.Open(caminho)
		if err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			continue
		}
		fa, err := ParseFeedbackAvulso(f)
		f.Close()
		if err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			marcarArquivo(db, tenantID, nome, "erro", err.Error())
			continue
		}

		// O nome do título pode vir abreviado ("Michell"); a pasta pai é a
		// segunda fonte, e entre as duas uma costuma resolver.
		pai := filepath.Base(filepath.Dir(filepath.Dir(caminho)))
		m, quem := dec.pessoaDe(nome), ""
		if m == nil {
			m, quem, err = resolverEntreParticipantes(db, tenantID, fa.Pessoa, []string{pai})
			if err != nil {
				return err
			}
		}
		if m == nil {
			rel.Revisao = append(rel.Revisao, fmt.Sprintf("%s: não resolvi %q", nome, fa.Pessoa))
			marcarRevisaoPessoa(db, tenantID, nome, []string{fa.Pessoa, pai})
			continue
		}
		if m.Como != "exata" && m.Como != "manual" {
			if err := GravarAlias(db, tenantID, m.PersonID, quem, "feedback"); err == nil {
				rel.Aliases++
			}
		}

		tx, err := db.Begin()
		if err != nil {
			return err
		}
		err = gravarFeedback(tx, tenantID, m.PersonID, fa.Tipo, fa.Data, "",
			fa.Titulo, fa.Texto, "arquivo_md", rel)
		if err != nil {
			tx.Rollback() //nolint:errcheck // o erro que importa é o de cima
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			marcarArquivo(db, tenantID, nome, "erro", err.Error())
			continue
		}
		if err := tx.Commit(); err != nil {
			return err
		}
		marcarArquivo(db, tenantID, nome, "processado", "", m.PersonID)
	}
	return nil
}

// resolverEntreParticipantes descobre de quem é a conversa tentando cada nome
// do cabeçalho, do mais provável para o menos.
//
// Existe porque identificar o liderado como "o participante que não é o
// coordenador" depende de saber o nome do coordenador, e quando ele não está
// configurado a comparação não elimina ninguém — sobra pegar o primeiro da
// lista, que o Tactiq às vezes ordena com o coordenador na frente. O sintoma é
// traiçoeiro: a carga não quebra, ela atribui a conversa à pessoa errada ou
// manda para revisão dizendo que não resolveu o nome do próprio coordenador.
//
// Tentar os demais nomes conserta isso sem depender de configuração: o
// coordenador não está na tabela de pessoas, então ele nunca resolve, e o
// liderado sim. Configurar COORDENADOR_NOME continua valendo — é o que marca
// as falas dele na transcrição —, mas a carga deixa de depender disso para
// acertar de quem é a conversa.
//
// Devolve também o nome que funcionou, porque é ele, e não o preferido, que
// deve virar alias.
func resolverEntreParticipantes(db *sql.DB, tenantID int64, preferido string,
	todos []string) (*Match, string, error) {

	tentados := map[string]bool{}
	tentar := func(nome string) (*Match, error) {
		nome = strings.TrimSpace(nome)
		if nome == "" || tentados[nome] {
			return nil, nil
		}
		tentados[nome] = true
		return ResolverPessoa(db, tenantID, nome)
	}

	if m, err := tentar(preferido); err != nil || m != nil {
		return m, preferido, err
	}
	for _, p := range todos {
		m, err := tentar(p)
		if err != nil {
			return nil, "", err
		}
		if m != nil {
			return m, strings.TrimSpace(p), nil
		}
	}
	return nil, preferido, nil
}

// decisoes é o que o coordenador já resolveu sobre arquivos específicos, por
// nome de arquivo.
//
// As duas decisões são de natureza diferente e por isso andam juntas: uma tira
// o arquivo da fila, a outra diz de quem ele é. O que elas têm em comum é
// serem humanas — a carga não pode desfazê-las na próxima passada.
type decisoes struct {
	fora   map[string]bool  // tirados da fila
	pessoa map[string]int64 // de quem é, quando a carga não soube dizer
}

// carregarDecisoes lê as duas de uma vez.
//
// Carregado uma vez por passada e consultado em memória: são 121 arquivos e
// uma consulta por arquivo seria 121 idas ao banco para responder sempre a
// mesma pergunta.
func carregarDecisoes(db *sql.DB, tenantID int64) decisoes {
	return decisoes{
		fora:   carregarIgnorados(db, tenantID),
		pessoa: carregarAtribuicoes(db, tenantID),
	}
}

// pessoaDe devolve a pessoa que o coordenador apontou para este arquivo.
//
// Vem antes de qualquer heurística: quem leu o arquivo e decidiu foi uma
// pessoa, e nenhuma similaridade de nome tem autoridade para discordar.
func (d decisoes) pessoaDe(arquivo string) *Match {
	if id, ok := d.pessoa[arquivo]; ok {
		return &Match{PersonID: id, Como: "manual"}
	}
	return nil
}

// carregarAtribuicoes lê os arquivos cuja pessoa foi apontada à mão.
//
// Quando a carga não consegue dizer de quem é a conversa, ela para e pede.
// Esta é a resposta: o coordenador abriu a tela, escolheu a pessoa, e essa
// escolha vale mais que qualquer heurística — inclusive na próxima passada,
// que senão mandaria o arquivo de volta para revisão e apagaria a decisão.
func carregarAtribuicoes(db *sql.DB, tenantID int64) map[string]int64 {
	atrib := map[string]int64{}
	linhas, err := db.Query(`
		SELECT nome_arquivo, person_id FROM source_files
		 WHERE tenant_id = $1 AND person_id IS NOT NULL AND pessoa_manual`, tenantID)
	if err != nil {
		return atrib
	}
	defer linhas.Close()
	for linhas.Next() {
		var nome string
		var id int64
		if linhas.Scan(&nome, &id) == nil {
			atrib[nome] = id
		}
	}
	return atrib
}

// carregarIgnorados lê quem o coordenador tirou da fila.
//
// Pular de fato, e não só preservar o status, importa: um arquivo ignorado que
// resolvesse pessoa e data criaria reunião e fonte no banco mesmo marcado como
// fora da fila — a tela diria "ignorado" e o dossiê teria o conteúdo.
func carregarIgnorados(db *sql.DB, tenantID int64) map[string]bool {
	fora := map[string]bool{}
	linhas, err := db.Query(`
		SELECT nome_arquivo FROM source_files
		 WHERE tenant_id = $1 AND status = 'ignorado'`, tenantID)
	if err != nil {
		return fora
	}
	defer linhas.Close()
	for linhas.Next() {
		var nome string
		if linhas.Scan(&nome) == nil {
			fora[nome] = true
		}
	}
	return fora
}
