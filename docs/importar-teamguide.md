# Importar o resultado da AVD da TeamGuide

A TeamGuide é a fonte da verdade corporativa da avaliação. O TeamControl a
trata como **somente leitura**: nada neste repositório escreve lá.

O que a importação traz que os rascunhos locais não têm:

- **A autoavaliação.** O rascunho registra a leitura do líder; a nota que a
  pessoa deu a si mesma só existe na ferramenta. O gap entre as duas é o sinal
  — alguém que se dá 4 em todos os drivers contra 3 do líder não tem problema
  de nota, tem problema de alinhamento de expectativa.
- **As datas de admissão**, que decidem elegibilidade ao ciclo e que os dossiês
  trazem como "-" para boa parte do time.
- **Os comentários como foram lançados**, que podem ter sido editados depois
  do rascunho.

## Por que é um arquivo, e não uma chamada de rede

Não há credencial guardada no sistema. A coleta roda na **sua sessão já
autenticada** no navegador, e o resultado vira um arquivo na pasta de
registros — que a varredura lê como lê qualquer outro.

Guardar cookie de ferramenta de RH de terceiro num app local é risco sem
contrapartida: ele expira, o sync "passa" devolvendo HTML de login parseado
como JSON vazio, e o sistema conclui que ninguém tem avaliação nenhuma.

## Como gerar o arquivo

1. Abra `https://login.teamguide.app/` e faça login (o agente nunca digita
   credencial).
2. Descubra o ciclo:
   ```js
   await (await fetch('https://api.teamguide.app/perf-eval/assessments/managing',
     {credentials:'include'})).json()
   ```
   Procure o de status `EVALUATING`. Anote o `id`.
3. Com o `id` do ciclo, colete as avaliações `AS_LEADER` e, para cada uma, o
   resultado:
   ```
   GET /perf-eval/assessments/evaluations?assessment=<ID>
   GET /perf-eval/assessments/results/participants/<participant>
   ```
   > A rota `/evaluations/<participant>` só responde **dentro da janela de
   > avaliação**. Fechada a janela ela devolve
   > `Assessment is not in evaluation period.` — use a de `results`.

4. Em cada critério, o que importa:

   | campo | onde |
   |---|---|
   | eixo | `criterion.assessmentCriterion.nineBoxAxis` — `POTENTIAL` = comportamento, `PERF` = desempenho |
   | ordem no formulário | `criterion.assessmentCriterion.ord` (contador global, muda a cada ciclo) |
   | nota do líder | `leaderScore` |
   | nota da pessoa | `selfScore` |
   | autor do comentário | `comments[].employeeEvaluator.id` — **não** `evaluationType`, que vem nulo |

5. Grave como `AVD-<ano>/teamguide-<ciclo>.json` na pasta de registros, no
   formato que `internal/ingest/teamguide.go` espera, e rode a varredura.

## O que o importador faz

Enriquece o ciclo que os rascunhos criaram — não cria um paralelo. Vincula
`avd_cycles.teamguide_assessment_id`, cria a avaliação `tipo='auto'` ao lado da
`tipo='lider'`, e preenche data de admissão apenas onde estava vazia.

Comentário vazio na ferramenta **não apaga** o do rascunho: o rascunho costuma
ser mais longo e mais ancorado em fato.
