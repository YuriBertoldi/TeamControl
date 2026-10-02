# Frontend — TeamControl

React 19 + StyleX + [Astryx](https://www.npmjs.com/package/@astryxdesign/core),
com Vite. **18 rotas** no menu, cada uma num chunk próprio carregado sob
demanda, mais duas telas que não são rota: o perfil do liderado (abre como
camada por cima da rota atual) e o PDI (fora do menu a pedido — a rota está
comentada em `Shell.tsx`, voltar é descomentar).

O contexto do sistema inteiro está no [README da raiz](../README.md). Aqui é só
o que importa para mexer no frontend.

```bash
npm install
npm run dev          # http://localhost:5180
npm test             # 129 testes (Vitest)
npm run test:watch
npm run build        # tsc -b && vite build
npm run lint         # oxlint
```

---

## Onde as coisas estão

```
src/
├── app/           frame, navegação e blocos visuais reusados por 2+ telas
│   ├── Shell.tsx          AppShell + SideNav + rotas + perfil como camada
│   ├── navegacao.tsx      contexto: ir(rota) e abrirPessoa(slug)
│   ├── ui.tsx             Page, Stats, Filtros, BarraCadeiras, cores
│   ├── times.tsx          legenda, treemap e blocos de tribo/squad
│   ├── ListaDetalhe.tsx   o padrão lista + painel de detalhe
│   └── SeletorCiclo.tsx   cabeçalho comum do módulo Ciclo
├── data/          REGRA DE DOMÍNIO — é aqui que mora o que é testado
├── pages/         uma tela por rota, sem regra de negócio dentro
├── themes/        tema escuro (tokens) + o degradê de fundo
└── config.ts      precedência tela > env > padrão
scripts/           geradores de dados a partir das fontes reais
```

**Tela não decide nada.** Se você está escrevendo um `if` de negócio dentro de
um `.tsx`, ele pertence a `src/data/` — e lá ele é testável. É por isso que 129
testes cobrem o comportamento sem montar um único componente.

---

## Astryx — o que mais pega

Regras completas em [`.claude/CLAUDE.md`](.claude/CLAUDE.md).

| Regra | Por quê |
|---|---|
| **Sem `<div>`** | Layout é `VStack` / `HStack` / `Grid` |
| **Sem `style={{}}`**, sem `xstyle` | Fora dos tokens, o tema não se aplica |
| `Text` usa `type`, não `variant` | `"body"` · `"label"` · `"supporting"` |
| Dados densos são linhas (`List`/`ListItem`) | Nunca item de lista dentro de `Card` |
| Status é `StatusDot` **com rótulo** | Nunca cor sozinha |
| `Badge` só para contagem | Metadado e categoria usam `Token` |

Imports que costumam errar:

```ts
import { ListItem } from '@astryxdesign/core/List';          // não /ListItem
import { Tab } from '@astryxdesign/core/TabList';            // não /Tab
import { SideNavSection } from '@astryxdesign/core/SideNav';
import { SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
```

`Avatar` não tem `initials` (usa `name`). `Switch` usa `value`, não
`isSelected`. `Text` não aceita `width`. `padding={2.5}` é inválido.

Antes de adivinhar uma prop:

```bash
npx @astryxdesign/cli component <Nome> --dense
```

### Duas escalas de cor que não são a mesma

- **Família** do cargo → a barrinha à esquerda do nome e o quadrado do grupo
- **Nível** → a etiqueta à direita

Misturar apaga informação: fica impossível varrer a coluna da direita
procurando os júniores se cada família pinta o mesmo nível de outra cor.

Barra colorida sem `style` é um `Card` minúsculo com `variant`:

```tsx
<Card padding={0} variant={cor} width={3} height={18}>
  <Text type="supporting">{''}</Text>
</Card>
```

---

## Adicionar uma tela

1. `src/pages/MinhaTela.tsx` com `export default`
2. Em `src/app/Shell.tsx`:
   - `const MinhaTela = lazy(() => import('../pages/MinhaTela'));`
   - acrescentar `'minhatela'` ao tipo `RotaId`
   - acrescentar a entrada em `rotas` (id, label, grupo, ícone, render)
   - acrescentar em `PRECARGA` para o hover pré-carregar o chunk
3. `npm run build` para confirmar que o chunk saiu

Esquecer o `PRECARGA` não quebra nada — só faz o `Suspense` piscar no primeiro
clique.

---

## Dados gerados — não editar à mão

Dois arquivos em `src/data/` vêm de fontes reais:

| Arquivo | Gerador |
|---|---|
| `dnaInstrumento.ts` | `node scripts/gerar-dna.cjs <pasta do xlsx descompactado>` |
| `registros.ts` | `node scripts/gerar-registros.cjs <pasta registros-demo>` |

Os geradores **validam e abortam** em vez de produzir lixo: `gerar-dna.cjs`
falha se a distribuição por eixo não der 7/7/7 ou se não achar 8 perfis.

Detalhes em [`docs/dados.md`](../docs/dados.md).

---

## Testes

Vitest com ambiente `jsdom` — três módulos persistem em `localStorage`, e um
dublê escrito à mão esconderia justamente os erros de serialização.

O que vale testar, em ordem:

1. **Confidencialidade** (`insumo.test.ts`) — se quebra, vaza dado de pessoa
2. **Invariantes de dado gerado** — arquivo gerado muda sem erro de compilação
3. **Aritmética de data** — errar por um dia não quebra nada visivelmente
4. **Regras com exceção** — prioridade estrita, trava de equilíbrio, empate
5. **Degradação** — JSON corrompido, slug inexistente, lista vazia

O que **não** vale: renderizar componente Astryx. O design system já é testado;
o que quebra aqui é a regra, e a regra está em `src/data/`.

---

## Quando a tela fica branca

Console diz `does not provide an export named 'default'` num arquivo que
**compila**? É cache do Vite, não erro de código. Confirme com `npm run build`:
se o build passa, é cache.

```bash
rm -rf node_modules/.vite
```

Se a porta 5180 estiver presa (o processo sobrevive ao fim do terminal):

```bash
netstat -ano | grep ":5180" | grep LISTENING
taskkill //PID <pid> //F
```

---

## Antes de dizer que terminou

```bash
npm test && npm run build
```

E **abra no navegador**. Três bugs desta base só apareceram na tela — a matriz
toda vermelha, o menu recolhido vazio e o card de squad sem agrupamento.
Nenhum deles quebrava o build.
