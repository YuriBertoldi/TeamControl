/**
 * Squads — a visão de times.
 *
 * Três formas de olhar a mesma estrutura:
 *   Por squad      — o mapa de tribos e squads, com a composição de cada uma
 *   Por liderança  — tudo que está vinculado a um coordenador
 *   Estrutura      — edição: criar squad, renomear, mover pessoa, trocar TL
 *
 * A cor é o eixo de leitura: a família do cargo define o tom (Desenvolvimento
 * azul, Testes/QA verde) e o nível define a intensidade. É o que permite ler a
 * composição de um time sem ler nome nenhum.
 */

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Token } from '@astryxdesign/core/Token';
import { Button } from '@astryxdesign/core/Button';
import { Avatar } from '@astryxdesign/core/Avatar';
import { Divider } from '@astryxdesign/core/Divider';
import { Banner } from '@astryxdesign/core/Banner';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Plus } from 'lucide-react';

import {
  Page, Stats, BarraCadeiras, LegendaComposicao, corDe, corDaCadeira, PESO_NIVEL,
  type Cor,
} from '../app/ui';
import { PESSOAS, HOJE, diasEntre, nivelDe, ehNovo, type Pessoa, type Familia } from '../data/mock';
import { squadsDe, semSquad, type Squad, type Tribo, type TriboId } from '../data/squads';
import { carregarTribos } from '../data/cadastro';
import { carregarConfig, salvarConfig } from '../config';

const FAMILIAS: Familia[] = ['Desenvolvimento', 'Testes / QA', 'Produto', 'Liderança'];

const ativos = () => PESSOAS.filter((p) => p.status === 'ativo');
const pessoaPor = (slug: string) => PESSOAS.find((p) => p.slug === slug);

export default function Squads() {
  const TRIBOS = carregarTribos();
  const [cfg, setCfg] = useState(carregarConfig);
  const [aba, setAba] = useState('squads');
  const [novoNome, setNovoNome] = useState('');
  const [novaTribo, setNovaTribo] = useState<TriboId>('pf');

  const squads = cfg.squads;
  const gravar = (s: Squad[]) => {
    const novo = { ...cfg, squads: s };
    setCfg(novo);
    salvarConfig(novo);
  };

  const orfas = semSquad(ativos().map((p) => p.slug), squads);
  const coordenadores = [...new Set(squads.flatMap((s) => s.coordenacao))];

  return (
    <Page
      titulo="Visão de times"
      subtitulo="A família do cargo define o tom da cor e o nível define a intensidade."
      largura={1400}
    >
      <Legenda />

      <Stats itens={[
        { valor: TRIBOS.length, rotulo: 'tribos' },
        { valor: squads.length, rotulo: 'squads' },
        { valor: new Set(squads.flatMap((s) => s.membros)).size, rotulo: 'pessoas alocadas' },
        { valor: orfas.length, rotulo: 'sem squad', cor: orfas.length ? 'red' : undefined },
      ]} />

      {orfas.length > 0 && (
        <Banner
          status="warning"
          title={`${orfas.length} pessoa(s) sem squad`}
          description={orfas.map((s) => pessoaPor(s)?.curto ?? s).join(', ')}
        />
      )}

      <MapaTribos squads={squads} TRIBOS={TRIBOS} />

      <TabList value={aba} onChange={setAba} hasDivider>
        <Tab value="squads" label="Por squad" />
        <Tab value="lideranca" label="Por liderança" />
        <Tab value="estrutura" label="Estrutura" />
      </TabList>

      {aba === 'squads' && TRIBOS.map((t) => (
        <SecaoTribo key={t.id} tribo={t} squads={squads.filter((s) => s.tribo === t.id)}
                    todasSquads={squads} />
      ))}

      {aba === 'lideranca' && coordenadores.map((c) => (
        <SecaoLideranca key={c} coordenador={c} squads={squads} />
      ))}

      {aba === 'estrutura' && (
        <Estrutura
          squads={squads} gravar={gravar}
          novoNome={novoNome} setNovoNome={setNovoNome}
          novaTribo={novaTribo} setNovaTribo={setNovaTribo} TRIBOS={TRIBOS}
        />
      )}
    </Page>
  );
}

/* ---------- legenda de cores ---------- */

function Legenda() {
  const porFamilia = FAMILIAS.map((f) => {
    const gente = ativos().filter((p) => p.familia === f);
    const niveis = [...new Set(gente.map(nivelDe))]
      .sort((a, b) => PESO_NIVEL[a] - PESO_NIVEL[b]);
    return { familia: f, total: gente.length, niveis, cor: corDe(f) };
  }).filter((x) => x.total > 0);

  return (
    <Card padding={2}>
      <VStack gap={1.5}>
        <Grid columns={{ minWidth: 220, repeat: 'fit' }} gap={2}>
          {porFamilia.map((x) => (
            <VStack key={x.familia} gap={1}>
              <HStack gap={1} vAlign="center">
                <Text type="label">{x.familia}</Text>
                <Text type="supporting">({x.total})</Text>
              </HStack>
              <HStack gap={0.5} wrap="wrap">
                {x.niveis.map((n) => (
                  <Token key={n} size="sm" color={x.cor}
                         label={`${n} ${ativos().filter(
                           (p) => p.familia === x.familia && nivelDe(p) === n).length}`} />
                ))}
              </HStack>
            </VStack>
          ))}
        </Grid>
        <Divider />
        <HStack gap={1} wrap="wrap" vAlign="center">
          <Token size="sm" color="green" label="novo" />
          <Text type="supporting">até 120 dias de casa</Text>
          <Token size="sm" color="cyan" label="+1 squad" />
          <Text type="supporting">em mais de uma squad</Text>
          <Token size="sm" color="gray" label="sem TL" />
          <Text type="supporting">squad sem Tech Lead definido</Text>
        </HStack>
      </VStack>
    </Card>
  );
}

/* ---------- mapa de blocos ---------- */

function MapaTribos({ squads, TRIBOS }: { squads: Squad[]; TRIBOS: Tribo[] }) {
  const totalGeral = squads.reduce((n, s) => n + s.membros.length, 0) || 1;
  return (
    <HStack gap={2} wrap="wrap" vAlign="stretch">
      {TRIBOS.map((t) => {
        const daTribo = squads.filter((s) => s.tribo === t.id);
        const total = daTribo.reduce((n, s) => n + s.membros.length, 0);
        // Largura proporcional ao tamanho da tribo — o mapa vira treemap.
        const largura = Math.max(30, (total / totalGeral) * 96);
        return (
          <VStack key={t.id} gap={1} width={`${largura}%`}>
            <HStack gap={1} vAlign="center" wrap="wrap">
              <Heading level={3}>{t.nome}</Heading>
              <Token size="sm" color={t.cor} label={`${total} pessoas`} />
            </HStack>
            <HStack gap={1} wrap="nowrap" vAlign="stretch">
              {daTribo.map((s) => (
                // Cada squad é um bloco sólido na cor da tribo, com o número
                // grande embaixo — é o que dá o peso visual da referência.
                <Card key={s.id} padding={2} variant={t.cor} minHeight={92}
                      width={`${100 / daTribo.length}%`}>
                  <VStack gap={1} vAlign="between" height="100%">
                    <Text type="label" maxLines={2}>{s.nome}</Text>
                    <Heading level={2}>{s.membros.length}</Heading>
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

/* ---------- cadeiras ---------- */

/** Uma cadeira por pessoa, ordenadas do mais sênior ao mais júnior. */
function cadeiras(slugs: string[]) {
  return slugs
    .map(pessoaPor)
    .filter(Boolean)
    .map((p) => p!)
    .sort((a, b) => PESO_NIVEL[nivelDe(a)] - PESO_NIVEL[nivelDe(b)])
    .map((p) => ({
      id: p.slug,
      cor: corDaCadeira(p.familia, nivelDe(p)),
      titulo: `${p.nome} — ${nivelDe(p)}`,
    }));
}

/** Agregado por família, só para a legenda textual. */
function composicao(slugs: string[]): { rotulo: string; valor: number; cor: Cor }[] {
  return FAMILIAS.map((f) => ({
    rotulo: f,
    valor: slugs.filter((s) => pessoaPor(s)?.familia === f).length,
    cor: corDe(f),
  })).filter((x) => x.valor > 0);
}

/* ---------- seção por tribo ---------- */

function SecaoTribo({ tribo, squads, todasSquads }: {
  tribo: Tribo; squads: Squad[]; todasSquads: Squad[];
}) {
  const slugs = [...new Set(squads.flatMap((s) => s.membros))];
  const comp = composicao(slugs);

  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Avatar name={tribo.nome} size="lg" />
        <VStack gap={0.5}>
          <Heading level={2}>Tribo {tribo.nome}</Heading>
          <Text type="supporting">
            {squads.length} squads · Coordenação: {tribo.coordenacao.join(', ')} ·
            Gerência: {tribo.gerencia.join(', ')}
          </Text>
          <LegendaComposicao partes={comp} />
        </VStack>
        <VStack gap={0} hAlign="end">
          <Heading level={1}>{slugs.length}</Heading>
          <Text type="supporting">pessoas</Text>
        </VStack>
      </HStack>

      <BarraCadeiras cadeiras={cadeiras(slugs)} />

      <Grid columns={{ minWidth: 300, repeat: 'fit' }} gap={2}>
        {squads.map((s) => <CardSquad key={s.id} squad={s} todasSquads={todasSquads} />)}
      </Grid>
    </VStack>
  );
}

/* ---------- card de squad ---------- */

function CardSquad({ squad, todasSquads }: { squad: Squad; todasSquads: Squad[] }) {
  const membros = squad.membros.map(pessoaPor).filter(Boolean) as Pessoa[];
  const tl = squad.techLead ? pessoaPor(squad.techLead) : undefined;

  return (
    <Card padding={4}>
      <VStack gap={1.5}>
        <HStack gap={1} vAlign="center" wrap="wrap">
          <Heading level={3}>{squad.nome}</Heading>
          <VStack gap={0} hAlign="end">
            <Heading level={2}>{membros.length}</Heading>
          </VStack>
        </HStack>
        <Text type="supporting">{membros.length} pessoas</Text>

        <BarraCadeiras cadeiras={cadeiras(squad.membros)} altura={10} />

        <VStack gap={0.5}>
          {tl
            ? <Text type="supporting"><Text type="label">Tech Lead:</Text> {tl.nome}</Text>
            : <Token size="sm" color="gray" label="sem Tech Lead" />}
          <Text type="supporting">
            <Text type="label">Coordenação:</Text> {squad.coordenacao.join(', ')}
          </Text>
        </VStack>

        <Divider />

        {FAMILIAS.map((f) => {
          const doGrupo = membros.filter((m) => m.familia === f);
          if (doGrupo.length === 0) return null;
          return (
            <VStack key={f} gap={0.5}>
              <HStack gap={1} vAlign="center">
                <Token size="sm" color={corDe(f)} label={f} />
                <Text type="supporting">· {doGrupo.length}</Text>
              </HStack>
              <List density="compact">
                {doGrupo.map((m) => (
                  <LinhaPessoa key={m.slug} p={m} squad={squad} todasSquads={todasSquads} />
                ))}
              </List>
            </VStack>
          );
        })}
      </VStack>
    </Card>
  );
}

function LinhaPessoa({ p, squad, todasSquads }: {
  p: Pessoa; squad: Squad; todasSquads: Squad[];
}) {
  const nivel = nivelDe(p);
  const outras = squadsDe(p.slug, todasSquads).filter((s) => s.id !== squad.id);
  const lim = carregarConfig().cadenciaDias + carregarConfig().folgaCadenciaDias;
  const atrasado = diasEntre(p.ultima1a1, HOJE) > lim;

  return (
    <ListItem
      label={p.nome}
      /* Marcador de família: Token vazio colapsa, então leva a inicial do
         nível — serve de barra colorida e ainda informa a senioridade. */
      startContent={<Token size="sm" color={corDaCadeira(p.familia, nivel)}
                           label={nivel === 'Tech Lead' ? 'TL' : nivel[0]} />}
      endContent={
        <HStack gap={0.5} wrap="wrap" vAlign="center">
          {ehNovo(p) && <Token size="sm" color="green" label="novo" />}
          {outras.length > 0 && <Token size="sm" color="cyan" label={`+${outras.length} squad`} />}
          {atrasado && <Token size="sm" color="red" label="1:1 atrasada" />}
          <Token size="sm" color={corDe(p.familia)} label={nivel} />
        </HStack>
      }
    />
  );
}

/* ---------- por liderança ---------- */

function SecaoLideranca({ coordenador, squads }: { coordenador: string; squads: Squad[] }) {
  const c = carregarConfig();
  const limiteCad = c.cadenciaDias + c.folgaCadenciaDias;
  const minhas = squads.filter((s) => s.coordenacao.includes(coordenador));
  const slugs = [...new Set(minhas.flatMap((s) => s.membros))];
  const gente = slugs.map(pessoaPor).filter(Boolean) as Pessoa[];
  const comp = composicao(slugs);

  return (
    <Card padding={4}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Avatar name={coordenador} size="lg" />
          <VStack gap={0.5}>
            <Heading level={2}>{coordenador}</Heading>
            <Text type="supporting">
              {minhas.length} squads em {new Set(minhas.map((s) => s.tribo)).size} tribos
            </Text>
            <LegendaComposicao partes={comp} />
          </VStack>
          <VStack gap={0} hAlign="end">
            <Heading level={1}>{gente.length}</Heading>
            <Text type="supporting">pessoas vinculadas</Text>
          </VStack>
        </HStack>

        <BarraCadeiras cadeiras={cadeiras(slugs)} />
        <Divider />

        <List density="compact" hasDividers>
          {gente
            .slice()
            .sort((a, b) => diasEntre(b.ultima1a1, HOJE) - diasEntre(a.ultima1a1, HOJE))
            .map((p) => {
              const dias = diasEntre(p.ultima1a1, HOJE);
              const suas = squadsDe(p.slug, squads);
              return (
                <ListItem
                  key={p.slug}
                  label={p.nome}
                  startContent={<StatusDot
                    variant={dias > limiteCad ? 'error' : 'success'}
                    label={dias > limiteCad ? '1:1 atrasada' : 'Em dia'} />}
                  endContent={<Text type="supporting" hasTabularNumbers>{dias}d</Text>}
                  description={
                    <HStack gap={0.5} wrap="wrap" vAlign="center">
                      <Token size="sm" color={corDe(p.familia)} label={nivelDe(p)} />
                      {suas.map((s) => (
                        <Token key={s.id} size="sm" color="gray" label={s.nome} />
                      ))}
                      {p.quadrante && <Token size="sm" color="blue" label={p.quadrante} />}
                    </HStack>
                  }
                />
              );
            })}
        </List>
      </VStack>
    </Card>
  );
}

/* ---------- edição da estrutura ---------- */

function Estrutura({ squads, gravar, novoNome, setNovoNome, novaTribo, setNovaTribo, TRIBOS }: {
  squads: Squad[];
  gravar: (s: Squad[]) => void;
  novoNome: string; setNovoNome: (v: string) => void;
  novaTribo: TriboId; setNovaTribo: (v: TriboId) => void;
  TRIBOS: Tribo[];
}) {
  const criar = () => {
    if (!novoNome.trim()) return;
    gravar([...squads, {
      id: `squad-${Date.now()}`,
      nome: novoNome.trim(),
      tribo: novaTribo,
      coordenacao: ['Coordenação'],
      membros: [],
    }]);
    setNovoNome('');
  };

  const alterar = (id: string, patch: Partial<Squad>) =>
    gravar(squads.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const remover = (id: string) => gravar(squads.filter((s) => s.id !== id));

  /** Mover é tirar de todas e colocar numa — manter em duas é ação separada. */
  const mover = (slug: string, destino: string) =>
    gravar(squads.map((s) => ({
      ...s,
      membros: s.id === destino
        ? [...new Set([...s.membros, slug])]
        : s.membros.filter((m) => m !== slug),
      techLead: s.techLead === slug && s.id !== destino ? undefined : s.techLead,
    })));

  return (
    <VStack gap={3}>
      <Card padding={4}>
        <VStack gap={2}>
          <Heading level={3}>Criar squad</Heading>
          <HStack gap={2} wrap="wrap" vAlign="end">
            <TextInput label="Nome da squad" value={novoNome} onChange={setNovoNome}
                       placeholder="ex.: Conta Corrente Fiscal" />
            <Selector label="Tribo" value={novaTribo}
                      onChange={(v) => setNovaTribo((v ?? 'pf') as TriboId)}
                      options={TRIBOS.map((t) => ({ value: t.id, label: t.nome }))} />
            <Button icon={<Plus size={14} />} label="Criar" variant="primary" onClick={criar} isDisabled={!novoNome.trim()} />
          </HStack>
          <Text type="supporting">
            As tribos em si (nome, produto, cor, id da portal de avaliação) são editadas em
            Cadastros › Tribos — um único lugar para o mesmo dado.
          </Text>
        </VStack>
      </Card>

      <Card padding={4}>
        <VStack gap={2}>
          <Heading level={3}>Squads</Heading>
          <Text type="supporting">
            Renomear, trocar de tribo, definir Tech Lead ou excluir. A exclusão devolve as
            pessoas para "sem squad" — nenhuma pessoa é apagada.
          </Text>
          <List density="balanced" hasDividers>
            {squads.map((s) => (
              <ListItem
                key={s.id}
                label={s.nome}
                /* Tribo agora é cadastro: a squad pode apontar para uma que
                   foi renomeada ou removida. Dizer isso é melhor que quebrar. */
                startContent={<Token size="sm" color={corDe('Desenvolvimento')}
                                     label={TRIBOS.find((t) => t.id === s.tribo)?.nome
                                            ?? 'tribo inexistente'} />}
                endContent={
                  <HStack gap={1} wrap="wrap" vAlign="center">
                    <Selector
                      label={`Tech Lead de ${s.nome}`} size="sm" variant="ghost" hasClear
                      placeholder="sem Tech Lead"
                      value={s.techLead ?? ''}
                      onChange={(v) => alterar(s.id, { techLead: v ?? undefined })}
                      options={s.membros.map((m) => ({
                        value: m, label: pessoaPor(m)?.nome ?? m,
                      }))}
                    />
                    <Button size="sm" variant="ghost" label="Excluir"
                            onClick={() => remover(s.id)} />
                  </HStack>
                }
                description={
                  <Text type="supporting">
                    {s.membros.length} pessoas · coordenação {s.coordenacao.join(', ')}
                  </Text>
                }
              />
            ))}
          </List>
        </VStack>
      </Card>

      <Card padding={4}>
        <VStack gap={2}>
          <Heading level={3}>Alocação das pessoas</Heading>
          <Text type="supporting">
            Cada pessoa em uma squad. Quem precisa estar em duas aparece com "+1 squad" na
            visão por squad.
          </Text>
          <List density="compact" hasDividers>
            {ativos().map((p) => {
              const suas = squadsDe(p.slug, squads);
              return (
                <ListItem
                  key={p.slug}
                  label={p.nome}
                  startContent={<Token size="sm" color={corDe(p.familia)} label={nivelDe(p)} />}
                  endContent={
                    <Selector
                      label={`Squad de ${p.nome}`} size="sm" variant="ghost"
                      placeholder="sem squad"
                      value={suas[0]?.id ?? ''}
                      onChange={(v) => v && mover(p.slug, v)}
                      options={squads.map((s) => ({
                        value: s.id,
                        label: s.nome,
                        description: TRIBOS.find((t) => t.id === s.tribo)!.nome,
                      }))}
                      hasSearch
                    />
                  }
                  description={
                    <HStack gap={0.5} wrap="wrap" vAlign="center">
                      <Token size="sm" color={corDe(p.familia)} label={p.familia} />
                      {suas.length === 0 && <Token size="sm" color="red" label="sem squad" />}
                      {suas.length > 1 && (
                        <Token size="sm" color="cyan" label={`${suas.length} squads`} />
                      )}
                    </HStack>
                  }
                />
              );
            })}
          </List>
        </VStack>
      </Card>
    </VStack>
  );
}
