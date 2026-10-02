---
name: subir-ambiente
description: Sobe o ambiente do TeamControl do zero — Postgres em Docker, migrations, seed da pasta real e os dois servidores. Use quando o ambiente estiver parado, quando a tela ficar branca, quando a porta estiver presa ou ao começar a trabalhar no projeto depois de um tempo.
---

# Subir o ambiente

## Banco

```bash
cd <projeto> && docker compose up -d
docker compose ps        # tem que ficar healthy
```

Postgres escuta em **127.0.0.1:55432**, não 5432. A 5432 cai na faixa reservada
pelo Hyper-V no Windows e falha com
`bind: An attempt was made to access a socket in a way forbidden by its access permissions`.

## Backend

```bash
cd api
go run ./cmd/api -migrate                 # 6 migrations, 32 tabelas
go run ./cmd/api -seed "<sua pasta de registros>" -dry-run
go run ./cmd/api -seed "<sua pasta de registros>"
go run ./cmd/api -porta 8080
```

`-migrate` rodado duas vezes é no-op. O seed é idempotente: a segunda
execução informa que todos os arquivos já eram conhecidos. Se ela inserir
alguma coisa, a idempotência quebrou — é bug, não comportamento.

## Frontend

```bash
cd web && npm install && npm run dev     # http://localhost:5180
```

## Quando a tela fica branca

Sintoma clássico: console diz
`does not provide an export named 'default'` num arquivo que **compila**.
É cache do Vite, não erro de código. Confirme com `npm run build` — se o build
passa, é cache.

```bash
cd web
rm -rf node_modules/.vite
```

Se a porta estiver presa (o processo sobrevive ao fim do terminal):

```bash
netstat -ano | grep ":5180" | grep LISTENING
taskkill //PID <pid> //F
```

Depois suba de novo.

## Verificação completa

```bash
cd web && npm test && npm run build
cd api && go test ./... && go vet ./...
```

Esperado: tudo verde no frontend e os pacotes `models` e `ingest` ok no
backend.

## Notas da máquina

- `python` é o stub da Microsoft Store (sai com código 49). Use Node.
- Os cliques não entram no iframe de artefato do claude.ai. Recarregar a URL
  cai na aba inicial; as outras abas não são alcançáveis por automação.
