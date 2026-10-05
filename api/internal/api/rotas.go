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
	"teamcontrol/internal/pauta"
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

	// Board de compromissos: os encaminhamentos de todo mundo, em aberto.
	//
	// Rota global e não por pessoa porque a pergunta que ela responde é "o que
	// está vencido HOJE", e essa pergunta atravessa o time inteiro — perguntá-la
	// pessoa a pessoa é exatamente o trabalho que o board existe para evitar.
	mux.HandleFunc("GET /api/compromissos", func(w http.ResponseWriter, r *http.Request) {
		lista, err := pauta.CompromissosDe(db, tenantID, 0)
		if err != nil {
			log.Printf("listar compromissos: %v", err)
			erroJSON(w, http.StatusInternalServerError, "falha ao listar compromissos")
			return
		}
		escreverJSON(w, lista)
	})

	// Concluir (ou reabrir) um lote.
	//
	// Rota própria e não um laço na tela: fechar dezesseis combinados em
	// dezesseis requisições falharia na nona sem ninguém saber, e o board
	// ficaria mostrando sete abertos que a conversa já resolveu.
	mux.HandleFunc("POST /api/compromissos/lote", func(w http.ResponseWriter, r *http.Request) {
		var corpo struct {
			IDs    []int64 `json:"ids"`
			Status string  `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&corpo); err != nil {
			erroJSON(w, http.StatusBadRequest, "corpo inválido: "+err.Error())
			return
		}
		n, err := concluirEmLote(r.Context(), db, tenantID, corpo.IDs, corpo.Status)
		if err != nil {
			erroJSON(w, http.StatusBadRequest, err.Error())
			return
		}
		escreverJSON(w, map[string]any{"ok": true, "alterados": n})
	})

	// Confirmar prazo e mudar situação. A data que o sistema sugeriu só vira a
	// data que vale passando por aqui — ver internal/ingest/prazo.go.
	mux.HandleFunc("PUT /api/compromissos/{id}", func(w http.ResponseWriter, r *http.Request) {
		id, err := idDaURL(r.URL.Path)
		if err != nil {
			erroJSON(w, http.StatusBadRequest, "id inválido")
			return
		}
		var corpo struct {
			Prazo  string `json:"prazo"`
			Status string `json:"status"`
		}
		if err := json.NewDecoder(r.Body).Decode(&corpo); err != nil {
			erroJSON(w, http.StatusBadRequest, "corpo inválido: "+err.Error())
			return
		}
		err = atualizarCompromisso(r.Context(), db, tenantID, id, corpo.Prazo, corpo.Status)
		if errors.Is(err, sql.ErrNoRows) {
			erroJSON(w, http.StatusNotFound, "compromisso não encontrado")
			return
		}
		if err != nil {
			log.Printf("atualizar compromisso %d: %v", id, err)
			erroJSON(w, http.StatusBadRequest, err.Error())
			return
		}
		escreverJSON(w, map[string]any{"ok": true})
	})

	// A preparação de uma 1:1. Sob demanda e por pessoa: é um pacote caro —
	// lê o texto de todas as conversas dela — e só faz sentido quando a tela
	// de preparação abre, não na subida do sistema.
	mux.HandleFunc("GET /api/preparo/{slug}", func(w http.ResponseWriter, r *http.Request) {
		slug := slugDaURL(r.URL.Path)
		if slug == "" {
			erroJSON(w, http.StatusBadRequest, "pessoa não informada")
			return
		}
		p, err := pauta.Montar(db, tenantID, slug, time.Now())
		if errors.Is(err, sql.ErrNoRows) {
			erroJSON(w, http.StatusNotFound, "pessoa não encontrada")
			return
		}
		if err != nil {
			log.Printf("preparo de %s: %v", slug, err)
			erroJSON(w, http.StatusInternalServerError, "falha ao montar a preparação")
			return
		}
		escreverJSON(w, p)
	})

	/* ---------- desenvolvimento: skills, PDI, trilha ---------- */

	mux.HandleFunc("GET /api/skills", func(w http.ResponseWriter, r *http.Request) {
		lista, err := listarSkills(r.Context(), db, tenantID)
		if err != nil {
			log.Printf("listar skills: %v", err)
			erroJSON(w, http.StatusInternalServerError, "falha ao listar skills")
			return
		}
		escreverJSON(w, lista)
	})

	// POST e não PUT: cada lançamento ACRESCENTA uma leitura, nunca substitui
	// a lista. Nível de skill é série temporal — ver desenvolvimento.go.
	mux.HandleFunc("POST /api/skills", func(w http.ResponseWriter, r *http.Request) {
		var lote []AvaliacaoSkill
		if err := json.NewDecoder(r.Body).Decode(&lote); err != nil {
			erroJSON(w, http.StatusBadRequest, "corpo inválido: "+err.Error())
			return
		}
		res, err := salvarSkills(r.Context(), db, tenantID, lote)
		if err != nil {
			log.Printf("salvar skills: %v", err)
			erroJSON(w, http.StatusInternalServerError, err.Error())
			return
		}
		escreverJSON(w, res)
	})

	mux.HandleFunc("GET /api/pdi", func(w http.ResponseWriter, r *http.Request) {
		lista, err := listarPDI(r.Context(), db, tenantID)
		if err != nil {
			log.Printf("listar PDI: %v", err)
			erroJSON(w, http.StatusInternalServerError, "falha ao listar PDI")
			return
		}
		escreverJSON(w, lista)
	})

	mux.HandleFunc("POST /api/pdi", func(w http.ResponseWriter, r *http.Request) {
		var pl PlanoPDI
		if err := json.NewDecoder(r.Body).Decode(&pl); err != nil {
			erroJSON(w, http.StatusBadRequest, "corpo inválido: "+err.Error())
			return
		}
		id, err := salvarPDI(r.Context(), db, tenantID, pl)
		if err != nil {
			// Erro de regra (sem skill-alvo, alvo menor que o atual) é 400 e
			// vai inteiro para a tela: a mensagem É a orientação.
			erroJSON(w, http.StatusBadRequest, err.Error())
			return
		}
		escreverJSON(w, map[string]any{"ok": true, "id": id})
	})

	mux.HandleFunc("GET /api/trilha", func(w http.ResponseWriter, r *http.Request) {
		t, err := listarTrilha(r.Context(), db, tenantID)
		if err != nil {
			log.Printf("listar trilha: %v", err)
			erroJSON(w, http.StatusInternalServerError, "falha ao listar a trilha")
			return
		}
		escreverJSON(w, t)
	})

	mux.HandleFunc("PUT /api/trilha", func(w http.ResponseWriter, r *http.Request) {
		var c struct {
			Pessoa     string `json:"pessoa"`
			CriterioID int64  `json:"criterioId"`
			AtendidoEm string `json:"atendidoEm"`
			Evidencia  string `json:"evidencia"`
			Nota       string `json:"nota"`
		}
		if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
			erroJSON(w, http.StatusBadRequest, "corpo inválido: "+err.Error())
			return
		}
		err := marcarCriterio(r.Context(), db, tenantID, c.Pessoa, c.CriterioID,
			c.AtendidoEm, c.Evidencia, c.Nota)
		if errors.Is(err, sql.ErrNoRows) {
			erroJSON(w, http.StatusNotFound, "pessoa ou critério não encontrado")
			return
		}
		if err != nil {
			erroJSON(w, http.StatusBadRequest, err.Error())
			return
		}
		escreverJSON(w, map[string]any{"ok": true})
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
			Pessoa string `json:"pessoa"` // slug
		}
		if err := json.NewDecoder(r.Body).Decode(&corpo); err != nil {
			erroJSON(w, http.StatusBadRequest, "corpo inválido: "+err.Error())
			return
		}
		// Apontar a pessoa é a saída da revisão manual, e por isso vem antes:
		// quem escolheu a pessoa está dizendo "processe", não "mude o status".
		if corpo.Pessoa != "" {
			err = atribuirPessoa(r.Context(), db, tenantID, id, corpo.Pessoa)
		} else {
			err = marcarStatusArquivo(r.Context(), db, tenantID, id, corpo.Status)
		}
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
