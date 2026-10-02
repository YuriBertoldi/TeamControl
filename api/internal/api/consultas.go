package api

import (
	"context"
	"database/sql"
	"fmt"

	"teamcontrol/internal/models"
)

// listarPessoas devolve o time sob a gestão, já com o filtro de audiência.
//
// Pessoas não têm coluna de confidencialidade própria — o cadastro em si é
// nível 1. O que o Scope protege aqui é o motivo do afastamento, que pode ser
// de saúde: só sai para audiência coordenador e com IncluirSaude explícito.
func listarPessoas(ctx context.Context, db *sql.DB, sc models.Scope) ([]models.Pessoa, error) {
	nivelMax, err := sc.Aud.NivelMax()
	if err != nil {
		return nil, err
	}
	verMotivo := nivelMax >= 3 && sc.IncluirSaude

	linhas, err := db.QueryContext(ctx, `
		SELECT p.id, p.slug, p.nome_completo, p.nome_curto, p.familia, p.cargo,
		       p.eh_tech_lead, p.qa_de,
		       to_char(p.data_admissao,'YYYY-MM-DD'),
		       to_char(p.data_desligamento,'YYYY-MM-DD'),
		       p.status,
		       CASE WHEN $2 THEN p.motivo_afastamento ELSE NULL END,
		       to_char(p.retorno_previsto,'YYYY-MM-DD'),
		       p.teamguide_employee_id, p.squad_id, p.cadencia_dias
		  FROM people p
		 WHERE p.tenant_id = $1
		 ORDER BY p.eh_tech_lead DESC, p.nome_completo`, sc.TenantID, verMotivo)
	if err != nil {
		return nil, fmt.Errorf("consultar pessoas: %w", err)
	}
	defer linhas.Close()

	var out []models.Pessoa
	for linhas.Next() {
		var p models.Pessoa
		if err := linhas.Scan(
			&p.ID, &p.Slug, &p.NomeCompleto, &p.NomeCurto, &p.Familia, &p.Cargo,
			&p.EhTechLead, &p.QADe, &p.DataAdmissao, &p.DataDesligamento, &p.Status,
			&p.MotivoAfastamento, &p.RetornoPrevisto, &p.PortalID, &p.SquadID,
			&p.CadenciaDias,
		); err != nil {
			return nil, fmt.Errorf("ler pessoa: %w", err)
		}
		p.TenantID = sc.TenantID
		out = append(out, p)
	}
	return out, linhas.Err()
}

func listarArquivos(ctx context.Context, db *sql.DB, tenantID int64, status string) ([]models.ArquivoFonte, error) {
	consulta := `
		SELECT id, caminho, nome_arquivo, sha256, bytes, tipo_detectado, status,
		       erro, motivo_revisao, meeting_id, person_id,
		       to_char(data_reuniao,'YYYY-MM-DD'), to_char(data_arquivo,'YYYY-MM-DD')
		  FROM source_files
		 WHERE tenant_id = $1 AND ($2 = '' OR status = $2)
		 ORDER BY CASE status
		            WHEN 'erro' THEN 0 WHEN 'revisao_manual' THEN 1
		            WHEN 'pendente' THEN 2 ELSE 3 END,
		          nome_arquivo`

	linhas, err := db.QueryContext(ctx, consulta, tenantID, status)
	if err != nil {
		return nil, fmt.Errorf("consultar arquivos: %w", err)
	}
	defer linhas.Close()

	var out []models.ArquivoFonte
	for linhas.Next() {
		var a models.ArquivoFonte
		if err := linhas.Scan(
			&a.ID, &a.Caminho, &a.NomeArquivo, &a.SHA256, &a.Bytes, &a.Tipo, &a.Status,
			&a.Erro, &a.MotivoRevisao, &a.MeetingID, &a.PessoaID,
			&a.DataReuniao, &a.DataArquivo,
		); err != nil {
			return nil, fmt.Errorf("ler arquivo: %w", err)
		}
		a.TenantID = tenantID
		out = append(out, a)
	}
	return out, linhas.Err()
}
