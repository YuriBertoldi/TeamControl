# TeamControl

Sistema local de gestão e desenvolvimento de time, para quem coordena pessoas
de engenharia e precisa sustentar 1:1, feedback, PDI e avaliação de desempenho
com evidência, não com memória.

Nasceu de um problema concreto: a operação de gestão costuma viver em arquivos
soltos numa pasta — transcrições de conversa, registros processados, dossiês,
rascunhos de avaliação. Sem índice, sem visão cruzada, sem como responder
"o que eu prometi e não entreguei" ou "o que conversamos nos últimos seis
meses".

> **Ideia central:** você não escreve documentos, você acumula **evidências
> datadas com fonte**. Justificativa de avaliação, defesa de calibragem,
> feedback, nota de skill e marco de PDI são todos projeções da mesma base.

> **O sistema sobe vazio.** Nenhum dado de exemplo, nem fictício. Você cadastra
> o seu time e aponta a sua pasta; o que ainda falta aparece como pendência nas
> telas, em vez de ficar escondido atrás de um seed de mentira.

---

## Como rodar

```bash
# Aponte a sua pasta de registros. O compose vive em api/, não na raiz.
cd api
cp .env.example .env        # edite PASTA_REGISTROS

# Sobe Postgres, API e interface. As migrations rodam sozinhas na subida.
docker compose up -d --build
# → http://localhost:5180

# Carga da pasta, em duas passadas:
#   -seed      cataloga QUE o arquivo existe (idempotente por sha256)
#   -processar lê o conteúdo e cria reunião, registro, encaminhamento e AVD
docker compose exec api /bin/api -seed /data/registros -dry-run
docker compose exec api /bin/api -seed /data/registros
docker compose exec api /bin/api -processar /data/registros
```

### Mexendo na interface

O container serve o bundle já compilado, que não recarrega sozinho. Para
desenvolver, use o servidor do Vite na mesma porta:

```bash
docker compose stop web     # os dois disputam a 5180
cd ../web && npm install && npm run dev
```

> A URL da API entra no bundle em tempo de **build** — o Vite substitui
> `import.meta.env` ali. Trocar `VITE_API` exige `docker compose build web`;
> mexer em variável de ambiente do container não tem efeito.

### Subir junto com a máquina

Os três serviços têm `restart: unless-stopped`, então voltam sozinhos **assim
que o motor do Docker sobe**. Essa é a metade fácil, e sozinha ela não basta:
se o Docker Desktop não iniciar com o Windows, não há motor para restaurar
container nenhum e o sistema simplesmente não está lá.

Por isso são duas peças, e a segunda é a que costuma faltar:

1. `restart: unless-stopped` no `docker-compose.yml` — já versionado.
2. Um atalho para `Docker Desktop.exe` em `shell:startup` (cole isso no
   Executar do Windows para abrir a pasta). O `AutoStart` do próprio Docker
   Desktop serve igual; o atalho só não depende de uma caixinha de
   configuração que uma atualização pode desmarcar.

`unless-stopped` e não `always` de propósito: parar um container de propósito
deve mantê-lo parado. `always` o ressuscitaria no próximo boot, ignorando a
sua decisão.

Para testar sem reiniciar a máquina, **não use `docker kill`** — o Docker
trata isso como parada explícita e, corretamente, não reinicia nada, o que faz
o teste passar por falha. O teste válido é derrubar o motor e levantá-lo de
novo:

```bash
taskkill //F //IM "Docker Desktop.exe" && wsl --shutdown
"/c/Program Files/Docker/Docker/Docker Desktop.exe" &
docker ps    # os três voltam sozinhos em ~10s
```

### Verificação

```bash
cd api && go test ./... && go vet ./...
cd web && npm test && npm run build
```

O `-seed` é **idempotente**: rodar duas vezes não duplica nada — a segunda
execução informa quantos arquivos já eram conhecidos.

A pasta entra no container **somente leitura**: a ingestão lê e nunca escreve.
O Postgres escuta em `127.0.0.1:55432` e não publica porta para fora da
máquina — dado de avaliação e risco de retenção não sai daqui.

> **O dado vive no banco, não no repositório.** Os módulos de `web/src/data/`
> são catálogo e tipo; o acervo de verdade entra pela ingestão e fica no
> Postgres, num volume local. O `.env` que aponta a sua pasta não é versionado.

---

## Arquitetura

Dois runtimes: um binário Go que só fala JSON, e um frontend React servido
estaticamente.

```
teamcontrol/
├── api/                      Go 1.24, net/http, PostgreSQL 16
│   ├── cmd/api/              binário: -migrate, -seed, -dry-run, -porta
│   └── internal/
│       ├── models/           tipos + Confidencialidade + Audiencia + Scope
│       ├── store/            migrations v1..v6 + queries
│       ├── ingest/           parsers Tactiq/PDF/MD, seed, resolução de pessoa
│       └── api/              handlers JSON
├── web/                      React 19 + StyleX + Astryx, Vite
│   ├── src/app/              frame, navegação e blocos visuais reusáveis
│   ├── src/data/             domínio e regras (é onde mora a lógica testada)
│   ├── src/pages/            uma tela por rota, carregadas com lazy
│   └── scripts/              geradores de dado a partir da sua pasta
└── docs/                     decisões que o código não consegue explicar
```

**Por que o frontend não é SSR** como o projeto de referência: Astryx (React 19)
foi adotado pelos ~150 componentes prontos. O custo assumido é um passo de
build e dois runtimes. A paridade com a referência vale só para o backend.

---

## Documentação

| Documento | Para quê |
|---|---|
| [docs/confidencialidade.md](docs/confidencialidade.md) | **Leia primeiro.** A regra que impede vazamento de dado de pessoa |
| [docs/arquitetura.md](docs/arquitetura.md) | Decisões estruturais e os porquês |
| [docs/dados.md](docs/dados.md) | De onde vem cada dado e como popular o sistema |
| [docs/desenvolvimento.md](docs/desenvolvimento.md) | Convenções, Astryx, testes, como adicionar tela |
| [web/PENDENCIAS.md](web/PENDENCIAS.md) | O que está em aberto, em ordem |

---

## O que o sistema faz

**Dia a dia** — painel por tribo e squad, pessoas, preparação de 1:1 com motor
de pauta, registros de conversa e board de compromissos.

**Desenvolvimento** — DNA motivacional (instrumento de 21 pares de escolha
forçada), matriz de skills por cargo com gap contra o esperado da cadeira,
trilha QA → Dev.

**Ciclo** — ciclos de avaliação cadastráveis (escala, faixas e drivers são dado
do ciclo, não constante no código), 9-box, calibragem, radar de alertas e
relatórios com evidência rastreável.

**Operação** — importação da pasta monitorada, cadastros e configuração.

---

## O que o sistema deliberadamente NÃO faz

Decisões, não limitações:

1. **Score único de pessoa.** Agrega coisas incomensuráveis, parece objetivo, e
   acaba citado em decisão de desligamento. O 9-box já é a compressão máxima
   tolerável, e tem o mérito de ser bidimensional e exigir justificativa.
2. **Análise de sentimento.** Frágil com ruído de transcrição, eticamente
   pesada, e a ação que sugere é "converse com a pessoa" — que você já ia fazer.
3. **Ranking entre pessoas.** Destrói a mentoria cruzada de que o time depende.
4. **Probabilidade de saída.** Falso positivo envenena a relação, falso negativo
   dá falsa segurança, e vazar é catastrófico. Alerta qualitativo com evidência
   declarada entrega o valor sem o risco.
5. **Métricas de produtividade individual.** Goodhart garantido, e injusto
   quando uma pessoa toca legado e outra escreve serviço novo.
6. **IA que escreve a nota da avaliação.** A direção é sempre **nota → texto**.
   Na mesa você precisa acreditar no que defende, e acreditar exige ter julgado.
7. **Substituir o sistema oficial de RH.** Ele segue sendo a fonte da verdade
   corporativa; a integração é somente leitura e nenhum método de escrita
   existe no código.

---

## Privacidade

Este repositório contém **apenas o projeto** — nenhum dado de pessoa. Os
módulos de domínio nascem vazios e o `.gitignore` bloqueia pastas de registros,
dossiês, rascunhos, `.xlsx` e `.pdf`.

Se você usar o sistema, **o seu banco e a sua pasta de registros passam a ter
dado sensível de RH**: nome, avaliação, remuneração e, eventualmente, relato de
saúde. Mantenha os dois fora de qualquer repositório e leia
[docs/confidencialidade.md](docs/confidencialidade.md) antes de exportar
qualquer coisa.
