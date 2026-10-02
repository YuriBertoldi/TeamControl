/**
 * Matriz de skills — heatmap pessoas × skills.
 *
 * Escala 0–4 (Dreyfus adaptado). O nível 4 exige evidência de REPLICAÇÃO, não
 * de virtuosismo: quem é brilhante e é a única pessoa que sabe algo é nível 3
 * com risco, não nível 4. Por isso o bus factor conta quem está em ≥ 3.
 */

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { List, ListItem } from '@astryxdesign/core/List';
import { Banner } from '@astryxdesign/core/Banner';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Table, proportional, pixel } from '@astryxdesign/core/Table';

import { Page, Filtros, Metrica, rotuloCargo } from '../app/ui';
import { PESSOAS } from '../data/mock';
import { carregarSkills, NIVEIS, AUTO, NIVEL_ROTULO, NIVEL_COR } from '../data/mockCiclo';
import { carregarCargos, skillsDoCargo } from '../data/cadastro';

const ativos = PESSOAS.filter((p) => p.status === 'ativo');

/**
 * Skill esperada da cadeira de cada pessoa, indexada para consulta barata.
 *
 * Esta é a correção que faz a matriz significar alguma coisa: antes, todo
 * mundo era avaliado em tudo, e o 0 de um dev em Robot Framework contava como
 * lacuna. Fora da cadeira não existe gap — existe "não se aplica".
 */
const ESPERADO: Record<string, Record<string, number>> = Object.fromEntries(
  ativos.map((p) => [
    p.slug,
    Object.fromEntries(skillsDoCargo(p.cargo, p.techLead).map((s) => [s.codigo, s.nivelEsperado])),
  ]));

const exigida = (slug: string, codigo: string) => ESPERADO[slug]?.[codigo] !== undefined;

/**
 * Quem ainda não tem leitura nenhuma de skill não está "abaixo da cadeira" —
 * está sem avaliação, que é um problema seu, não dela. Misturar os dois
 * pintava a matriz inteira de vermelho e escondia o gap que é real.
 */
const avaliado = (slug: string) => Object.keys(NIVEIS[slug] ?? {}).length > 0;

/** Quanto falta para a pessoa atingir o esperado da própria cadeira. */
function deficitDaCadeira(slug: string) {
  if (!avaliado(slug)) return [];
  const esperado = ESPERADO[slug] ?? {};
  return Object.entries(esperado)
    .map(([cod, alvo]) => ({ cod, alvo, atual: NIVEIS[slug]?.[cod] ?? 0 }))
    .filter((x) => x.atual < x.alvo)
    .sort((a, b) => (b.alvo - b.atual) - (a.alvo - a.atual));
}

interface LinhaMatriz extends Record<string, unknown> {
  slug: string;
  pessoa: string;
}

export default function Skills() {
  const [aba, setAba] = useState('matriz');
  const [categoria, setCategoria] = useState('');
  const [filtro, setFiltro] = useState('');
  const [cargo, setCargo] = useState('');

  // Lido do cadastro, não da constante: o catálogo é editável, e a matriz
  // precisa refletir a taxonomia de hoje.
  const SKILLS = carregarSkills();
  const categorias = [...new Set(SKILLS.map((s) => s.categoria))];
  const cargos = carregarCargos().filter((c) => ativos.some((p) => p.cargo === c.nome));

  // Recortar por cargo tira as linhas de quem não ocupa a cadeira: comparar
  // dev com QA na mesma tabela é o que tornava o heatmap ilegível.
  const pessoasVisiveis = useMemo(
    () => (cargo ? ativos.filter((p) => p.cargo === cargo) : ativos), [cargo]);

  const skillsVisiveis = useMemo(() => SKILLS.filter((s) => {
    if (categoria && s.categoria !== categoria) return false;
    if (filtro === 'estrategicas' && !s.estrategica) return false;
    if (filtro === 'criticas' && !s.critica) return false;
    // Com cargo escolhido, só as colunas que aquela cadeira cobra.
    if (cargo && !pessoasVisiveis.some((p) => exigida(p.slug, s.codigo))) return false;
    if (filtro === 'abaixo') {
      return pessoasVisiveis.some((p) => {
        const alvo = ESPERADO[p.slug]?.[s.codigo];
        return alvo !== undefined && (NIVEIS[p.slug]?.[s.codigo] ?? 0) < alvo;
      });
    }
    if (filtro === 'gap') {
      return pessoasVisiveis.some((p) => {
        const a = AUTO[p.slug]?.[s.codigo];
        return a !== undefined && Math.abs(a - (NIVEIS[p.slug]?.[s.codigo] ?? 0)) >= 1;
      });
    }
    return true;
  }), [categoria, filtro, cargo, pessoasVisiveis]);

  /** Bus factor = quantas pessoas estão em nível ≥ 3. */
  const busFactor = (codigo: string) =>
    ativos.filter((p) => (NIVEIS[p.slug]?.[codigo] ?? 0) >= 3).length;

  const riscos = SKILLS
    .map((s) => ({ s, bf: busFactor(s.codigo) }))
    .filter((r) => r.bf <= 1)
    .sort((a, b) => a.bf - b.bf);

  const gaps = ativos.flatMap((p) =>
    Object.entries(AUTO[p.slug] ?? {}).map(([cod, auto]) => {
      const lider = NIVEIS[p.slug]?.[cod] ?? 0;
      return { pessoa: p.curto, slug: p.slug, cod, auto, lider, gap: auto - lider };
    }).filter((g) => g.gap !== 0),
  ).sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

  const dados: LinhaMatriz[] = pessoasVisiveis.map((p) => {
    const linha: LinhaMatriz = { slug: p.slug, pessoa: p.curto };
    for (const s of skillsVisiveis) linha[s.codigo] = NIVEIS[p.slug]?.[s.codigo] ?? 0;
    return linha;
  });

  const colunas = [
    { key: 'pessoa', header: 'Pessoa', width: pixel(130) },
    ...skillsVisiveis.map((s) => ({
      key: s.codigo,
      header: s.nome,
      width: proportional(1),
      renderCell: (row: LinhaMatriz) => {
        const slug = row.slug as string;
        const n = (row[s.codigo] as number) ?? 0;
        const auto = AUTO[slug]?.[s.codigo];
        const temGap = auto !== undefined && auto !== n;
        const alvo = ESPERADO[slug]?.[s.codigo];

        // Fora da cadeira não é lacuna. O ponto apagado diz "não se aplica" e
        // o nível, quando existe, continua visível como ganho extra.
        if (alvo === undefined) {
          return n > 0
            ? <Token size="sm" color="gray" label={`${n} extra`} />
            : <Text type="supporting">·</Text>;
        }
        return (
          <HStack gap={0.5} vAlign="center">
            <Token size="sm" color={NIVEL_COR[n]} label={String(n)} />
            {/* O alvo só acusa quem já foi avaliado: sem leitura, o 0 é
                ausência de dado, não desempenho abaixo do esperado. */}
            {avaliado(slug) && n < alvo && (
              <Token size="sm" color="red" label={`alvo ${alvo}`} />
            )}
            {temGap && <Token size="sm" color="purple" label={`auto ${auto}`} />}
          </HStack>
        );
      },
    })),
  ];

  const abaixoDoAlvo = ativos
    .map((p) => ({ p, faltas: deficitDaCadeira(p.slug) }))
    .filter((x) => x.faltas.length > 0)
    .sort((a, b) => b.faltas.length - a.faltas.length);

  const semAvaliacao = ativos.filter((p) => !avaliado(p.slug));

  return (
    <Page
      titulo="Matriz de skills"
      subtitulo={`${SKILLS.length} competências × ${ativos.length} pessoas · escala 0–4`}
      largura={1400}
    >
      <HStack gap={2} wrap="wrap">
        <Metrica valor={riscos.filter((r) => r.bf === 1).length}
                 rotulo="Bus factor 1" nota="uma só pessoa em nível ≥ 3" cor="red" />
        <Metrica valor={riscos.filter((r) => r.bf === 0).length}
                 rotulo="Cadeira descoberta" nota="ninguém em nível ≥ 3" cor="red" />
        <Metrica valor={gaps.filter((g) => Math.abs(g.gap) >= 2).length}
                 rotulo="Gaps ≥ 2 níveis" nota="pauta obrigatória de 1:1" cor="orange" />
        <Metrica valor={abaixoDoAlvo.length}
                 rotulo="Abaixo da cadeira" nota="avaliados e abaixo do esperado do cargo"
                 cor={abaixoDoAlvo.length ? 'orange' : undefined} />
        <Metrica valor={semAvaliacao.length}
                 rotulo="Sem avaliação" nota="nenhuma skill lida — pendência sua"
                 cor={semAvaliacao.length ? 'red' : undefined} />
        <Metrica
          valor={`${Math.round(
            (ativos.filter((p) => (NIVEIS[p.slug]?.['go.idiomatico'] ?? 0) >= 2).length / ativos.length) * 100)}%`}
          rotulo="Cobertura em Go" nota="nível ≥ 2, meta estratégica" cor="orange" />
      </HStack>

      <TabList value={aba} onChange={setAba} hasDivider>
        <Tab value="matriz" label="Heatmap" />
        <Tab value="cadeira" label={`Cobertura da cadeira (${abaixoDoAlvo.length})`} />
        <Tab value="riscos" label={`Riscos (${riscos.length})`} />
        <Tab value="gaps" label={`Gaps auto × líder (${gaps.length})`} />
      </TabList>

      {aba === 'matriz' && (
        <>
          <Filtros resultado={
            `${pessoasVisiveis.length} pessoas × ${skillsVisiveis.length} de ${SKILLS.length} competências`}>
            <Selector label="Cargo" size="sm" variant="ghost" placeholder="Todos os cargos"
                      value={cargo} onChange={(v) => setCargo(v ?? '')} hasClear
                      options={cargos.map((c) => ({
                        value: c.nome,
                        label: c.nome,
                        description: `${c.skills.length} skills da cadeira · ${
                          ativos.filter((p) => p.cargo === c.nome).length} pessoas`,
                      }))} />
            <Selector label="Categoria" size="sm" variant="ghost" placeholder="Todas as categorias"
                      value={categoria} onChange={(v) => setCategoria(v ?? '')} hasClear
                      options={categorias.map((c) => ({ value: c, label: c }))} />
            <Selector label="Recorte" size="sm" variant="ghost" placeholder="Todas as competências"
                      value={filtro} onChange={(v) => setFiltro(v ?? '')} hasClear
                      options={[
                        { value: 'abaixo', label: 'Só abaixo do esperado da cadeira' },
                        { value: 'estrategicas', label: 'Só estratégicas (Go, IA)' },
                        { value: 'criticas', label: 'Só críticas de produto' },
                        { value: 'gap', label: 'Só com gap auto × líder' },
                      ]} />
            {(categoria || filtro || cargo) && (
              <Button size="sm" variant="ghost" label="Limpar"
                      onClick={() => { setCategoria(''); setFiltro(''); setCargo(''); }} />
            )}
          </Filtros>

          <Card padding={2}>
            <VStack gap={2}>
              <HStack gap={1} wrap="wrap" vAlign="center">
                <Text type="label">Escala</Text>
                {NIVEL_ROTULO.map((r, i) => (
                  <Token key={r} size="sm" color={NIVEL_COR[i]} label={`${i} ${r}`} />
                ))}
                <Token size="sm" color="purple" label="auto N = autoavaliação divergente" />
                <Token size="sm" color="red" label="alvo N = abaixo do esperado da cadeira" />
                <Token size="sm" color="gray" label="N extra = fora da cadeira, não é lacuna" />
              </HStack>
              <Table
                data={dados}
                columns={colunas}
                idKey="slug"
                density="compact"
                dividers="grid"
                hasHover
                textOverflow="truncate"
              />
            </VStack>
          </Card>
        </>
      )}

      {aba === 'cadeira' && (
        <VStack gap={2}>
          <Banner
            status="info"
            title="Cada cargo cobra skills diferentes"
            description="O esperado vem do cadastro de cargos, em Cadastros › Cargos. QA não é medido em Delphi/VCL e dev não é medido em Robot Framework — o que aparece aqui é só o que a cadeira da pessoa de fato exige."
          />
          {semAvaliacao.length > 0 && (
            <Banner
              status="warning"
              title={`${semAvaliacao.length} pessoa(s) sem nenhuma leitura de skill`}
              description={`${semAvaliacao.map((p) => p.curto).join(', ')} — sem avaliação não há gap a cobrar, há uma pendência sua. Enquanto não houver leitura, a cadeira fica cinza na matriz em vez de vermelha.`}
            />
          )}
          <Card padding={0}>
            <List density="balanced" hasDividers>
              {abaixoDoAlvo.map(({ p, faltas }) => (
                <ListItem
                  key={p.slug}
                  label={p.curto}
                  startContent={<StatusDot
                    variant={faltas.some((f) => f.alvo - f.atual >= 2) ? 'error' : 'warning'}
                    label={`${faltas.length} abaixo do alvo`} />}
                  endContent={<Text type="supporting" hasTabularNumbers>
                    {Object.keys(ESPERADO[p.slug] ?? {}).length - faltas.length} de{' '}
                    {Object.keys(ESPERADO[p.slug] ?? {}).length} atingidas
                  </Text>}
                  description={
                    <HStack gap={0.5} wrap="wrap" vAlign="center">
                      <Token size="sm" color="gray" label={rotuloCargo(p)} />
                      {faltas.slice(0, 5).map((f) => {
                        const nome = SKILLS.find((s) => s.codigo === f.cod)?.nome ?? f.cod;
                        return (
                          <Token key={f.cod}
                                 size="sm" color={f.alvo - f.atual >= 2 ? 'red' : 'orange'}
                                 label={`${nome} ${f.atual}→${f.alvo}`} />
                        );
                      })}
                      {faltas.length > 5 && (
                        <Text type="supporting">+{faltas.length - 5}</Text>
                      )}
                    </HStack>
                  }
                />
              ))}
            </List>
          </Card>
        </VStack>
      )}

      {aba === 'riscos' && (
        <VStack gap={2}>
          <Banner
            status="warning"
            title="Concentração de conhecimento"
            description="Skill crítica com uma única pessoa em nível ≥ 3 é risco de operação, não de pessoa. O alerta exige ação: nomear sucessor com prazo."
          />
          <Card padding={0}>
            <List density="balanced" hasDividers>
              {riscos.map(({ s, bf }) => {
                const donos = ativos.filter((p) => (NIVEIS[p.slug]?.[s.codigo] ?? 0) >= 3);
                const candidatos = ativos
                  .filter((p) => (NIVEIS[p.slug]?.[s.codigo] ?? 0) === 2)
                  .map((p) => p.curto);
                return (
                  <ListItem
                    key={s.codigo}
                    label={s.nome}
                    startContent={<StatusDot variant={bf === 0 ? 'error' : 'warning'}
                                             label={bf === 0 ? 'Descoberta' : 'Bus factor 1'} />}
                    endContent={<Text type="supporting">{bf} pessoa(s) em ≥3</Text>}
                    description={
                      <HStack gap={1} wrap="wrap" vAlign="center">
                        <Token size="sm" color="gray" label={s.categoria} />
                        {s.critica && <Token size="sm" color="red" label="crítica" />}
                        {donos.length > 0 && <Token size="sm" color="blue" label={donos[0].curto} />}
                        <Text type="supporting">
                          {candidatos.length
                            ? `mais perto: ${candidatos.join(', ')}`
                            : 'ninguém em nível 2 para suceder'}
                        </Text>
                      </HStack>
                    }
                  />
                );
              })}
            </List>
          </Card>
        </VStack>
      )}

      {aba === 'gaps' && (
        <VStack gap={2}>
          <Banner
            status="info"
            title="O gap é o dado mais útil da matriz"
            description="É onde mora a conversa: a pessoa se vê diferente de como você a vê. Gap ≥ 2 vira pauta obrigatória — e quem arbitra é a evidência, não a hierarquia."
          />
          <Card padding={0}>
            <List density="balanced" hasDividers>
              {gaps.map((g) => {
                const skill = SKILLS.find((s) => s.codigo === g.cod)!;
                return (
                  <ListItem
                    key={`${g.slug}-${g.cod}`}
                    label={`${g.pessoa} · ${skill.nome}`}
                    startContent={<StatusDot
                      variant={Math.abs(g.gap) >= 2 ? 'error' : 'warning'}
                      label={`Gap de ${Math.abs(g.gap)}`} />}
                    endContent={<Text type="supporting" hasTabularNumbers>
                      líder {g.lider} · auto {g.auto}
                    </Text>}
                    description={
                      <HStack gap={1} wrap="wrap" vAlign="center">
                        <Token size="sm" color={Math.abs(g.gap) >= 2 ? 'red' : 'orange'}
                               label={g.gap > 0 ? `superestima ${g.gap}` : `subestima ${-g.gap}`} />
                        {Math.abs(g.gap) >= 2 && (
                          <Token size="sm" color="red" label="pauta obrigatória" />
                        )}
                      </HStack>
                    }
                  />
                );
              })}
            </List>
          </Card>
        </VStack>
      )}
    </Page>
  );
}
