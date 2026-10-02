// Package store concentra conexão, migrations e consultas.
//
// Regra arquitetural do pacote: NENHUMA função exportada que devolva texto de
// domínio aceita assinatura sem models.Scope. O filtro de confidencialidade
// acontece na consulta, antes de qualquer LLM ou resposta HTTP ver o dado —
// não em camada acima, onde seria esquecido.
package store

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
)

func NewDB() (*sql.DB, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://teamcontrol:teamcontrol@localhost:5432/teamcontrol?sslmode=disable"
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("abrir conexão: %w", err)
	}
	db.SetMaxOpenConns(16)
	db.SetMaxIdleConns(4)
	db.SetConnMaxLifetime(time.Hour)

	// O Postgres do compose pode ainda estar subindo.
	var ultimo error
	for i := 0; i < 30; i++ {
		if ultimo = db.Ping(); ultimo == nil {
			return db, nil
		}
		time.Sleep(time.Second)
	}
	return nil, fmt.Errorf("banco não respondeu em 30s: %w", ultimo)
}

// RunMigrations aplica o que falta, cada versão em sua própria transação.
// Uma migration que falha no meio não deixa metade aplicada.
func RunMigrations(db *sql.DB) error {
	if _, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    INT PRIMARY KEY,
			name       TEXT NOT NULL,
			aplicada_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`); err != nil {
		return fmt.Errorf("criar schema_migrations: %w", err)
	}

	var atual int
	if err := db.QueryRow(
		`SELECT COALESCE(MAX(version), 0) FROM schema_migrations`).Scan(&atual); err != nil {
		return fmt.Errorf("ler versão atual: %w", err)
	}

	for _, m := range migrations {
		if m.version <= atual {
			continue
		}
		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("iniciar transação da v%d: %w", m.version, err)
		}
		for i, stmt := range m.stmts {
			if _, err := tx.Exec(stmt); err != nil {
				_ = tx.Rollback()
				return fmt.Errorf("migration v%d (%s), comando %d: %w", m.version, m.name, i+1, err)
			}
		}
		if _, err := tx.Exec(
			`INSERT INTO schema_migrations (version, name) VALUES ($1, $2)`,
			m.version, m.name); err != nil {
			_ = tx.Rollback()
			return fmt.Errorf("registrar v%d: %w", m.version, err)
		}
		if err := tx.Commit(); err != nil {
			return fmt.Errorf("commit da v%d: %w", m.version, err)
		}
		log.Printf("migration v%d (%s) aplicada", m.version, m.name)
	}
	return nil
}

// EnsureTenant garante tenant e usuário coordenador iniciais, e devolve os ids.
func EnsureTenant(db *sql.DB, slug, nome, email string) (tenantID, userID int64, err error) {
	err = db.QueryRow(`
		INSERT INTO tenants (slug, nome) VALUES ($1, $2)
		ON CONFLICT (slug) DO UPDATE SET nome = EXCLUDED.nome
		RETURNING id`, slug, nome).Scan(&tenantID)
	if err != nil {
		return 0, 0, fmt.Errorf("upsert tenant: %w", err)
	}

	err = db.QueryRow(`
		INSERT INTO users (tenant_id, nome, email, senha_hash, papel)
		VALUES ($1, $2, $3, '', 'coordenador')
		ON CONFLICT (email) DO UPDATE SET nome = EXCLUDED.nome
		RETURNING id`, tenantID, nome, email).Scan(&userID)
	if err != nil {
		return 0, 0, fmt.Errorf("upsert usuário: %w", err)
	}
	return tenantID, userID, nil
}
