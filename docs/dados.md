# De onde vem cada dado

O sistema sobe **vazio**. Nenhum dado de exemplo, nem fictício: roster de
mentira dá a impressão de sistema já configurado, obriga a apagar tudo antes do
primeiro uso e, pior, esconde o que ainda falta você fazer.

O que vem preenchido são os **catálogos** — a taxonomia de skills, os níveis da
trilha QA→Dev, os quadrantes do 9-box, os modelos de relatório, o instrumento
de DNA. Esses são conhecimento do produto, não dado de alguém: sem eles o
sistema não saberia o que é uma matriz de competência.

| | Nasce | Popula-se por |
|---|---|---|
| Pessoas, tribos, squads, cargos | vazio | Cadastros |
| Registros de 1:1 e feedbacks | vazio | `scripts/gerar-registros.cjs` |
| Avaliações, defesas, PDI, trilha | vazio | uso do sistema |
| DNA por pessoa | vazio | questionário ou importação de totais |
| Skills, drivers, trilha, 9-box, relatórios | **preenchido** | é catálogo |
| Ciclos de avaliação | 2 modelos | ajuste em Ciclos de AVD |

---

## Populando o acervo de 1:1

`scripts/gerar-registros.cjs` varre a sua pasta de registros e gera
`web/src/data/registros.ts` com o **índice** — nunca com o conteúdo.

```bash
cd web
node scripts/gerar-registros.cjs "<sua pasta de registros>"
```

O gerador espera `.md` nesta estrutura, que é a que o sistema modela:

```
# 1:1 — Nome — dd/mm/aaaa
**Coordenador:** / **Duração:** / **Fonte:** / **Tema:**

# Parte 1 — Registro compartilhável          → confidencialidade 1
  ## Resumo / Pontos discutidos / Feedback / Encaminhamentos / Para a próxima

# Parte 2 — Registro privado do coordenador  → confidencialidade 3

# Avaliação do 1:1                            → confidencialidade 2
  Performance / Impacto

# Omitido de propósito                        → tabela: Item | Onde | Motivo
```

**Só a Parte 1 é entregável à pessoa.**

O que entra no índice: data, duração, fonte, tema, contagem de encaminhamentos,
quantos têm prazo vago, quantos são seus, e a confidencialidade de cada parte.
O texto integral **não entra** — continua no arquivo e, no sistema final, vem
do banco com o filtro de audiência aplicado em SQL.

> O gerador também conta os itens de "Omitido de propósito" e separa os que são
> de saúde. A contagem circula; o conteúdo, nunca.

---

## O instrumento de DNA Motivacional

21 pares de escolha forçada sobre 3 eixos binários → 8 perfis. É o instrumento
de **Tamara Lowe**.

| Eixo | Polos | Letras |
|---|---|---|
| Impulso | Produção · Conexão | P · C |
| Necessidade | Estabilidade · Variedade | E · V |
| Prêmio | Interioridade · Exterioridade | I · E |

O código é **posicional**: a letra `E` significa Estabilidade na segunda
posição e Exterioridade na terceira. Por isso o código trabalha com nomes de
polo (`estabilidade`, `exterioridade`), nunca com as letras.

### Gerando a partir da sua planilha

`dnaInstrumento.ts` já vem com o instrumento. Se a sua planilha divergir,
regere — o `.xlsx` é um zip, descompacte antes:

```bash
cd /tmp && mkdir dna && cd dna && unzip "<caminho>/DNA MOTIVACIONAL.xlsx"
cd <projeto>/web && node scripts/gerar-dna.cjs /tmp/dna
```

Saída esperada:

```
ok: 21 pares ({"impulso":7,"necessidade":7,"premio":7}), 8 perfis
```

**O gerador aborta se a distribuição não der 7/7/7 ou se não achar 8 perfis.**
Isso é proteção, não chateação: um par lançado na coluna errada muda o
resultado do instrumento em silêncio.

### Uma correção que o gerador aplica

Em planilhas derivadas do modelo original, os **pares 3 e 9** costumam ter a
afirmativa de recompensa externa lançada na coluna de Estabilidade (D) em vez
de Exterioridade (E):

- par 3: *"Quero ser recompensado por meu excelente trabalho"*
- par 9: *"Sempre busquei um trabalho com potencial de sucesso financeiro e
  reconhecimento pessoal"*

Pelo conteúdo, ambas são Exterioridade. Com a correção cada eixo fica com
exatamente 7 pares; sem ela, duas respostas sobre reconhecimento contaminam o
eixo de necessidade e podem **inverter a segunda letra do código** — trocando o
perfil da pessoa sem avisar.

Um teste trava a correção
(`dnaInstrumento.test.ts > mantém a correção dos pares 3 e 9`).

### Duas entradas, ambas de primeira classe

1. **Questionário** — as 21 escolhas na tela, durante a 1:1
2. **Importação dos 6 totais** — a linha de soma da planilha

Fingir que só existe o questionário faria o sistema ser contornado no primeiro
uso: quem já respondeu na planilha não vai refazer 21 escolhas.

---

## Arquivos gerados — não editar à mão

| Arquivo | Gerador |
|---|---|
| `web/src/data/dnaInstrumento.ts` | `scripts/gerar-dna.cjs` |
| `web/src/data/registros.ts` | `scripts/gerar-registros.cjs` |

Editá-los funciona até alguém rodar o gerador de novo.

---

## Os buracos aparecem na tela

Nenhuma tela esconde dado faltante. "N pessoas sem registro de 1:1", "N sem
avaliação de skill" e "sem DNA registrado" aparecem como alerta, porque a
pendência é de gestão, não de software.

Uma distinção que o sistema faz questão de manter: **quem nunca foi avaliado
não está "abaixo do esperado"** — está sem avaliação, e essa pendência é do
coordenador, não da pessoa. Misturar as duas coisas cobraria de alguém uma
falha que não é dela.
