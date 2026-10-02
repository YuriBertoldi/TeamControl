# Desenvolvimento

Como mexer no projeto sem quebrar o que já funciona.

---

## Comandos

```bash
# Frontend
cd web
npm run dev         # http://localhost:5180
npm test            # 129 testes
npm run test:watch
npm run build       # tsc -b && vite build — roda ANTES de dizer que terminou
npm run lint

# Backend
cd api
go test ./...
go vet ./...
go build ./...
go run ./cmd/api -migrate
go run ./cmd/api -seed "<pasta>" -dry-run
```

> **O dev server do Vite guarda módulo antigo em cache.** Se a tela ficar
> branca e o console disser `does not provide an export named 'default'` num
> arquivo que compila, é cache: `rm -rf node_modules/.vite` e suba de novo. Se
> a porta estiver presa, `netstat -ano | grep :5180` e mate o PID — o processo
> sobrevive ao fim do terminal.

---

## Regras do Astryx

As completas estão em `web/.claude/CLAUDE.md`. As que mais pegam:

| Regra | Por quê |
|---|---|
| **Sem `<div>`** | Layout é `VStack` / `HStack` / `Grid` |
| **Sem `style={{}}`** e sem `xstyle` | Fora dos tokens, o tema não se aplica |
| `Text` usa `type`, não `variant` | `type="body" \| "label" \| "supporting"` |
| Dados densos são **linhas** (`List`/`ListItem`) | Nunca item de lista embrulhado em `Card` |
| Status é `StatusDot` **com rótulo** | Nunca cor sozinha |
| `Badge` é só contagem | Metadado e categoria usam `Token` |

Armadilhas de import que o typecheck pega, mas custam tempo:

```ts
import { ListItem } from '@astryxdesign/core/List';          // não /ListItem
import { Tab } from '@astryxdesign/core/TabList';            // não /Tab
import { SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { SideNavSection } from '@astryxdesign/core/SideNav';
```

`Avatar` não tem `initials` (usa `name`). `Switch` usa `value`, não
`isSelected`. `Text` não aceita `width`. `padding={2.5}` é inválido.

Para descobrir a API real em vez de adivinhar:

```bash
npx @astryxdesign/cli component <Nome> --dense
```

### Cor de barra colorida sem `style`

Barra e quadradinho de cor são `Card` minúsculos com `variant`:

```tsx
<Card padding={0} variant={cor} width={3} height={18}>
  <Text type="supporting">{''}</Text>
</Card>
```

É o padrão usado em `BarraCadeiras` e em `src/app/times.tsx`.

---

## Onde colocar código novo

| Tipo | Lugar |
|---|---|
| Regra de domínio, cálculo, filtro | `web/src/data/` — **é aqui que vai o teste** |
| Bloco visual usado por 2+ telas | `web/src/app/` |
| Tela | `web/src/pages/` — uma por rota, sem regra dentro |
| Persistência, migration, parser | `api/internal/` |

Tela não decide nada. Se você está escrevendo um `if` de negócio dentro de um
`.tsx`, ele provavelmente pertence a `src/data/` — e lá ele é testável.

---

## Adicionar uma tela

1. Criar `web/src/pages/MinhaTela.tsx` com `export default`
2. Em `web/src/app/Shell.tsx`:
   - `const MinhaTela = lazy(() => import('../pages/MinhaTela'));`
   - acrescentar `'minhatela'` ao tipo `RotaId`
   - acrescentar a entrada em `rotas` (id, label, grupo, ícone, render)
   - acrescentar em `PRECARGA` para o hover pré-carregar o chunk
3. `npm run build` para confirmar que o chunk saiu

Cada rota é um chunk. Esquecer o `PRECARGA` não quebra nada — só faz o
`Suspense` piscar no primeiro clique.

---

## Escrever teste

Ferramenta: **Vitest** com ambiente `jsdom` (três módulos usam `localStorage`;
um dublê escrito à mão esconderia justamente os erros de serialização).

O que vale testar, em ordem:

1. **Confidencialidade** — se quebra, vaza dado de pessoa
2. **Invariantes de dado gerado** — arquivo gerado muda sem erro de compilação
3. **Aritmética de data** — errar por um dia não quebra nada visivelmente
4. **Regras com exceção** (prioridade estrita, trava de equilíbrio, empate)
5. **Degradação** — JSON corrompido, slug inexistente, lista vazia

O que **não** vale: renderização de componente Astryx. O design system já é
testado; o que quebra aqui é a regra, e a regra está em `src/data/`.

Padrão de nome de teste: descreve o comportamento e o custo de perdê-lo.

```ts
it('nunca corta item de prioridade alta para caber a trava', ...)
it('Scope{} não vale — o zero value viraria acesso irrestrito', ...)
```

### Dois bugs reais que os testes acharam

Vale como calibragem do que procurar:

- `senioriza()` só limitava o teto, então o QA Júnior ficava com "nível
  esperado 0" — e a matriz marcava como atingido quem nunca tinha encostado
  no assunto.
- `montarPauta()` calculava `fora` a partir de `resto`, que exclui as escutas.
  Uma escuta aberta que não coubesse **sumia**: nem na pauta, nem em "ficou de
  fora". O item que mais precisa aparecer quando falta tempo era o que
  desaparecia em silêncio.

---

## Convenções de escrita

- **Tudo em português**, incluindo nome de função, variável e comentário. O
  domínio é em português; traduzir só para o código cria um dicionário mental.
- **Comentário explica o porquê, não o quê.** Se o comentário descreve o que a
  linha faz, apague o comentário ou melhore o nome.
- **Comentário de topo em todo módulo não trivial**, dizendo que decisão ele
  carrega. É o que torna o código legível seis meses depois.
- **Commit em pt-BR.**

---

## Antes de dizer que terminou

```bash
cd web && npm test && npm run build
cd api && go test ./... && go vet ./...
```

E, se mexeu em tela: **abra no navegador**. Três bugs desta base só apareceram
na tela — a matriz toda vermelha, o menu recolhido vazio e o card de squad sem
agrupamento. Nenhum deles quebrava o build.
