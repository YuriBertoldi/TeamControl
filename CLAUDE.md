# TeamControl — instruções do projeto

Sistema local de gestão de time: 1:1, feedback, skills, PDI e ciclo de avaliação.
Backend Go + PostgreSQL, frontend React 19 + Astryx.

## Antes de qualquer coisa

1. **`docs/confidencialidade.md`** se for tocar em leitura de texto ou montagem
   de prompt. É a única regra cuja violação causa dano a uma pessoa.
2. **`web/.claude/CLAUDE.md`** se for mexer em tela. São as regras do Astryx.
3. **`web/PENDENCIAS.md`** para saber o que já está em fila.

## Regras não negociáveis

- **Português em tudo** — código, variável, comentário, commit. O domínio é em
  português; traduzir só o código cria um dicionário mental.
- **Nada é apagado.** Sair da gestão, afastar e desligar são mudanças de
  **status**. 1:1s, evidências e avaliações continuam valendo depois.
- **Nota → texto, nunca texto → nota.** A IA redige a justificativa a partir da
  nota que o coordenador digitou. Nunca propõe nota, quadrante ou Performance.
- **DNA motivacional e salário nunca entram em artefato de AVD.** Motivação e
  remuneração não são argumento de desempenho.
- **Dado de exemplo é dado real.** Os mocks vêm da pasta `registros-demo`, da
  planilha de DNA e do artefato de times. Não invente nome de pessoa — se
  precisar do roster, leia `web/src/data/pessoas.ts`.
- **Arquivos gerados não se editam à mão**: `dnaInstrumento.ts` e
  `registros.ts`. Rode o gerador em `web/scripts/`.

## Onde o código vive

| O quê | Onde |
|---|---|
| Regra de domínio (testável) | `web/src/data/` |
| Bloco visual reusado | `web/src/app/` |
| Tela (sem regra dentro) | `web/src/pages/` |
| Persistência, parser, migration | `api/internal/` |

Tela não decide nada. `if` de negócio dentro de `.tsx` pertence a `src/data/`.

## Verificação obrigatória

```bash
cd web && npm test && npm run build
cd api && go test ./... && go vet ./...
```

Se mexeu em tela, **abra no navegador**. Três bugs desta base só apareceram
visualmente e nenhum quebrava o build.

## Armadilhas conhecidas

- O dev server do Vite guarda módulo antigo: tela branca com
  `does not provide an export named 'default'` num arquivo que compila é cache.
  `rm -rf node_modules/.vite`, e mate o PID preso na porta 5180 se preciso.
- Postgres em **55432**, não 5432 (faixa reservada pelo Hyper-V no Windows).
- `python` nesta máquina é o stub da Microsoft Store. Use Node.
- Os cliques não entram no iframe de artefato do claude.ai (cross-origin).
  Recarregar a URL cai na aba inicial; as outras abas não são alcançáveis.

## Agentes disponíveis

| Agente | Quando |
|---|---|
| `auditor-confidencialidade` | Antes de liberar qualquer mudança que leia texto ou monte prompt |
| `revisor-teamcontrol` | Revisão de mudança no projeto |
| `feature-teamcontrol` | Implementar funcionalidade nova ponta a ponta |
