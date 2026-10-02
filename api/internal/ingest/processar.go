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
	Linhas          int
	Aliases         int
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

	if err := processarRegistros(db, tenantID, raiz, &rel); err != nil {
		return rel, err
	}
	if err := processarTranscricoes(db, tenantID, raiz, coordenador, &rel); err != nil {
		return rel, err
	}
	if err := processarAVD(db, tenantID, raiz, &rel); err != nil {
		return rel, err
	}
	return rel, nil
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
	rel *RelProcessamento) error {

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

		m, err := ResolverPessoa(db, tenantID, t.Participante)
		if err != nil {
			return err
		}
		if m == nil {
			rel.Revisao = append(rel.Revisao,
				fmt.Sprintf("%s: não resolvi %q", nome, t.Participante))
			marcarArquivo(db, tenantID, nome, "revisao_manual", "pessoa não resolvida")
			continue
		}
		if m.Como != "exata" {
			if err := GravarAlias(db, tenantID, m.PersonID, t.Participante, "transcricao"); err == nil {
				rel.Aliases++
			}
		}

		if err := gravarTranscricao(db, tenantID, m.PersonID, nome, t, rel); err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			marcarArquivo(db, tenantID, nome, "erro", err.Error())
			continue
		}
		marcarArquivo(db, tenantID, nome, "processado", "")
	}
	return nil
}

func gravarTranscricao(db *sql.DB, tenantID, personID int64, arquivo string,
	t *Transcricao, rel *RelProcessamento) error {

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
		VALUES ($1,$2,'tactiq','transcricao_bruta',$3,$4,'tactiq_txt',$5,'privado_coordenador')
		ON CONFLICT (tenant_id, meeting_id, texto_sha256) DO UPDATE SET fonte = EXCLUDED.fonte
		RETURNING id, (xmax <> 0)`,
		tenantID, meetingID, t.TextoCanonico, hash, nulo(t.URLOriginal)).Scan(&sourceID, &jaExistia)
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

func processarRegistros(db *sql.DB, tenantID int64, raiz string, rel *RelProcessamento) error {
	arquivos, _ := filepath.Glob(filepath.Join(raiz, "registros-1-1", "*.md"))
	sort.Strings(arquivos)

	for _, caminho := range arquivos {
		nome := filepath.Base(caminho)

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
		marcarArquivo(db, tenantID, nome, "processado", "")
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

func processarAVD(db *sql.DB, tenantID int64, raiz string, rel *RelProcessamento) error {
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
		marcarArquivo(db, tenantID, nome, "processado", "")
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

func marcarArquivo(db *sql.DB, tenantID int64, nomeArquivo, status, erro string) {
	_, _ = db.Exec(`
		UPDATE source_files SET status = $3, erro = NULLIF($4,''), processado_em = now()
		 WHERE tenant_id = $1 AND nome_arquivo = $2`,
		tenantID, nomeArquivo, status, erro)
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
