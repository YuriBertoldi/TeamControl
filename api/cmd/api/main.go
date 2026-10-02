// Comando api — servidor HTTP JSON do TeamControl.
//
// Flags:
//
//	-migrate   aplica as migrations e sai (útil em CI)
//	-seed DIR  faz a carga inicial a partir da pasta de registros
//	-dry-run   com -seed, só mostra o que faria
package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"teamcontrol/internal/api"
	"teamcontrol/internal/ingest"
	"teamcontrol/internal/store"
)

func main() {
	var (
		soMigrar  = flag.Bool("migrate", false, "aplica as migrations e sai")
		seedDir   = flag.String("seed", "", "pasta de registros para a carga inicial")
		procDir   = flag.String("processar", "", "pasta de registros para processar o conteúdo")
		dryRun    = flag.Bool("dry-run", false, "com -seed, não grava nada")
		porta     = flag.String("porta", env("PORTA", "8080"), "porta HTTP")
	)
	flag.Parse()

	db, err := store.NewDB()
	if err != nil {
		log.Fatalf("banco: %v", err)
	}
	defer db.Close()

	if err := store.RunMigrations(db); err != nil {
		log.Fatalf("migrations: %v", err)
	}
	if *soMigrar {
		log.Println("migrations aplicadas")
		return
	}

	tenantID, userID, err := store.EnsureTenant(db, "padrao", "Coordenação",
		env("COORDENADOR_EMAIL", "coordenacao@exemplo.com"))
	if err != nil {
		log.Fatalf("tenant: %v", err)
	}
	log.Printf("tenant %d · usuário %d", tenantID, userID)

	if *seedDir != "" {
		rel, err := ingest.Seed(db, tenantID, *seedDir, *dryRun)
		if err != nil {
			log.Fatalf("seed: %v", err)
		}
		log.Print(rel.Resumo())
		if *dryRun {
			log.Println("dry-run: nada foi gravado")
		}
		return
	}

	// -processar roda DEPOIS do -seed: o seed registra que o arquivo existe,
	// isto lê o conteúdo. Separados porque a varredura é barata e repetível,
	// e o processamento depende de o cadastro de pessoas já estar no lugar —
	// sem pessoa cadastrada, toda transcrição cairia em revisão manual.
	if *procDir != "" {
		rel, err := ingest.Processar(db, tenantID, *procDir,
			env("COORDENADOR_NOME", "Yuri Bulhões Bertoldi"))
		if err != nil {
			log.Fatalf("processar: %v", err)
		}
		log.Print(rel.Resumo())
		return
	}

	srv := &http.Server{
		Addr:              ":" + *porta,
		Handler:           api.Rotas(db, tenantID, userID),
		ReadHeaderTimeout: 10 * time.Second,
		WriteTimeout:      60 * time.Second,
	}

	// Encerramento limpo: requisição em voo termina antes de o processo sair.
	go func() {
		log.Printf("TeamControl ouvindo em http://localhost:%s", *porta)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("servidor: %v", err)
		}
	}()

	parar := make(chan os.Signal, 1)
	signal.Notify(parar, os.Interrupt, syscall.SIGTERM)
	<-parar

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Printf("encerramento forçado: %v", err)
	}
	log.Println("encerrado")
}

func env(chave, padrao string) string {
	if v := os.Getenv(chave); v != "" {
		return v
	}
	return padrao
}
