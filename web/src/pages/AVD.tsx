/**
 * Ciclo AVD — 9-box e os 14 drivers.
 *
 * O 9-box é uma grade de 9 células com as pessoas dentro, não um gráfico de
 * dispersão: com 13 avaliados os pontos se sobrepõem e ninguém lê. A grade
 * também deixa clicar no quadrante para filtrar.
 *
 * Regra de qualidade do ciclo: driver sem evidência vinculada fica vermelho.
 * Você descobre o buraco em janeiro, não na mesa de calibragem.
 */

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Grid } from '@astryxdesign/core/Grid';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Token } from '@astryxdesign/core/Token';
import { Button } from '@astryxdesign/core/Button';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { List, ListItem } from '@astryxdesign/core/List';
import { Link2, Sparkles } from 'lucide-react';

import { Page, Metrica } from '../app/ui';
import { porSlug, souMeus } from '../data/mock';
import {
  AVD, QUADRANTES_9BOX,
  media, faixa, type AvaliacaoAVD,
} from '../data/mockCiclo';
import { type Ciclo } from '../data/ciclos';
import { useCiclo, SeletorCiclo } from '../app/SeletorCiclo';

const COR_NOTA = ['gray', 'red', 'orange', 'blue', 'green'] as const;

export default function AVDPage() {
  /**
   * Ciclo é escolha, não constante.
   *
   * A tela abria fixa no vigente, o que impedia olhar para trás — e a
   * comparação com o ciclo anterior é metade do valor da AVD. Abrir no
   * vigente continua sendo o padrão; o seletor é que deixa ir para o
   * histórico ou para o que já está planejado.
   */
  const { ciclos, ciclo: CICLO, trocar, bloqueado } = useCiclo();
  const cicloId = CICLO.id;

  /** Índice 0 vazio porque a escala começa em 1, como na portal de avaliação. */
  const ESCALA = ['', ...CICLO.rotulosEscala];

  const [selecionado, setSelecionado] = useState<string>('diego-nunes');
  const [quadranteFiltro, setQuadranteFiltro] = useState<string | null>(null);

  const comMedias = useMemo(() => AVD
    .filter((a) => a.ciclo === cicloId)
    .map((a) => {
      const mc = media(a.comportamento);
      const md = media(a.desempenho);
      return { ...a, mc, md, fc: faixa(mc), fd: faixa(md),
               buracos: a.semEvidenciaComp.length + a.semEvidenciaDesemp.length };
    }), [cicloId]);

  // Ciclo sem avaliação lançada é estado normal, não erro: o de 2027 existe
  // justamente para acumular evidência antes de ter nota.
  const atual = comMedias.find((a) => a.slug === selecionado) ?? comMedias[0];
  const semEvidencia = comMedias.filter((a) => a.buracos > 0);
  const totalBuracos = comMedias.reduce((s, a) => s + a.buracos, 0);

  /**
   * Checagem de coerência: o quadrante declarado tem que bater com as faixas
   * que as notas produzem. Divergência aqui significa que as notas foram
   * ajustadas sem revisar o quadrante — ou o contrário — e a mesa percebe.
   */
  const incoerentes = comMedias.filter((a) => {
    const q = QUADRANTES_9BOX.find((x) => x.nome === a.quadrante);
    return q && (q.comp !== a.fc || q.desemp !== a.fd);
  });
  const gapGrande = comMedias.filter(
    (a) => a.auto && Math.abs(a.auto.comportamento - a.mc) + Math.abs(a.auto.desempenho - a.md) >= 1);

  const naCelula = (comp: string, desemp: string) =>
    comMedias.filter((a) => a.fc === comp && a.fd === desemp);

  return (
    <Page
      titulo="Ciclo AVD"
      subtitulo={`escala ${CICLO.escalaMin} ${
        CICLO.rotulosEscala[0]} → ${CICLO.escalaMax} ${
        CICLO.rotulosEscala.at(-1)} · faixas ${
        CICLO.faixas.map((f) => `${f.rotulo} ${f.min.toFixed(1)}–${f.max.toFixed(1)}`).join(' · ')}`}
      largura={1400}
    >
      <SeletorCiclo ciclos={ciclos} ciclo={CICLO} trocar={trocar}
                    contagem={(c) => {
                      const n = AVD.filter((x) => x.ciclo === c.id).length;
                      return n ? `${n} avaliações` : 'sem avaliação lançada';
                    }} />

      {comMedias.length === 0 && (
        <Banner
          status="info"
          title={`Nenhuma avaliação lançada em ${CICLO.nome}`}
          description={CICLO.status === 'planejado'
            ? 'Ciclo planejado existe para acumular evidência com destino antes de ter nota. Quando a janela abrir, as avaliações aparecem aqui.'
            : 'Este ciclo não tem avaliação registrada no sistema. Se ele já foi fechado, o histórico ainda não foi importado.'}
        />
      )}

      <HStack gap={2} wrap="wrap">
        <Metrica valor={comMedias.length} rotulo="Avaliados"
                 nota={`${souMeus().length - comMedias.length} fora do ciclo`} />
        <Metrica valor={totalBuracos} rotulo="Drivers sem evidência"
                 nota="não feche o ciclo com buraco" cor={totalBuracos ? 'red' : 'green'} />
        <Metrica valor={gapGrande.length} rotulo="Gaps de autoavaliação"
                 nota="risco direto na mesa" cor="orange" />
        <Metrica valor={incoerentes.length} rotulo="Quadrante incoerente"
                 nota="nota não bate com a faixa" cor={incoerentes.length ? 'red' : 'green'} />
        <Metrica valor={comMedias.filter((a) => a.fc === 'Alto' && a.fd === 'Alto').length}
                 rotulo="Estrelas" cor="green" />
      </HStack>

      {incoerentes.length > 0 && (
        <Banner
          status="error"
          title={`${incoerentes.length} avaliação(ões) com quadrante incoerente`}
          description={incoerentes.map((a) =>
            `${porSlug(a.slug).curto}: declarado ${a.quadrante}, mas as notas dão C ${a.fc} · D ${a.fd}`,
          ).join(' · ')}
        />
      )}

      {totalBuracos > 0 && (
        <Banner
          status="warning"
          title={`${totalBuracos} drivers ainda sem evidência vinculada`}
          description={`Concentrados em ${semEvidencia.map((a) => porSlug(a.slug).curto).join(', ')}. Driver sem lastro é o que a mesa derruba.`}
        />
      )}

      <Card padding={3}>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Heading level={3}>9-box</Heading>
            <Text type="supporting">
              linha = comportamento · coluna = desempenho · clique na célula para filtrar
            </Text>
            {quadranteFiltro && (
              <Button size="sm" variant="ghost" label={`Limpar: ${quadranteFiltro}`}
                      onClick={() => setQuadranteFiltro(null)} />
            )}
          </HStack>

          <Grid columns={3} gap={1}>
            {QUADRANTES_9BOX.map((q) => {
              const gente = naCelula(q.comp, q.desemp);
              const destaque = q.comp === 'Alto' && q.desemp === 'Alto';
              const ruim = q.comp === 'Baixo' || q.desemp === 'Baixo';
              return (
                <Card
                  key={q.nome}
                  padding={2}
                  minHeight={128}
                  variant={quadranteFiltro === q.nome ? 'blue'
                         : destaque ? 'green' : ruim ? 'muted' : 'default'}
                >
                  <VStack gap={1}>
                    <HStack gap={1} vAlign="center" wrap="wrap">
                      <Text type="label">{q.nome}</Text>
                      {gente.length > 0 && (
                        <Button size="sm" variant="ghost" label={`${gente.length}`}
                                onClick={() => setQuadranteFiltro(
                                  quadranteFiltro === q.nome ? null : q.nome)} />
                      )}
                    </HStack>
                    <Text type="supporting">C {q.comp} · D {q.desemp}</Text>
                    <HStack gap={0.5} wrap="wrap">
                      {gente.map((a) => (
                        <Token
                          key={a.slug}
                          size="sm"
                          color={a.slug === selecionado ? 'purple' : 'blue'}
                          label={porSlug(a.slug).curto}
                          onClick={() => setSelecionado(a.slug)}
                          endContent={a.buracos > 0
                            ? <Text type="supporting">⚠</Text> : undefined}
                        />
                      ))}
                    </HStack>
                  </VStack>
                </Card>
              );
            })}
          </Grid>
        </VStack>
      </Card>

      {atual && (
        <Card padding={3}>
          <DetalheAvaliacao a={atual} ciclo={CICLO} escala={ESCALA} bloqueado={bloqueado} />
        </Card>
      )}

      {quadranteFiltro && (
        <Card padding={3}>
          <VStack gap={2}>
            <Heading level={3}>{quadranteFiltro}</Heading>
            <List density="compact" hasDividers>
              {comMedias
                .filter((a) => `${a.fc}|${a.fd}` ===
                  `${QUADRANTES_9BOX.find((q) => q.nome === quadranteFiltro)!.comp}|${
                    QUADRANTES_9BOX.find((q) => q.nome === quadranteFiltro)!.desemp}`)
                .map((a) => (
                  <ListItem
                    key={a.slug}
                    label={porSlug(a.slug).nome}
                    startContent={<StatusDot variant={a.buracos ? 'warning' : 'success'}
                                             label={a.buracos ? 'Faltam evidências' : 'Completo'} />}
                    endContent={<Text type="supporting" hasTabularNumbers>
                      C {a.mc.toFixed(2)} · D {a.md.toFixed(2)}
                    </Text>}
                    onClick={() => setSelecionado(a.slug)}
                  />
                ))}
            </List>
          </VStack>
        </Card>
      )}
    </Page>
  );
}

function DetalheAvaliacao({ a, ciclo, escala, bloqueado }: {
  a: AvaliacaoAVD & { mc: number; md: number; fc: string; fd: string; buracos: number };
  ciclo: Ciclo;
  escala: string[];
  bloqueado: boolean;
}) {
  const p = porSlug(a.slug);
  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Heading level={3}>{p.nome}</Heading>
        <Token size="sm" color="blue" label={a.quadrante} />
        <Token size="sm" color="gray" label={`Comportamento ${a.mc.toFixed(2)} (${a.fc})`} />
        <Token size="sm" color="gray" label={`Desempenho ${a.md.toFixed(2)} (${a.fd})`} />
      </HStack>

      {a.auto && (
        <Banner
          status={Math.abs(a.auto.desempenho - a.md) >= 0.8 ? 'error' : 'info'}
          title={`Autoavaliação: C ${a.auto.comportamento.toFixed(2)} · D ${a.auto.desempenho.toFixed(2)}`}
          description={
            Math.abs(a.auto.desempenho - a.md) >= 0.8
              ? 'Divergência grande em relação à leitura do líder. A mesa vai perguntar por quê — leve a trajetória completa e casos concretos.'
              : 'Leituras próximas. Gap pequeno não costuma ser questionado na calibragem.'}
        />
      )}

      <Divider label="Comportamento" />
      <EixoDrivers nomes={ciclo.driversComportamento} notas={a.comportamento} escala={escala}
                   comentarios={a.comentarios} semEvidencia={a.semEvidenciaComp} />

      <Divider label="Desempenho" />
      <EixoDrivers nomes={ciclo.driversDesempenho} notas={a.desempenho} escala={escala}
                   comentarios={{}} semEvidencia={a.semEvidenciaDesemp}
                   offset={ciclo.driversComportamento.length} />

      <Divider />
      <HStack gap={1} wrap="wrap">
        {/* Ciclo encerrado não oferece ação que escreve: a defesa daquele
            ciclo é a que foi levada à mesa, não uma nova gerada hoje. */}
        {!bloqueado && (
          <Button icon={<Sparkles size={14} />} size="sm" variant="primary"
                  label="Gerar defesa de calibragem" />
        )}
        <Button icon={<Link2 size={14} />} size="sm" variant="ghost" label="Ver evidências vinculadas" />
      </HStack>
      <Text type="supporting">
        A nota quem digita é você. A IA propõe faixa, lista evidências e redige a justificativa a
        partir da nota — nunca o contrário.
      </Text>
    </VStack>
  );
}

function EixoDrivers({ nomes, notas, escala, comentarios, semEvidencia, offset = 0 }: {
  nomes: string[]; notas: number[]; escala: string[];
  comentarios: Record<number, string>; semEvidencia: number[]; offset?: number;
}) {
  return (
    <VStack gap={1.5}>
      {nomes.map((nome, i) => {
        const nota = notas[i];
        const buraco = semEvidencia.includes(i);
        return (
          <HStack key={nome} gap={2} vAlign="center" wrap="wrap">
            <VStack width={230}>
              <HStack gap={1} vAlign="center">
                <StatusDot variant={buraco ? 'error' : 'success'}
                           label={buraco ? 'Sem evidência' : 'Com evidência'} />
                <Text type="label">{nome}</Text>
              </HStack>
            </VStack>
            <VStack width={240}>
              <ProgressBar label={`${nome}: ${nota} ${escala[nota]}`} isLabelHidden
                           value={nota} max={4}
                           variant={nota <= 2 ? 'error' : nota === 3 ? 'warning' : 'success'} />
            </VStack>
            <Token size="sm" color={COR_NOTA[nota]} label={`${nota} ${escala[nota]}`} />
            {buraco && <Token size="sm" color="red" label="sem evidência" />}
            {comentarios[i + offset] && (
              <Text type="supporting">{comentarios[i + offset]}</Text>
            )}
          </HStack>
        );
      })}
    </VStack>
  );
}
