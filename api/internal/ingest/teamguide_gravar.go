package ingest

// Gravação do export da TeamGuide no banco.
//
// Enriquece o ciclo que os rascunhos criaram — não cria um paralelo. As médias
// dos rascunhos locais e as da TeamGuide batem até a casa decimal que a
// ferramenta arredonda, porque são a mesma avaliação: o rascunho foi a
// preparação, a TeamGuide guarda o que foi lançado.
//
// O que entra de novo:
//
//   - a **autoavaliação** (`tipo='auto'`), que só existe na ferramenta e é o
//     outro lado do gap que a calibragem precisa enxergar;
//   - o vínculo com os ids da TeamGuide, para a próxima sincronização saber o
//     que já veio;
//   - os comentários como foram efetivamente lançados, que podem ter sido
//     editados depois do rascunho.

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func processarTeamGuide(db *sql.DB, tenantID int64, raiz string,
	dec decisoes, rel *RelProcessamento) error {

	arquivos, _ := filepath.Glob(filepath.Join(raiz, "AVD-*", "teamguide-*.json"))
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
		pac, err := ParseTeamGuide(f)
		f.Close()
		if err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			marcarArquivo(db, tenantID, nome, "erro", err.Error())
			continue
		}

		if err := gravarTeamGuide(db, tenantID, pac, rel); err != nil {
			rel.Erros = append(rel.Erros, fmt.Sprintf("%s: %v", nome, err))
			marcarArquivo(db, tenantID, nome, "erro", err.Error())
			continue
		}
		marcarArquivo(db, tenantID, nome, "processado", "")
	}
	return nil
}

func gravarTeamGuide(db *sql.DB, tenantID int64, p *PacoteTeamGuide,
	rel *RelProcessamento) error {

	// O ciclo tem que existir: ele nasce dos rascunhos, com drivers e
	// perguntas abertas. Criar um aqui a partir do export produziria um ciclo
	// sem escala, sem faixas e sem corte de elegibilidade — e a tela de AVD
	// classificaria todo mundo com base em nada.
	var cycleID int64
	err := db.QueryRow(`
		SELECT id FROM avd_cycles WHERE tenant_id = $1
		 ORDER BY periodo_inicio DESC LIMIT 1`, tenantID).Scan(&cycleID)
	if err == sql.ErrNoRows {
		rel.Revisao = append(rel.Revisao,
			"export da TeamGuide ignorado: nenhum ciclo de AVD no banco — "+
				"carregue os rascunhos primeiro, é deles que saem drivers e escala")
		return nil
	}
	if err != nil {
		return fmt.Errorf("ciclo: %w", err)
	}

	if _, err := db.Exec(`
		UPDATE avd_cycles SET teamguide_assessment_id = $2
		 WHERE id = $1 AND teamguide_assessment_id IS DISTINCT FROM $2`,
		cycleID, fmt.Sprint(p.AssessmentID)); err != nil {
		return fmt.Errorf("vincular ciclo: %w", err)
	}

	// Drivers e perguntas do ciclo, por (eixo, ordem) e por ordem.
	drivers, err := mapaDrivers(db, cycleID)
	if err != nil {
		return err
	}
	perguntas, err := mapaPerguntas(db, cycleID)
	if err != nil {
		return err
	}

	for _, pe := range p.Pessoas {
		m, err := ResolverPessoa(db, tenantID, pe.Nome)
		if err != nil {
			return err
		}
		if m == nil {
			rel.Revisao = append(rel.Revisao,
				fmt.Sprintf("TeamGuide: não resolvi %q", pe.Nome))
			continue
		}

		// A data de admissão vem junto e só preenche buraco. É ela que decide
		// elegibilidade ao ciclo, e a TeamGuide é a fonte corporativa dela —
		// melhor que o "-" que os dossiês trazem para metade do time.
		if pe.Admissao != "" {
			r, err := db.Exec(`
				UPDATE people SET data_admissao = $3::date
				 WHERE tenant_id = $1 AND id = $2 AND data_admissao IS NULL`,
				tenantID, m.PersonID, pe.Admissao)
			if err != nil {
				return fmt.Errorf("admissão de %s: %w", pe.Nome, err)
			}
			if n, _ := r.RowsAffected(); n > 0 {
				rel.Admissoes++
			}
		}

		for _, tipo := range []string{"lider", "auto"} {
			if err := gravarAvaliacaoTG(db, tenantID, cycleID, m.PersonID,
				tipo, pe, drivers, perguntas, rel); err != nil {
				return fmt.Errorf("%s (%s): %w", pe.Nome, tipo, err)
			}
		}
	}
	return nil
}

// gravarAvaliacaoTG grava uma das duas leituras: a do líder ou a da pessoa.
//
// A autoavaliação pode simplesmente não existir — nem todo mundo respondeu. E
// a ausência é informação: criar uma linha vazia faria a tela mostrar gap zero
// onde na verdade não há com o que comparar.
func gravarAvaliacaoTG(db *sql.DB, tenantID, cycleID, personID int64, tipo string,
	pe PessoaTeamGuide, drivers map[string]int64, perguntas map[int]int64,
	rel *RelProcessamento) error {

	notaDe := func(c CriterioTeamGuide) *int {
		if tipo == "auto" {
			return c.NotaSelf
		}
		return c.NotaLider
	}

	temNota := false
	for _, c := range pe.Criterios {
		if c.Eixo != "aberta" && notaDe(c) != nil {
			temNota = true
			break
		}
	}
	if !temNota {
		return nil // esta leitura não foi preenchida na ferramenta
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // commit explícito no fim

	comp, des := pe.MediaDe("comportamento", tipo), pe.MediaDe("desempenho", tipo)

	// `status='enviada'`: veio da ferramenta, logo foi lançada. O rascunho
	// local fica como estava — ele descreve a preparação, não o lançamento.
	var evalID int64
	err = tx.QueryRow(`
		INSERT INTO avd_evaluations
		  (tenant_id, cycle_id, person_id, tipo, status,
		   media_comportamento, media_desempenho,
		   teamguide_participant_id, sincronizado_em, confidencialidade)
		VALUES ($1,$2,$3,$4,'enviada',$5,$6,$7,now(),'rh_calibragem')
		ON CONFLICT (tenant_id, cycle_id, person_id, tipo) DO UPDATE SET
		  status = 'enviada',
		  media_comportamento = COALESCE(EXCLUDED.media_comportamento,
		                                 avd_evaluations.media_comportamento),
		  media_desempenho = COALESCE(EXCLUDED.media_desempenho,
		                              avd_evaluations.media_desempenho),
		  teamguide_participant_id = EXCLUDED.teamguide_participant_id,
		  sincronizado_em = now()
		RETURNING id`,
		tenantID, cycleID, personID, tipo, comp, des,
		fmt.Sprint(pe.Participant)).Scan(&evalID)
	if err != nil {
		return fmt.Errorf("avaliação: %w", err)
	}

	for _, c := range pe.Criterios {
		if c.Eixo == "aberta" {
			qID, ok := perguntas[c.Ordem]
			if !ok {
				continue
			}
			resp := c.Comentario(tipo)
			if resp == "" {
				continue
			}
			if _, err := tx.Exec(`
				INSERT INTO avd_open_answers (evaluation_id, question_id, resposta, enviado_em)
				VALUES ($1,$2,$3,now())
				ON CONFLICT (evaluation_id, question_id) DO UPDATE SET
				  resposta = EXCLUDED.resposta, enviado_em = now()`,
				evalID, qID, resp); err != nil {
				return fmt.Errorf("resposta aberta %d: %w", c.Ordem, err)
			}
			rel.Abertas++
			continue
		}

		nota := notaDe(c)
		if nota == nil {
			continue
		}
		dID, ok := drivers[chaveDriver(c.Eixo, c.Ordem)]
		if !ok {
			rel.Revisao = append(rel.Revisao, fmt.Sprintf(
				"TeamGuide: driver %s/%d não existe no ciclo — nota descartada",
				c.Eixo, c.Ordem))
			continue
		}
		if _, err := tx.Exec(`
			INSERT INTO avd_driver_scores (evaluation_id, driver_id, nota, comentario, enviado_em)
			VALUES ($1,$2,$3,NULLIF($4,''),now())
			ON CONFLICT (evaluation_id, driver_id) DO UPDATE SET
			  nota = EXCLUDED.nota,
			  -- O comentário da ferramenta só sobrescreve quando existe: um
			  -- lançamento sem comentário não pode apagar o que o rascunho
			  -- escreveu, que costuma ser mais longo e mais ancorado.
			  comentario = COALESCE(EXCLUDED.comentario, avd_driver_scores.comentario),
			  enviado_em = now()`,
			evalID, dID, *nota, c.Comentario(tipo)); err != nil {
			return fmt.Errorf("nota %s/%d: %w", c.Eixo, c.Ordem, err)
		}
		rel.Drivers++
	}
	return tx.Commit()
}

func chaveDriver(eixo string, ordem int) string {
	return strings.ToLower(eixo) + "/" + fmt.Sprint(ordem)
}

func mapaDrivers(db *sql.DB, cycleID int64) (map[string]int64, error) {
	linhas, err := db.Query(`SELECT id, eixo, ordem FROM avd_drivers WHERE cycle_id = $1`, cycleID)
	if err != nil {
		return nil, fmt.Errorf("drivers: %w", err)
	}
	defer linhas.Close()
	out := map[string]int64{}
	for linhas.Next() {
		var id int64
		var eixo string
		var ordem int
		if err := linhas.Scan(&id, &eixo, &ordem); err != nil {
			return nil, err
		}
		out[chaveDriver(eixo, ordem)] = id
	}
	return out, linhas.Err()
}

func mapaPerguntas(db *sql.DB, cycleID int64) (map[int]int64, error) {
	linhas, err := db.Query(`SELECT id, ordem FROM avd_open_questions WHERE cycle_id = $1`, cycleID)
	if err != nil {
		return nil, fmt.Errorf("perguntas: %w", err)
	}
	defer linhas.Close()
	out := map[int]int64{}
	for linhas.Next() {
		var id int64
		var ordem int
		if err := linhas.Scan(&id, &ordem); err != nil {
			return nil, err
		}
		out[ordem] = id
	}
	return out, linhas.Err()
}
