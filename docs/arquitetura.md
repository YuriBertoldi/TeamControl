# Arquitetura

Decisões que o código não consegue explicar sozinho, e o motivo de cada uma.

---

## Modelo de dados

### Enums como `TEXT + CHECK`, não `CREATE TYPE`

`ALTER TYPE ... ADD VALUE` não pode rodar na mesma transação no PostgreSQL 16,
e as migrations rodam em transação. Com `CHECK`, acrescentar valor vira
`DROP CONSTRAINT / ADD CONSTRAINT` — transacional e reversível.

### Multi-tenant por FK composta

Toda tabela filha carrega `tenant_id` e usa
`FOREIGN KEY (squad_id, tenant_id) REFERENCES squads(id, tenant_id)`. Torna
impossível **no banco** pendurar uma pessoa de um tenant numa squad de outro —
não depende de nenhum `WHERE` estar certo.

### Elegibilidade ao ciclo é função, não coluna

```go
func (p Pessoa) Elegivel(corte string, mesesMinimos int) bool
```

Coluna congelaria o estado: quem completa 6 meses depois do corte entraria
"na mão". Como função, entra sozinho.

### Nível de skill é série temporal, não estado

`person_skill_assessments` nunca sofre `UPDATE`. Cada leitura é uma linha
nova, com `origem IN ('coordenador','autoavaliacao','llm_extracao','avd','par')`.
A evolução ao longo do tempo é o produto; o estado atual é uma view
`DISTINCT ON`.

### Constraint que amarra formato e confidencialidade

```sql
CHECK (
  (formato = 'compartilhavel'      AND confidencialidade = 'publico_liderado') OR
  (formato = 'privado_coordenador' AND confidencialidade IN ('privado_coordenador','restrito_saude')) OR
  ...
)
```

Impede o erro humano mais provável: salvar a Parte 2 marcada como pública.

### Registros nunca são sobrescritos

`meeting_records.versao` incrementa com `supersedes_id`. Idem `reports`. A
defesa que você levou à mesa precisa ser recuperável **exatamente** como
estava, não como ficou depois de você reler e ajustar.

---

## Ingestão

### Watcher por polling, não `fsnotify`

A pasta fica no Desktop e o app roda em Docker Desktop no Windows. O bind mount
passa por gRPC-FUSE, que **não propaga inotify de forma confiável** — `fsnotify`
não dispara ou dispara em rajada. Polling com hash a cada 30s é determinístico,
barato (centenas de arquivos, não milhões) e funciona igual nativo ou em container.

Efeito colateral bom: com o Google Drive para Desktop montando a pasta como
unidade local, o watcher a varre como qualquer outra — **integração com o Drive
sem OAuth**.

### Texto canônico imutável, e os offsets apontam para ele

Evidência aponta para `(meeting_source_id, char_start, char_end)` no texto
**normalizado**, nunca no arquivo bruto. Elimina offset quebrado por CRLF e BOM.

Reprocessar um PDF com outro extrator cria uma `meeting_sources` nova; as
evidências antigas continuam ancoradas na antiga. Daí
`UNIQUE(meeting_id, texto_sha256)` em vez de `UNIQUE(meeting_id, fonte)`.

Formato do texto canônico: `"MM:SS Falante: fala\n"`. **Mudar isso invalida
toda evidência já gravada** — há um teste travando o formato.

### Data: o conteúdo vence o nome

A data **sempre** vem de `Meeting started:`. O nome do arquivo vai para
`meetings.data_arquivo` e serve como auditoria. Há pelo menos dois casos reais
de divergência:

- `17-08-25 - NOME...` — o nome diz 2025, o conteúdo diz 2026
- `29-09-26 - NOME ... 2026_09_25` — nome 29/09, conteúdo 25/09

Divergência não bloqueia: liga `tem_divergencia_data` e vira revisão manual.

> **Gap conhecido:** a data do conteúdo só é extraída para `.txt` do Tactiq.
> O caso do Eduardo (PDF do Gemini) passa batido. Está em `PENDENCIAS.md`.

### Idempotência em três camadas

1. `source_files(tenant_id, sha256)` — reimportar byte-idêntico é no-op
2. `meetings(tenant_id, person_id, data, tipo)` — Tactiq e PDF da mesma 1:1
   viram **duas sources da mesma meeting**
3. `action_items`/`feedbacks` com `hash_dedupe` — reprocessar o `.md` não duplica

Detectar INSERT de UPDATE usa `RETURNING id, (xmax <> 0)`: `xmax = 0` significa
inserção. É como o Postgres deixa distinguir arquivo novo de já conhecido sem
um `SELECT` a mais.

---

## Fronteira entre Go e Claude Code

| Tarefa | Onde | Por quê |
|---|---|---|
| **Geração narrativa** (registro de 1:1, defesa, devolutiva) | Claude Code, skill `registro-1-1` | O prompt tem 162 linhas de política editorial em calibração contínua. Reimplementar em Go cria duas cópias que divergem no primeiro ajuste |
| **Extração estruturada** (evidências com offset, skills, action items) | Go, `internal/llm` | Precisa rodar em lote sobre a pasta inteira sem humano no loop, com JSON validável e transação. Não cabe em fluxo interativo |

O Go não reimplementa o prompt de narrativa. Reimplementa só o que o Claude
Code faz mal: lote determinístico com saída tipada.

### Validação anti-alucinação é código, não a IA se auditando

Antes de gravar, o Go confere que `trecho_literal` existe de fato no texto
canônico na janela `[char_start, char_end]`. Se não, tenta reancorar por busca
literal; se falhar, **descarta a evidência**. Só evidência com
`trecho_verificado = TRUE` entra em context pack ou relatório.

---

## Frontend

### O perfil da pessoa é camada, não rota

`Shell.tsx` guarda `pessoa: string | null` por cima de `rota`. Você abre o
perfil do Diego a partir do Painel, fecha, e volta para o Painel exatamente
onde estava. Como rota, voltar exigiria reconstruir de onde se veio — e a
navegação para o perfil nasce de seis telas.

### Ciclo selecionado mora fora do React

AVD, Calibragem, Radar e Relatórios são rotas separadas com `lazy`. Estado
local por tela significaria trocar o ciclo quatro vezes — ou pior, olhar a
calibragem de 2026 achando que é a de 2027. `cicloSelecionado()` lê do
`localStorage`, e todas as telas concordam.

### Duas escalas de cor que não são a mesma

- **Família** → a barrinha à esquerda do nome e o quadrado do grupo
- **Nível** → a etiqueta da direita

Misturar apaga informação: fica impossível varrer a coluna da direita
procurando os júniores se cada família pinta o mesmo nível de outra cor.

### Dados vivem em `src/data/`, telas não decidem nada

Toda regra testável está em `src/data/`. As telas em `src/pages/` compõem
Astryx e chamam funções. É por isso que 129 testes cobrem o comportamento sem
montar um único componente.

---

## O que foi descartado, e por quê

| Descartado | Motivo |
|---|---|
| `unipdf` | Licença comercial paga |
| `go-fitz` | AGPL + cgo quebra o build estático |
| `pdfcpu` | Extrai páginas e imagens, não texto limpo |
| `@astryxdesign/charts` | Publicado como `0.0.0-bootstrap.0` — é placeholder. Gráficos seguem em Chart.js |
| Login programático na portal de avaliação | Guardar senha corporativa num app local é risco injustificável; quebra a cada mudança de front; esbarra em MFA |
| MBTI, DISC, eneagrama | Confiabilidade teste-reteste fraca; rotula em vez de descrever; não é acionável; e tipo de personalidade ao lado de nota de desempenho é viés com verniz de dado |
| `fsnotify` como padrão | Bind mount do Docker no Windows não propaga inotify |
