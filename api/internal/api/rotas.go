// Package api expõe as rotas HTTP JSON.
//
// Toda rota de leitura que devolve texto de domínio resolve um models.Scope
// antes de consultar: é o Scope que carrega a audiência, e é a audiência que
// define o teto de confidencialidade aplicado no SQL.
package api

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"time"

	"teamcontrol/internal/ingest"
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
		// A pasta vai junto: o front tinha a mesma configuração duplicada, com um
		// caminho de demonstração por padrão, e a tela de Importações exibia um
		// diretório que não era o varrido. Fonte única é quem de fato varre.
		escreverJSON(w, map[string]any{
			"ok": true, "em": time.Now(),
			// O caminho do HOST, não o do container: "/data/registros" não
			// ajuda ninguém a achar o arquivo no Explorer.
			"pasta": primeiroNaoVazio(os.Getenv("PASTA_REGISTROS_HOST"), os.Getenv("PASTA_REGISTROS")),
		})
	})

	mux.HandleFunc("GET /api/pessoas", func(w http.ResponseWriter, r *http.Request) {
		sc := escopo()
		if err := sc.Validate(); err != nil {
			erroJSON(w, http.StatusBadRequest, err.Error())
			return
		}
		pessoas, err := listarPessoasFront(r.Context(), db, sc)
		if err != nil {
			log.Printf("listar pessoas: %v", err)
			erroJSON(w, http.StatusInternalServerError, "falha ao listar pessoas")
			return
		}
		escreverJSON(w, pessoas)
	})

	// PUT substitui a lista inteira, espelhando `salvarPessoas(lista)` da tela.
	// Ver o comentário de topo de cadastro.go para o porquê e para a
	// assimetria entre pessoa (nunca removida) e squad (removível).
	mux.HandleFunc("PUT /api/pessoas", func(w http.ResponseWriter, r *http.Request) {
		var lista []PessoaEntrada
		if err := json.NewDecoder(r.Body).Decode(&lista); err != nil {
			erroJSON(w, http.StatusBadRequest, "corpo inválido: "+err.Error())
			return
		}
		if err := salvarPessoas(r.Context(), db, escopo(), lista); err != nil {
			log.Printf("salvar pessoas: %v", err)
			erroJSON(w, http.StatusInternalServerError, err.Error())
			return
		}
		escreverJSON(w, map[string]any{"ok": true, "gravadas": len(lista)})
	})

	mux.HandleFunc("GET /api/tribos", func(w http.ResponseWriter, r *http.Request) {
		tribos, err := listarTribos(r.Context(), db, escopo())
		if err != nil {
			log.Printf("listar tribos: %v", err)
			erroJSON(w, http.StatusInternalServerError, "falha ao listar tribos")
			return
		}
		escreverJSON(w, tribos)
	})

	mux.HandleFunc("PUT /api/tribos", func(w http.ResponseWriter, r *http.Request) {
		var lista []TriboEntrada
		if err := json.NewDecoder(r.Body).Decode(&lista); err != nil {
			erroJSON(w, http.StatusBadRequest, "corpo inválido: "+err.Error())
			return
		}
		if err := salvarTribos(r.Context(), db, escopo(), lista); err != nil {
			log.Printf("salvar tribos: %v", err)
			erroJSON(w, http.StatusInternalServerError, err.Error())
			return
		}
		escreverJSON(w, map[string]any{"ok": true, "gravadas": len(lista)})
	})

	mux.HandleFunc("GET /api/squads", func(w http.ResponseWriter, r *http.Request) {
		squads, err := listarSquads(r.Context(), db, escopo())
		if err != nil {
			log.Printf("listar squads: %v", err)
			erroJSON(w, http.StatusInternalServerError, "falha ao listar squads")
			return
		}
		escreverJSON(w, squads)
	})

	mux.HandleFunc("PUT /api/squads", func(w http.ResponseWriter, r *http.Request) {
		var lista []SquadEntrada
		if err := json.NewDecoder(r.Body).Decode(&lista); err != nil {
			erroJSON(w, http.StatusBadRequest, "corpo inválido: "+err.Error())
			return
		}
		if err := salvarSquads(r.Context(), db, escopo(), lista); err != nil {
			log.Printf("salvar squads: %v", err)
			erroJSON(w, http.StatusInternalServerError, err.Error())
			return
		}
		escreverJSON(w, map[string]any{"ok": true, "gravadas": len(lista)})
	})

	mux.HandleFunc("GET /api/registros", func(w http.ResponseWriter, r *http.Request) {
		lista, err := listarRegistros(r.Context(), db, tenantID)
		if err != nil {
			log.Printf("listar registros: %v", err)
			erroJSON(w, http.StatusInternalServerError, "falha ao listar registros")
			return
		}
		escreverJSON(w, lista)
	})

	// O detalhe é rota separada porque traz o texto: transcrição inteira,
	// anotações e as três partes do registro. No índice isso seriam ~1 MB.
	mux.HandleFunc("GET /api/registros/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, err := idDaURL(r.URL.Path)
		if err != nil {
			erroJSON(w, http.StatusBadRequest, "id inválido")
			return
		}
		d, err := detalharRegistro(r.Context(), db, tenantID, id)
		if errors.Is(err, sql.ErrNoRows) {
			erroJSON(w, http.StatusNotFound, "registro não encontrado")
			return
		}
		if err != nil {
			log.Printf("detalhar registro %d: %v", id, err)
			erroJSON(w, http.StatusInternalServerError, "falha ao abrir o registro")
			return
		}
		escreverJSON(w, d)
	})

	mux.HandleFunc("GET /api/importacoes", func(w http.ResponseWriter, r *http.Request) {
		arquivos, err := listarImportacoesFront(r.Context(), db, tenantID)
		if err != nil {
			log.Printf("listar importações: %v", err)
			erroJSON(w, http.StatusInternalServerError, "falha ao listar importações")
			return
		}
		escreverJSON(w, arquivos)
	})

	// Ignorar / devolver para a fila. Era botão sem ação nenhuma na tela.
	mux.HandleFunc("PUT /api/importacoes/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, err := idDaURL(r.URL.Path)
		if err != nil {
			erroJSON(w, http.StatusBadRequest, "id inválido")
			return
		}
		var corpo struct {
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&corpo); err != nil {
			erroJSON(w, http.StatusBadRequest, "corpo inválido: "+err.Error())
			return
		}
		err = marcarStatusArquivo(r.Context(), db, tenantID, id, corpo.Status)
		if errors.Is(err, sql.ErrNoRows) {
			erroJSON(w, http.StatusNotFound, "arquivo não encontrado")
			return
		}
		if err != nil {
			log.Printf("marcar arquivo %d: %v", id, err)
			erroJSON(w, http.StatusBadRequest, err.Error())
			return
		}
		escreverJSON(w, map[string]any{"ok": true})
	})

	// Varredura sob demanda: cataloga e processa, na mesma ordem do CLI.
	//
	// As duas passadas são idempotentes, então repetir é barato e seguro — é
	// justamente o que permite expor isto como botão em vez de tarefa de
	// terminal.
	mux.HandleFunc("POST /api/importacoes/varrer", func(w http.ResponseWriter, r *http.Request) {
		raiz := primeiroNaoVazio(os.Getenv("PASTA_REGISTROS"), "/data/registros")
		rel, err := ingest.Seed(db, tenantID, raiz, false)
		if err != nil {
			log.Printf("varrer: %v", err)
			erroJSON(w, http.StatusInternalServerError, "falha ao varrer a pasta: "+err.Error())
			return
		}
		proc, err := ingest.Processar(db, tenantID, raiz,
			primeiroNaoVazio(os.Getenv("COORDENADOR_NOME"), "Coordenação"))
		if err != nil {
			log.Printf("processar: %v", err)
			erroJSON(w, http.StatusInternalServerError, "falha ao processar: "+err.Error())
			return
		}
		escreverJSON(w, map[string]any{
			"ok":        true,
			"vistos":    rel.Vistos,
			"reunioes":  proc.Reunioes,
			"registros": proc.Registros,
			"revisao":   proc.Revisao,
			"erros":     proc.Erros,
		})
	})

	return comCORS(comLog(mux))
}

// comCORS libera o frontend de desenvolvimento, que roda noutra porta.
//
// A lista de origens é fechada em localhost de propósito: o sistema é local e
// o dado é de RH. Um curinga aqui deixaria qualquer página aberta no navegador
// ler a API enquanto ela estiver de pé.
func comCORS(h http.Handler) http.Handler {
	permitidas := map[string]bool{
		"http://localhost:5180": true, "http://127.0.0.1:5180": true,
		"http://localhost:4173": true, "http://127.0.0.1:4173": true,
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origem := r.Header.Get("Origin"); permitidas[origem] {
			w.Header().Set("Access-Control-Allow-Origin", origem)
			w.Header().Set("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		h.ServeHTTP(w, r)
	})
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

// primeiroNaoVazio devolve o primeiro valor preenchido.
func primeiroNaoVazio(valores ...string) string {
	for _, v := range valores {
		if v != "" {
			return v
		}
	}
	return ""
}
