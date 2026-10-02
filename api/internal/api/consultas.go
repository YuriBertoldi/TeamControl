package api

import (
	"context"
	"database/sql"
	"fmt"

	"teamcontrol/internal/models"
)

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
