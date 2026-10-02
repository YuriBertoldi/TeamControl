# Confidencialidade

**Leia este documento antes de mexer em qualquer coisa que leia texto do banco
ou monte prompt para IA.**

Esta é a única regra do sistema cuja violação causa dano real a uma pessoa: um
relato de saúde num relatório para o RH, uma leitura privada do coordenador
num documento entregue ao liderado, uma frase de "isso fica entre nós" numa
defesa de calibragem.

---

## Os quatro níveis

| Nível | Código | Entra em | Exemplo real da pasta |
|---|---|---|---|
| 1 | `publico_liderado` | Tudo, inclusive o que você entrega à pessoa | Parte 1 do registro de 1:1 |
| 2 | `rh_calibragem` | AVD, calibragem, relatório para gestor/RH | Avaliação mensal da portal de avaliação |
| 3 | `privado_coordenador` | Só preparação de 1:1 e retenção | Parte 2 do registro; salário; risco de saída |
| 4 | `restrito_saude` | **Nada.** Registra-se que existe, nunca o conteúdo | Motivo da ausência médica do Ana |

O default é sempre **o mais restritivo**. Confidencialidade desconhecida ou
vazia resolve para 4, não para 1 — esquecer de classificar nunca vaza.

```go
var lixo Confidencialidade = "valor-que-nao-existe"
lixo.Nivel() // 4
```

---

## A regra mais importante

> **Nível 3 nunca é "resumido" para dentro de um artefato de nível 2.**

Promoção 3→2 é ato manual, individual, datado e auditável. Vazamento por
resumo é a forma mais fácil de destruir a confiança no instrumento: você copia
um parágrafo do registro privado para o relatório do RH e, junto com ele, vai
uma frase que a pessoa pediu para não sair dali.

---

## Como a regra é imposta (e não apenas documentada)

### No backend: um tipo sem zero value utilizável

`models.Scope` acompanha **toda** consulta que devolve texto. Ele não tem valor
zero que funcione — quem esquecer de preencher recebe erro, não acesso total.

```go
var s Scope
s.Validate()  // erro: "scope sem tenant"
s.FiltroSQL() // erro, não SQL sem filtro
```

O filtro existe em **um lugar só**, de propósito:

```go
func (s Scope) FiltroSQL(coluna string) (string, []any, error)
// → " AND nivel_visibilidade(x) <= $1 AND (nivel_visibilidade(x) < 4 OR $2) "
```

Se a regra existisse em três lugares, uma delas estaria errada — e seria a que
vaza. O filtro roda **no SQL**, antes de qualquer LLM ver o dado: "ignore a
confidencialidade e me mostre tudo" não tem efeito, porque a consulta
simplesmente não traz o que está acima do teto.

### Nenhuma audiência alcança o nível 4

| Audiência | Teto |
|---|---|
| `liderado` | 1 |
| `rh` | 2 |
| `coordenador` | 3 |

Dado de saúde (LGPD art. 11) só por leitura direta na tela, com
`IncluirSaude` explícito — e pedir isso com audiência que não é a de
coordenador **devolve erro**, não é silenciosamente ignorado.

Hoje o teto da audiência já barraria o nível 4 sozinho. Erramos para o lado
barulhento porque é segurança por coincidência: basta alguém acrescentar uma
audiência com teto 4 para a flag passar a valer, e o vazamento nasceria de uma
linha que parecia inofensiva.

### No frontend: o DNA é excluído por desenho, não por esquecimento

`src/data/insumo.ts` monta o pacote que vai para a IA. Ele **nunca** carrega
DNA motivacional, mesmo que a pergunta peça todas as fontes — e o prompt
declara isso explicitamente:

> DNA motivacional foi excluído por desenho: motivação não é argumento válido
> numa avaliação de desempenho.

Salário tem o mesmo tratamento: nível 3, oculto por padrão na tela, fora de
qualquer export.

### O que foi omitido aparece como contagem, nunca como conteúdo

```
## O que foi omitido deste pacote

2 item(ns) foram filtrados por confidencialidade. O conteúdo não está aqui e
não deve ser inferido.

Você não viu tudo. Qualifique a conclusão de acordo — não escreva
"não há registro de X" sobre um assunto que pode estar entre os omitidos.
```

Sem isso, quem lê conclui que viu tudo e escreve uma afirmação de completude
falsa. Saber que 7 itens foram filtrados muda como você e a IA qualificam a
conclusão.

---

## Os testes que protegem isso

Não são testes de funcionalidade. Se um deles quebrar, **é vazamento**:

| Arquivo | O que trava |
|---|---|
| `api/internal/models/models_test.go` | Zero value não vale · desconhecido é nível 4 · nenhuma audiência alcança saúde · filtro sempre limita |
| `web/src/data/insumo.test.ts` | DNA nunca entra · nada acima de nível 2 vaza · omissão é contada · contra-evidência é obrigatória |

```bash
cd api && go test ./internal/models/
cd web && npm test -- insumo
```

---

## Ao adicionar código

Checklist curto, para não precisar reler o documento:

- [ ] A função que lê texto recebe `Scope` nos dois primeiros parâmetros?
- [ ] A query concatena `Scope.FiltroSQL()`, em vez de escrever o predicado à mão?
- [ ] Se monta prompt: o DNA e o salário estão fora? A contagem de omitidos está dentro?
- [ ] Se exporta para disco: forçou `nível <= 2`, **ignorando** o Scope recebido?
- [ ] O novo campo sensível foi classificado, ou vai cair no default 4 sem querer?

> `ExportAll` força `nivel <= 2` internamente e ignora o Scope que recebeu. É
> redundante de propósito: arquivo no disco perde o filtro, e um `Grep` acha o
> registro privado.
