// Package api expõe as rotas HTTP JSON.
//
// Toda rota de leitura que devolve texto de domínio resolve um models.Scope
// antes de consultar: é o Scope que carrega a audiência, e é a audiência que
// define o teto de confidencialidade aplicado no SQL.
package api

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"teamcontrol/internal/models"
)

func Rotas(db *sql.DB, tenantID, userID int64) http.Handler {
	mux := http.NewServeMux()

	// Enquanto não há autenticação, a audiência é fixa em coordenador — e isso
	// está explícito aqui, não escondido numa camada qualquer.
	escopo := func() models.Scope {
		return models.Scope{TenantID: tenantID, UserID: userID, Aud: models.AudCoordenador}
	}

	mux.HandleFunc("GET /api/saude", func(w http.ResponseWriter, r *http.Request) {
		if err := db.PingContext(r.Context()); err != nil {
			erroJSON(w, http.StatusServiceUnavailable, "banco indisponível")
			return
		}
		escreverJSON(w, map[string]any{"ok": true, "em": time.Now()})
	})

	mux.HandleFunc("GET /api/pessoas", func(w http.ResponseWriter, r *http.Request) {
		sc := escopo()
		if err := sc.Validate(); err != nil {
			erroJSON(w, http.StatusBadRequest, err.Error())
			return
		}
		pessoas, err := listarPessoas(r.Context(), db, sc)
		if err != nil {
			log.Printf("listar pessoas: %v", err)
			erroJSON(w, http.StatusInternalServerError, "falha ao listar pessoas")
			return
		}
		escreverJSON(w, pessoas)
	})

	mux.HandleFunc("GET /api/importacoes", func(w http.ResponseWriter, r *http.Request) {
		arquivos, err := listarArquivos(r.Context(), db, tenantID, r.URL.Query().Get("status"))
		if err != nil {
			log.Printf("listar importações: %v", err)
			erroJSON(w, http.StatusInternalServerError, "falha ao listar importações")
			return
		}
		escreverJSON(w, arquivos)
	})

	return comLog(mux)
}

func escreverJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("escrever json: %v", err)
	}
}

func erroJSON(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]string{"erro": msg})
}

func comLog(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		inicio := time.Now()
		h.ServeHTTP(w, r)
		log.Printf("%s %s %s", r.Method, r.URL.Path, time.Since(inicio).Round(time.Millisecond))
	})
}
