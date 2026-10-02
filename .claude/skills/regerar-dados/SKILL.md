---
name: regerar-dados
description: Regera os arquivos de dados do TeamControl a partir das fontes reais — o instrumento de DNA a partir da planilha .xlsx e o índice de registros de 1:1 a partir da pasta registros-demo. Use quando a planilha de DNA mudar, quando novos registros forem processados, ou quando as contagens na tela não baterem com a pasta.
---

# Regerar dados a partir das fontes reais

Dois arquivos em `web/src/data/` são **gerados**. Editá-los à mão funciona até
alguém rodar o gerador de novo.

| Arquivo | Gerador | Fonte |
|---|---|---|
| `dnaInstrumento.ts` | `scripts/gerar-dna.cjs` | `DNA MOTIVACIONAL_Modelo.xlsx` |
| `registros.ts` | `scripts/gerar-registros.cjs` | pasta `registros-demo/` |

## Instrumento de DNA

O `.xlsx` é um zip. Descompacte antes:

```bash
cd /tmp && rm -rf dna && mkdir dna && cd dna
unzip -o "<caminho>/DNA MOTIVACIONAL_Modelo.xlsx"
cd <projeto>/web && node scripts/gerar-dna.cjs /tmp/dna
```

Saída esperada:

```
ok: 21 pares ({"impulso":7,"necessidade":7,"premio":7}), 8 perfis
```

**Se a distribuição não der 7/7/7, o gerador aborta** — e isso é um achado, não
um erro a contornar. Significa que a planilha mudou de forma que muda o
resultado do instrumento. Investigue qual par saiu do eixo antes de mexer no
gerador.

Contexto: a planilha modelo tem os pares 3 e 9 com a afirmativa de recompensa
externa lançada na coluna de Estabilidade. O gerador corrige para
Exterioridade. Sem a correção a distribuição dá 7/8/6 e a segunda letra do
código pode inverter. Detalhes em `docs/dados.md`.

## Índice de registros

```bash
cd <projeto>/web
node scripts/gerar-registros.cjs "<sua pasta de registros>"
```

A saída resume o que foi indexado:

```
N registros de M pessoas
K feedback(s) avulso(s)
encaminhamentos: … · prazo vago: … · seus: …
omitidos: … · de saúde: … · mantidos no privado: …
```

Compare com a execução anterior antes de aceitar: registros novos sobem a
contagem; uma queda brusca costuma significar que o parser parou de reconhecer
uma seção, e aí o índice fica mentindo em silêncio.

## Depois de regerar

```bash
cd web && npm test && npm run build
```

Os testes de invariante (`dnaInstrumento.test.ts`) travam o formato. Se eles
quebrarem, a fonte mudou de um jeito que altera o significado — reporte antes
de ajustar o teste.

## Atualize o que depende

Se a contagem do acervo mudou, `web/src/data/mockOps.ts` tem `ACERVO` com os
números totais. Ele é conferido contra a varredura do backend:

```bash
cd api && go run ./cmd/api -seed "<pasta>" -dry-run
```
