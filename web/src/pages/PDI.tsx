/**
 * PDI.
 *
 * A função mais valiosa desta tela não é o editor sofisticado — é a LISTA DE
 * QUEM NÃO TEM. PDI é tema cobrado nas 1:1s e não existe um único documento na
 * base; um PDI de três objetivos preenchido vale infinitamente mais que um
 * template de vinte campos vazio.
 *
 * Regra do sistema: objetivo sem skill-alvo é recusado. É o que transforma
 * "estudar Go" (incobrável) em "Go/APIs: 1→3 até março, evidenciado por um PR
 * em produção" (cobrável e defensável).
 */

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
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
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Plus } from 'lucide-react';

import { Page, Metrica } from '../app/ui';
import { PESSOAS, HOJE, diasEntre, dataBR } from '../data/mock';
import { PDIS, carregarSkills, DNA_AVISO } from '../data/mockCiclo';
import { DNA } from '../data/mock';

const ativos = PESSOAS.filter((p) => p.status === 'ativo');
const skillNome = (cod?: string) =>
  carregarSkills().find((s) => s.codigo === cod)?.nome ?? '—';

export default function PDI() {
  const [aba, setAba] = useState('sem');

  const comPDI = PDIS.map((p) => p.slug);
  const semPDI = ativos.filter((p) => !comPDI.includes(p.slug));

  const todosMarcos = PDIS.flatMap((p) =>
    p.objetivos.flatMap((o) => o.marcos.map((m) => ({ ...m, slug: p.slug, objetivo: o.titulo }))));
  const vencidos = todosMarcos.filter(
    (m) => m.status !== 'concluido' && diasEntre(m.prazo, HOJE) > 0);
  const vencendo = todosMarcos.filter((m) => {
    const d = diasEntre(m.prazo, HOJE);
    return m.status !== 'concluido' && d <= 0 && d > -30;
  });

  return (
    <Page
      titulo="PDI"
      subtitulo={`${PDIS.length} de ${ativos.length} liderados com plano registrado`}
      acoes={<Button icon={<Plus size={14} />} label="Criar PDI" variant="primary" />}
      largura={1240}
    >
      <HStack gap={2} wrap="wrap">
        <Metrica valor={semPDI.length} rotulo="Sem PDI registrado"
                 nota="é o número que importa aqui" cor="red" />
        <Metrica valor={PDIS.length} rotulo="Com plano" cor="green" />
        <Metrica valor={vencidos.length} rotulo="Marcos vencidos" cor="red" />
        <Metrica valor={vencendo.length} rotulo="Vencem em 30 dias" cor="orange" />
      </HStack>

      <TabList value={aba} onChange={setAba} hasDivider>
        <Tab value="sem" label={`Sem PDI (${semPDI.length})`} />
        <Tab value="planos" label={`Planos (${PDIS.length})`} />
        <Tab value="marcos" label={`Marcos (${todosMarcos.length})`} />
      </TabList>

      {aba === 'sem' && (
        <VStack gap={2}>
          <Banner
            status="error"
            title="PDI é cobrado nas 1:1s e não existe na base"
            description="Comece pelos três objetivos. Um plano curto e preenchido vale mais que um template completo e vazio."
          />
          <Card padding={0}>
            <List density="balanced" hasDividers>
              {semPDI.map((p) => {
                const dna = DNA[p.slug];
                return (
                  <ListItem
                    key={p.slug}
                    label={p.nome}
                    startContent={<StatusDot variant="error" label="Sem PDI" />}
                    endContent={<Button icon={<Plus size={14} />} size="sm" variant="primary" label="Criar PDI" />}
                    description={
                      <HStack gap={1} wrap="wrap" vAlign="center">
                        <Token size="sm" color="gray" label={p.cargo} />
                        {p.quadrante && <Token size="sm" color="blue" label={p.quadrante} />}
                        {dna && <Token size="sm" color="purple"
                                       label={`âncora: ${dna.ancoraPrimaria}`} />}
                      </HStack>
                    }
                  />
                );
              })}
            </List>
          </Card>
        </VStack>
      )}

      {aba === 'planos' && (
        <VStack gap={2}>
          {PDIS.map((plano) => {
            const pessoa = PESSOAS.find((p) => p.slug === plano.slug)!;
            const dna = DNA[plano.slug];
            const marcos = plano.objetivos.flatMap((o) => o.marcos);
            const feitos = marcos.filter((m) => m.status === 'concluido').length;
            return (
              <Card key={plano.slug} padding={4}>
                <VStack gap={2}>
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Heading level={3}>{pessoa.nome}</Heading>
                    <Token size="sm" color="gray" label={plano.ciclo} />
                    <Token size="sm" color={feitos === marcos.length ? 'green' : 'orange'}
                           label={`${feitos}/${marcos.length} marcos`} />
                  </HStack>

                  {plano.objetivos.map((o) => (
                    <VStack key={o.titulo} gap={1.5}>
                      <Divider />
                      <Text type="large" weight="semibold">{o.titulo}</Text>
                      <Text type="supporting">Por quê: {o.porQue}</Text>

                      {dna && DNA_AVISO(o.titulo, dna.ancoraRejeitada) && (
                        <Banner
                          status="warning"
                          title="Coerência com a âncora declarada"
                          description={`A âncora rejeitada desta pessoa é “${dna.ancoraRejeitada}”. Confirme que ela quer este caminho — boa parte do PDI que morre em março foi escrito pelo líder sobre o que o líder acha que a pessoa deveria querer.`}
                        />
                      )}

                      <List density="compact" hasDividers>
                        {o.marcos.map((m) => {
                          const atraso = diasEntre(m.prazo, HOJE);
                          const venc = m.status !== 'concluido' && atraso > 0;
                          return (
                            <ListItem
                              key={m.titulo}
                              label={m.titulo}
                              startContent={<StatusDot
                                variant={m.status === 'concluido' ? 'success'
                                       : venc ? 'error' : 'neutral'}
                                label={m.status === 'concluido' ? 'Concluído'
                                     : venc ? 'Vencido' : 'Em aberto'} />}
                              endContent={<Text type="supporting">{dataBR(m.prazo)}</Text>}
                              description={
                                <HStack gap={1} wrap="wrap" vAlign="center">
                                  <Token size="sm" color="blue"
                                         label={`${skillNome(m.skill)} → nível ${m.nivelAlvo}`} />
                                  {venc && <Token size="sm" color="red"
                                                  label={`${atraso}d de atraso`} />}
                                </HStack>
                              }
                            />
                          );
                        })}
                      </List>
                    </VStack>
                  ))}
                </VStack>
              </Card>
            );
          })}
        </VStack>
      )}

      {aba === 'marcos' && (
        <Card padding={0}>
          <List density="balanced" hasDividers>
            {todosMarcos
              .slice()
              .sort((a, b) => a.prazo.localeCompare(b.prazo))
              .map((m) => {
                const pessoa = PESSOAS.find((p) => p.slug === m.slug)!;
                const atraso = diasEntre(m.prazo, HOJE);
                const venc = m.status !== 'concluido' && atraso > 0;
                return (
                  <ListItem
                    key={`${m.slug}-${m.titulo}`}
                    label={m.titulo}
                    startContent={<StatusDot
                      variant={m.status === 'concluido' ? 'success' : venc ? 'error' : 'neutral'}
                      label={m.status} />}
                    endContent={
                      <VStack gap={0.5} width={120}>
                        <ProgressBar
                          label={`${m.titulo}: progresso`}
                          isLabelHidden
                          value={m.status === 'concluido' ? 100 : m.status === 'em_andamento' ? 50 : 5}
                          variant={venc ? 'error' : m.status === 'concluido' ? 'success' : 'accent'}
                        />
                        <Text type="supporting">{dataBR(m.prazo)}</Text>
                      </VStack>
                    }
                    description={
                      <HStack gap={1} wrap="wrap" vAlign="center">
                        <Token size="sm" color="blue" label={pessoa.curto} />
                        <Token size="sm" color="gray"
                               label={`${skillNome(m.skill)} → ${m.nivelAlvo}`} />
                        {venc && <Token size="sm" color="red" label={`${atraso}d de atraso`} />}
                      </HStack>
                    }
                  />
                );
              })}
          </List>
        </Card>
      )}
    </Page>
  );
}
