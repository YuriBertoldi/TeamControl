/**
 * Blocos da Visão de times — a linguagem visual da referência.
 *
 * Moram aqui, e não dentro de uma tela, porque o Painel e a Visão de times
 * mostram o mesmo recorte organizacional com profundidades diferentes. Duas
 * cópias divergem no primeiro ajuste de cor.
 *
 * A regra de cor é a da referência e vale no sistema inteiro:
 * **a família do cargo define o tom, o nível define a intensidade.** Como o
 * Astryx não tem escala de intensidade por token, cada família usa dois
 * matizes vizinhos — o mais forte para sênior para cima.
 */

import type { ReactNode } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Token } from '@astryxdesign/core/Token';
import { Button } from '@astryxdesign/core/Button';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Divider } from '@astryxdesign/core/Divider';

import { BarraCadeiras, PESO_NIVEL, corDaCadeira, type Cor } from './ui';
import { nivelDe, ehNovo, type Pessoa, type Familia, type Nivel } from '../data/mock';
import type { Squad, Tribo } from '../data/squads';

/** Sigla curta do nível, como na referência: Jr · Pl · Sr · Esp · TL. */
export const SIGLA_NIVEL: Record<Nivel, string> = {
  'Júnior': 'Jr', 'Pleno': 'Pl', 'Sênior': 'Sr',
  'Especialista': 'Esp', 'Tech Lead': 'TL',
};

const ORDEM_NIVEL: Nivel[] = ['Júnior', 'Pleno', 'Sênior', 'Especialista', 'Tech Lead'];
const ORDEM_FAMILIA: Familia[] = ['Liderança', 'Produto', 'Desenvolvimento', 'Testes / QA'];

/**
 * Duas escalas de cor, e elas NÃO são a mesma.
 *
 * Na referência a barrinha à esquerda do nome e o quadradinho do grupo seguem a
 * FAMÍLIA; a etiqueta da direita segue o NÍVEL. Misturar as duas — que foi o
 * que eu tinha feito — apaga a informação: fica impossível varrer a coluna da
 * direita procurando os júniores, porque cada família pinta o mesmo nível de
 * uma cor diferente.
 */
export const corFamilia = (f: Familia): Cor =>
  f === 'Desenvolvimento' ? 'blue'
  : f === 'Testes / QA' ? 'green'
  : f === 'Produto' ? 'orange'
  : 'purple';

export const corNivel = (n: Nivel): Cor =>
  n === 'Júnior' ? 'purple'
  : n === 'Sênior' ? 'orange'
  : n === 'Especialista' ? 'green'
  : 'blue';

/** Barrinha vertical de cor. Card minúsculo porque o Astryx não aceita style. */
function Barrinha({ cor, altura = 18 }: { cor: Cor; altura?: number }) {
  return (
    <Card padding={0} variant={cor} width={3} height={altura}>
      <Text type="supporting">{''}</Text>
    </Card>
  );
}

/** Quadradinho de cor do cabeçalho de grupo. */
function Quadrinho({ cor }: { cor: Cor }) {
  return (
    <Card padding={0} variant={cor} width={8} height={8}>
      <Text type="supporting">{''}</Text>
    </Card>
  );
}

/** Cadeiras ordenadas por senioridade — sênior à esquerda, como na referência. */
export const cadeirasDe = (pessoas: Pessoa[]) =>
  [...pessoas]
    .sort((a, b) =>
      ORDEM_FAMILIA.indexOf(a.familia) - ORDEM_FAMILIA.indexOf(b.familia)
      || PESO_NIVEL[nivelDe(b)] - PESO_NIVEL[nivelDe(a)])
    .map((p) => ({
      id: p.slug,
      cor: corDaCadeira(p.familia, nivelDe(p)),
      titulo: `${p.curto} · ${p.cargo}`,
    }));

/* ---------- legenda de famílias e níveis ---------- */

/**
 * A legenda é também o filtro.
 *
 * Na referência, clicar num nível esconde ou mostra aquelas pessoas. É o que
 * transforma a legenda de decoração em ferramenta: "me mostra só os júniores
 * das duas tribos" vira um clique, não um relatório.
 */
export function LegendaFamilias({ pessoas, ocultos, alternar }: {
  pessoas: Pessoa[];
  ocultos: Set<string>;
  alternar: (chave: string) => void;
}) {
  const familias = ORDEM_FAMILIA.filter((f) => pessoas.some((p) => p.familia === f));

  return (
    <Card padding={3}>
      <VStack gap={2}>
        <HStack gap={3} wrap="wrap" vAlign="start">
          {familias.map((familia) => {
            const daFamilia = pessoas.filter((p) => p.familia === familia);
            const niveis = ORDEM_NIVEL.filter(
              (n) => daFamilia.some((p) => nivelDe(p) === n));
            return (
              <VStack key={familia} gap={0.5}>
                <HStack gap={1} vAlign="center">
                  <Text type="label">{familia}</Text>
                  <Text type="supporting">({daFamilia.length})</Text>
                </HStack>
                <HStack gap={0.5} wrap="wrap">
                  {niveis.map((nivel) => {
                    const chave = `${familia}|${nivel}`;
                    const n = daFamilia.filter((p) => nivelDe(p) === nivel).length;
                    const oculto = ocultos.has(chave);
                    return (
                      <Button
                        key={nivel}
                        size="sm"
                        variant={oculto ? 'ghost' : 'secondary'}
                        label={`${SIGLA_NIVEL[nivel]} ${n}`}
                        onClick={() => alternar(chave)}
                      />
                    );
                  })}
                </HStack>
              </VStack>
            );
          })}
        </HStack>

        <Divider />

        <HStack gap={2} wrap="wrap" vAlign="center">
          <Marcador cor="orange" rotulo="QA em dev">
            {`QA respondendo à coordenação de desenvolvimento (${
              pessoas.filter((p) => p.familia === 'Testes / QA' && p.qaDe !== 'produto').length})`}
          </Marcador>
          <Marcador cor="purple" rotulo="novo">até 120 dias de casa</Marcador>
          <Marcador cor="gray" rotulo="afastado">fora por licença</Marcador>
          <Text type="supporting">Clique num nível para esconder ou mostrar</Text>
        </HStack>
      </VStack>
    </Card>
  );
}

function Marcador({ cor, rotulo, children }: {
  cor: Cor; rotulo: string; children: ReactNode;
}) {
  return (
    <HStack gap={0.5} vAlign="center">
      <Token size="sm" color={cor} label={rotulo} />
      <Text type="supporting">{children}</Text>
    </HStack>
  );
}

/** Aplica o filtro da legenda. Fora daqui ninguém precisa saber o formato da chave. */
export const visivel = (p: Pessoa, ocultos: Set<string>) =>
  !ocultos.has(`${p.familia}|${nivelDe(p)}`);

/* ---------- chips de tribo ---------- */

export function ChipsTribo({ tribos, pessoas, selecionada, selecionar }: {
  tribos: Tribo[];
  pessoas: Pessoa[];
  selecionada: string;
  selecionar: (id: string) => void;
}) {
  return (
    <HStack gap={1} wrap="wrap" vAlign="center">
      {tribos.map((t) => {
        const n = pessoas.filter((p) => p.time === t.id).length;
        const ativa = selecionada === t.id;
        return (
          <Button
            key={t.id}
            size="sm"
            variant={ativa ? 'primary' : 'secondary'}
            label={`${t.nome}  ${n}`}
            /* Clicar na tribo já selecionada limpa o filtro — evita um botão
               "limpar" só para isso. */
            onClick={() => selecionar(ativa ? '' : t.id)}
          />
        );
      })}
      {selecionada && (
        <Text type="supporting">filtrando por tribo · clique de novo para limpar</Text>
      )}
    </HStack>
  );
}

/* ---------- treemap de tribos ---------- */

/**
 * Mapa das tribos: um bloco por squad, largura proporcional ao tamanho.
 *
 * É a leitura que nenhuma lista entrega — onde está concentrada a gente, e
 * qual squad é grande demais ou pequena demais para o que carrega.
 */
export function TreemapTribos({ tribos, squads, pessoas }: {
  tribos: Tribo[];
  squads: Squad[];
  pessoas: Pessoa[];
}) {
  const visiveis = new Set(pessoas.map((p) => p.slug));
  const tamanho = (s: Squad) => s.membros.filter((m) => visiveis.has(m)).length;
  const totalGeral = squads.reduce((n, s) => n + tamanho(s), 0) || 1;

  return (
    <HStack gap={1} wrap="wrap" vAlign="stretch">
      {tribos.map((t) => {
        const daTribo = squads.filter((s) => s.tribo === t.id);
        const total = daTribo.reduce((n, s) => n + tamanho(s), 0);
        if (total === 0) return null;
        // Piso de 18% para tribo pequena não virar uma tira ilegível.
        const largura = Math.max(18, (total / totalGeral) * 97);
        return (
          <VStack key={t.id} gap={0.5} width={`${largura}%`}>
            <Card padding={1} variant={t.cor}>
              <Text type="label" maxLines={1}>{t.nome}</Text>
            </Card>
            <HStack gap={0.5} wrap="nowrap" vAlign="stretch">
              {daTribo.map((s) => (
                <Card key={s.id} padding={1.5} variant={t.cor} minHeight={84}
                      width={`${100 / daTribo.length}%`}>
                  <VStack gap={1} vAlign="between" height="100%">
                    <Text type="supporting" maxLines={2}>{s.nome}</Text>
                    <Heading level={2}>{tamanho(s)}</Heading>
                  </VStack>
                </Card>
              ))}
            </HStack>
          </VStack>
        );
      })}
    </HStack>
  );
}

/* ---------- bloco de uma tribo ---------- */

/**
 * Cabeçalho de tribo + barra de cadeiras + cards de squad.
 *
 * A barra tem uma cadeira por pessoa e vai ordenada por senioridade: a
 * composição da tribo inteira se lê de relance, sem contar linha por linha.
 */
export function BlocoTribo({ tribo, pessoas, squads, aoClicar, detalhado = true }: {
  tribo: Tribo;
  pessoas: Pessoa[];
  squads: Squad[];
  aoClicar?: (slug: string) => void;
  detalhado?: boolean;
}) {
  const daTribo = pessoas.filter((p) => p.time === tribo.id);
  if (daTribo.length === 0) return null;

  const daSquad = squads.filter((s) => s.tribo === tribo.id);
  const porFamilia = ORDEM_FAMILIA
    .map((f) => ({ f, n: daTribo.filter((p) => p.familia === f).length }))
    .filter((x) => x.n > 0);

  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" wrap="wrap" hAlign="between">
        <HStack gap={2} vAlign="center">
          <Avatar name={tribo.nome} size="md" />
          <VStack gap={0.5}>
            <Heading level={2}>Tribo {tribo.nome}</Heading>
            <Text type="supporting">
              {daSquad.length} squads · Coordenação: {tribo.coordenacao.join(', ')}
              {tribo.gerencia.length ? ` · Gerência: ${tribo.gerencia.join(', ')}` : ''}
            </Text>
            <HStack gap={0.5} wrap="wrap">
              {porFamilia.map(({ f, n }) => (
                <Token key={f} size="sm" color={corFamilia(f)} label={`${f} ${n}`} />
              ))}
            </HStack>
          </VStack>
        </HStack>
        <VStack gap={0} hAlign="end">
          <Heading level={1}>{daTribo.length}</Heading>
          <Text type="supporting">pessoas</Text>
        </VStack>
      </HStack>

      <BarraCadeiras cadeiras={cadeirasDe(daTribo)} altura={16} />

      {detalhado && (
        <HStack gap={2} wrap="wrap" vAlign="stretch">
          {daSquad.map((s) => {
            const membros = daTribo.filter((p) => s.membros.includes(p.slug));
            if (membros.length === 0) return null;
            return (
              <CardSquad key={s.id} squad={s} membros={membros}
                         tribo={tribo} squads={squads} aoClicar={aoClicar} />
            );
          })}

          {/* Sem squad é dado de gestão, não erro de cadastro: aparece. */}
          {(() => {
            const soltos = daTribo.filter(
              (p) => !daSquad.some((s) => s.membros.includes(p.slug)));
            return soltos.length > 0 ? (
              <CardSquad
                key="sem-squad"
                squad={{ id: 'sem-squad', nome: 'Sem squad', tribo: tribo.id,
                         coordenacao: [], membros: soltos.map((p) => p.slug) }}
                membros={soltos} tribo={tribo} squads={squads} aoClicar={aoClicar} />
            ) : null;
          })()}
        </HStack>
      )}
    </VStack>
  );
}

/**
 * Card de squad — a peça com mais informação da referência.
 *
 * A ordem dentro do card é a da referência e tem lógica: primeiro quem
 * responde pela squad (Tech Lead, coordenação, gerência), depois as pessoas
 * **agrupadas por família**. O agrupamento é o que faz o card ser lido de
 * relance: dá para ver que a squad tem 3 devs e 1 QA sem contar linha a linha.
 */
function CardSquad({ squad, membros, tribo, squads, aoClicar }: {
  squad: Squad;
  membros: Pessoa[];
  tribo: Tribo;
  squads: Squad[];
  aoClicar?: (slug: string) => void;
}) {
  const tl = membros.find((p) => p.slug === squad.techLead);
  const familias = ORDEM_FAMILIA
    .map((f) => ({ f, gente: membros.filter((p) => p.familia === f) }))
    .filter((x) => x.gente.length > 0);

  /** Em quantas squads a pessoa está — o marcador "+1 squad" da referência. */
  const squadsDaPessoa = (slug: string) =>
    squads.filter((s) => s.membros.includes(slug)).length;

  return (
    // padding 3 e gap 2: é o card com mais informação da tela, e era o que mais
    // sofria com aperto — nome, responsáveis, chips e uma linha por pessoa
    // empilhados com 4px entre si viram um bloco de texto só.
    <Card padding={3} width="31%" minHeight={160}>
      <VStack gap={2}>
        <HStack gap={1} vAlign="center" wrap="wrap" hAlign="between">
          <Text type="label">{squad.nome}</Text>
          <Heading level={2}>{membros.length}</Heading>
        </HStack>
        <Text type="supporting">{membros.length} pessoas</Text>

        <BarraCadeiras cadeiras={cadeirasDe(membros)} altura={8} />

        {/* Quem responde pela squad fica junto, mas não colado: as três linhas
            são do mesmo assunto, e meio passo entre elas basta para separá-las. */}
        <VStack gap={0.5}>
          {tl && (
            <Text type="supporting">
              <Text type="label">Tech Lead:</Text> {tl.nome}
            </Text>
          )}
          {squad.coordenacao.length > 0 && (
            <Text type="supporting">
              <Text type="label">Coordenação:</Text> {squad.coordenacao.join(', ')}
            </Text>
          )}
          {tribo.gerencia.length > 0 && (
            <Text type="supporting">
              <Text type="label">Gerência:</Text> {tribo.gerencia.join(', ')}
            </Text>
          )}
        </VStack>

        {/* Linha de composição: o que a squad TEM e o que lhe falta. */}
        <HStack gap={0.5} wrap="wrap" vAlign="center">
          <Token size="sm" color={tl ? 'blue' : 'gray'}
                 label={tl ? 'Tech Lead' : 'sem Tech Lead'} />
          {(['Desenvolvimento', 'Testes / QA', 'Produto'] as Familia[]).map((f) => {
            const n = membros.filter((p) => p.familia === f).length;
            const curto = f === 'Desenvolvimento' ? 'Dev' : f === 'Testes / QA' ? 'QA' : 'Produto';
            return (
              <Token key={f} size="sm" color={n ? corFamilia(f) : 'gray'}
                     label={n ? `${curto} ${n}` : curto} />
            );
          })}
        </HStack>

        {familias.map(({ f, gente }) => (
          <VStack key={f} gap={1}>
            <HStack gap={0.5} vAlign="center">
              <Quadrinho cor={corFamilia(f)} />
              <Text type="label">{f.toUpperCase()} · {gente.length}</Text>
            </HStack>

            {[...gente]
              .sort((a, b) => PESO_NIVEL[nivelDe(b)] - PESO_NIVEL[nivelDe(a)])
              .map((p) => (
                <HStack key={p.slug} gap={1} vAlign="center" hAlign="between">
                  <HStack gap={1} vAlign="center">
                    <Barrinha cor={corFamilia(p.familia)} />
                    <Button size="sm" variant="ghost" label={p.nome}
                            onClick={aoClicar ? () => aoClicar(p.slug) : undefined} />
                  </HStack>
                  <HStack gap={0.5} vAlign="center" wrap="wrap">
                    {squadsDaPessoa(p.slug) > 1 && (
                      <Token size="sm" color="blue" label="+1 squad" />
                    )}
                    {ehNovo(p) && <Token size="sm" color="green" label="novo" />}
                    {p.status === 'afastado' && (
                      <Token size="sm" color="gray" label="afastado" />
                    )}
                    {p.familia === 'Testes / QA' && (
                      <Token size="sm" color={p.qaDe === 'produto' ? 'purple' : 'orange'}
                             label={p.qaDe === 'produto' ? 'QA em produto' : 'QA em dev'} />
                    )}
                    <Token size="sm" color={corNivel(nivelDe(p))} label={nivelDe(p)} />
                  </HStack>
                </HStack>
              ))}
          </VStack>
        ))}
      </VStack>
    </Card>
  );
}

/** Quem é "novo" na tribo — usado para o marcador da legenda. */
export const novosDe = (pessoas: Pessoa[]) => pessoas.filter((p) => ehNovo(p));
