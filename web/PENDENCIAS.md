# Pendências — TeamControl

Lista viva. Ordem = ordem de execução acordada. Marcar ao concluir.

> **Infraestrutura de projeto entregue em 01/10/2026:** 129 testes no
> frontend (Vitest) e suíte Go para confidencialidade e parsers;
> documentação em `docs/`; `CLAUDE.md`, 3 agentes e 2 skills em `.claude/`.
> Dois bugs reais e duas erosões de segurança foram corrigidos no caminho —
> ver "Achados que viraram decisão".

---

## Fila atual — pedidos desta rodada

Em ordem, do que está sendo feito para o que falta começar.

- [x] **1. DNA motivacional** — não existia no sistema.
      Instrumento extraído da sua planilha (`DNA MOTIVACIONAL_Modelo.xlsx`):
      21 pares de escolha forçada, 3 eixos, 8 perfis.
      - [x] `scripts/gerar-dna.cjs` → `src/data/dnaInstrumento.ts`
      - [x] Apuração, persistência e histórico (`src/data/dna.ts`)
      - [x] Questionário de 21 pares + importação dos 6 totais da planilha
      - [x] Aba DNA no perfil da pessoa, com eixos, motivadores e conduta
      - [x] **Tela de DNA do time** — distribuição por eixo com leitura
            acionável, referência dos 8 perfis e quem ainda não respondeu
- [x] **2. Seletor de ciclo na tela de AVD** — abria fixa no vigente e não
      deixava olhar para trás nem para o planejado. Avaliações agora carregam
      `ciclo`, e drivers/escala/faixas vêm do ciclo escolhido.
- [x] **3. Registros de 1:1 e feedbacks** — não tinham superfície nenhuma.
      Índice gerado dos 28 `.md` reais (`scripts/gerar-registros.cjs`), com
      timeline por pessoa, confidencialidade por parte e banco de feedbacks.
- [x] **4. Filtros nos registros de 1:1** — busca por pessoa e por tema, filtro
      por situação (sem registro, fora da cadência, com encaminhamento meu).
- [x] **5. Perfil completo do liderado** — clicar na pessoa no Painel, em
      Pessoas ou em Registros abre uma visão única com 6 abas: visão geral,
      DNA motivacional, 1:1 e feedbacks, skills, AVD, PDI e trilha.
- [x] **6. Filtros alinhados em todas as telas** — a barra centralizava
      verticalmente, e controle com rótulo é mais alto que controle sem.
      Passou a alinhar pela base, com a contagem de resultado fixa à direita e
      rótulo visível em todos os campos.
- [x] **7. Salário** — campo em Pessoas e no quadro central da pessoa.
      - [x] Modelo (`salario`, `ultimoReajuste`, `faixaSalarial`) como
            confidencialidade 3: não sai em relatório, export nem pacote de IA
      - [x] Bloco no perfil, oculto por padrão, com alerta acima de 12 meses
            sem reajuste
      - [x] **Campos no Cadastro de pessoas** (valor, faixa, último reajuste)
- [x] **8. Perfil e descrição gerados das respostas do DNA.** A leitura é
      montada da margem de cada eixo: diz de que lado caiu, com que firmeza
      (empate / fraca / clara / forte), o que é traço que não vale contrariar,
      o que é preferência frouxa a confirmar na conversa, e a tensão quando
      dois eixos puxam para lados diferentes. Vale igual no questionário e
      **na importação por totais** — e aparece ANTES de salvar, para conferir
      contra a planilha de origem.
- [x] **9. Painel na linguagem do artefato (revisado)** — avatar com iniciais, contagem
      grande no canto, linha "N QA sob coordenação de desenvolvimento", barra
      segmentada com uma cadeira por pessoa (sênior à esquerda) e etiqueta de
      senioridade alinhada à direita, com "QA em dev" em laranja.
      **Revisado** depois de conseguir abrir a aba inicial do artefato: o painel
      foi reconstruído com a estrutura de lá — legenda família × nível que
      também é filtro, legenda de marcadores, chips de tribo, estatísticas
      inline, treemap de tribos → squads e uma seção por tribo com barra de
      cadeiras e cards de squad. Os blocos ficaram em `src/app/times.tsx` para
      o Painel e a Visão de times não divergirem.
- [x] **10. Menu recolhido mantém os ícones.** As rotas estavam aninhadas
      dentro de um item-pai sem ícone, e o que some ao recolher são os filhos —
      a trilha ficava vazia. Passaram a ser `SideNavSection`, com cada rota no
      nível raiz. Validado: 18 ícones na trilha recolhida.

> Os cliques não entram no iframe do artefato (cross-origin). Consegui ver a
> aba inicial **"Visão de times"** recarregando a URL, que é o que o painel
> agora replica. As abas "Quadro", "Pessoas", "Épicos" e "Composição"
> continuam inacessíveis — se alguma delas for a referência, me diga qual.

- [ ] **11. Importar DNA e skills por planilha, e exportar o modelo.**
      Hoje o DNA entra por questionário ou pelos 6 totais digitados, e skills
      não entram por planilha nenhuma. Falta: upload de `.xlsx`/`.csv` para os
      dois, e um botão que baixa a planilha-modelo já no formato certo — sem o
      modelo, cada pessoa devolve um arquivo diferente e a importação vira
      trabalho manual.
- [ ] **12. Visão de times × Painel estão sobrepostos.** Depois da reconstrução,
      as duas telas mostram o mesmo recorte. Sugiro o Painel como visão geral e
      a Visão de times como a tela de edição de estrutura (a aba "Estrutura"
      que já existe lá), mas é decisão sua — não removi nada.

---

## Pendências anteriores que seguem abertas

- [x] **Frontend ligado ao backend.**  + :
      na subida,  busca pessoas, tribos e squads da API e preenche
      o cache; as telas seguem lendo de forma síncrona. Gravação vai para o
      cache e para o banco. Sem API, o sistema abre com o último estado
      conhecido — e avisa no console quando uma gravação não chegou ao
      Postgres, em vez de fingir que persistiu.
      - [ ] Falta levar para a API: cargos, ciclos de AVD, DNA, avaliações,
            compromissos e o acervo de registros. Hoje esses ainda vivem só no
            navegador.
- [ ] **Importador de `.xlsx` do DNA no backend.** Hoje a importação é por
      digitação dos 6 totais. O backend já monta a pasta; ler a planilha de
      cada pessoa direto do Drive elimina o passo manual.
- [ ] **Data do conteúdo nos PDFs do Gemini.** A divergência do Eduardo
      (nome 29/09 × conteúdo 25/09) não é detectada: a extração de data do
      conteúdo só roda para `.txt` do Tactiq.
- [ ] **Enquadramento por driver para a portal de avaliação.** O insumo das perguntas
      abertas está pronto. Falta propor **faixa por driver** com as evidências
      que a sustentam — a nota continua sendo digitada por você.
- [ ] **Entrada de avaliação de skills.** A matriz existe e já separa "sem
      avaliação" de "abaixo da cadeira", mas falta a tela de lançamento em
      lote — hoje só dá para preencher pessoa a pessoa.
- [ ] **Autoavaliação de skills.** Falta o caminho de entrada — planilha por
      pessoa, como o DNA, ou tela de condução aberta durante a 1:1.
- [ ] **Prazo vago para data.** Encaminhamento anotado como "próximas
      semanas" nunca vira data computável, e sem data o board não responde
      "o que venceu hoje". A conversão precisa acontecer na curadoria do
      pós-1:1.

---

## Concluído antes desta rodada

### Cadastros
- [x] Pessoas: adicionar, editar, afastar com motivo e retorno, fora da gestão,
      desligar. Nada apaga; tudo é status.
- [x] Tribos: nome, produto, cor, id da portal de avaliação. `TriboId` virou string, e
      Painel, Pessoas e Visão de times passaram a iterar o cadastro.
- [x] Cargos: com as skills esperadas da cadeira e nível mínimo por skill.

### Matriz de skills
- [x] Separada por cargo; célula fora da cadeira vira "não se aplica".
- [x] Aba Cobertura da cadeira.
- [x] "Sem avaliação" separado de "abaixo da cadeira".

### Ciclos de AVD
- [x] CRUD de ciclo com escala, faixas, drivers, janela e data de corte.
- [x] Perguntas abertas, coladas como estão na portal de avaliação.
- [x] Gerar insumo para IA, com `ref_code`, contra-evidências obrigatórias e
      contagem do que foi omitido por confidencialidade.

### Outros
- [x] Status de pessoa como estrutura: ativo, afastado, fora da gestão e
      desligado. Nada é apagado.
- [x] Cadência de 1:1 em 60 dias, alerta derivado da configuração.
- [x] Paleta escura com o degradê radial de fundo.
- [x] Menu lateral com ícones, colapsável e redimensionável (validado na tela).
- [x] Tela Evolução do líder.
- [x] Etiqueta de cargo no Painel, na cor da família.
- [x] Seletor de liderado na Preparação de 1:1.
- [x] Code-splitting por rota.
- [x] Subtítulo de Pessoas passou a ser contado, não digitado.
- [x] Contagem do acervo derivada da varredura do backend, não digitada.
- [x] Backend Go + PostgreSQL verificado de ponta a ponta.

---

## Achados que viraram decisão

- **Planilha do DNA tem dois pares fora do eixo.** Nos pares 3 e 9 a afirmativa
  de recompensa externa está lançada na coluna de Estabilidade, não na de
  Exterioridade. Pelo conteúdo o polo é Exterioridade, e com a correção cada
  eixo fica com exatamente 7 pares (7+7+7=21) em vez de 7/8/6. Sem a correção,
  duas respostas sobre reconhecimento contaminam o eixo de necessidade e podem
  inverter a segunda letra do código. O sistema aplica a correção e registra o
  motivo em `dnaInstrumento.ts`.

- **`senioriza()` não tinha piso.** O QA Júnior ficava com "nível esperado 0"
  em Autoria de skills — e nível 0 é "sem contato". A matriz marcava como
  atingido quem nunca tinha encostado no assunto. Achado por teste.
- **A escuta aberta sumia da pauta.** `montarPauta()` montava a lista de
  "ficou de fora" a partir de `resto`, que exclui as escutas. Uma escuta que
  não coubesse no orçamento não entrava na pauta **nem** aparecia como
  excluída: o item que mais precisa aparecer quando falta tempo era o que
  desaparecia em silêncio. Achado por teste.
- **`FiltroSQL` não validava o Scope nem recusava pedido de saúde indevido.**
  O teto da audiência já barrava o nível 4 sozinho, então não havia vazamento —
  mas era segurança por coincidência: bastaria alguém acrescentar uma audiência
  com teto 4 para a flag passar a valer. Agora valida e recusa.
- **`ParseTactiq` aceitava arquivo que não é do Tactiq**, devolvendo uma
  transcrição vazia sem erro. Na prática o chamador guardava pelo tipo
  detectado, mas um chamador futuro gravaria reunião sem data — e a checagem de
  divergência entre data do nome e do conteúdo passaria a não fazer nada, em
  silêncio, justamente no caso que ela existe para pegar.
