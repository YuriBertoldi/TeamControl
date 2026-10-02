/**
 * Aba Material de apoio — a matéria-prima da conversa.
 *
 * Fica atrás de um clique porque não se lê durante a 1:1; se lê antes, ou
 * quando você quer conferir de onde um assunto da pauta saiu.
 */

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Token } from '@astryxdesign/core/Token';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { List, ListItem } from '@astryxdesign/core/List';

import { Conf, Ev } from '../../app/ui';
import {
  COMPROMISSOS, TEMAS, SKILLS_GAP, NOVIDADES, DNA, PROXIMA_CONVERSA,
  HOJE, diasEntre, dataBR, type Compromisso,
} from '../../data/mock';


export function AbaMaterial({ SLUG }: { SLUG: string }) {
  const meus = COMPROMISSOS.filter(
    (c) => c.pessoa === SLUG && c.responsavel === 'coordenador' && c.status !== 'concluido');
  const dele = COMPROMISSOS.filter(
    (c) => c.pessoa === SLUG && c.responsavel !== 'coordenador' && c.status !== 'concluido');

  return (
    <VStack gap={3}>
      <Card padding={3}>
        <VStack gap={2}>
          <Heading level={3}>O que EU prometi</Heading>
          <Text type="supporting">
            {meus.length} em aberto — nenhum deles tem quem cobre além de você
          </Text>
          <List density="compact" hasDividers>
            {meus.map((c) => <CompromissoRow key={c.id} c={c} />)}
          </List>
        </VStack>
      </Card>

      <Card padding={3}>
        <VStack gap={2}>
          <Heading level={3}>O que ficou com ele</Heading>
          <List density="compact" hasDividers>
            {dele.map((c) => <CompromissoRow key={c.id} c={c} />)}
          </List>
        </VStack>
      </Card>

      <Temas SLUG={SLUG} />
      <ProximaConversa SLUG={SLUG} />
      <Skills SLUG={SLUG} />
      <Novidades SLUG={SLUG} />
      <Pessoa SLUG={SLUG} />
    </VStack>
  );
}

function CompromissoRow({ c }: { c: Compromisso }) {
  const atraso = c.prazoDate ? diasEntre(c.prazoDate, HOJE) : null;
  const vencido = atraso !== null && atraso > 0 && c.status !== 'concluido';

  return (
    <ListItem
      label={c.descricao}
      startContent={
        <StatusDot
          variant={c.status === 'concluido' ? 'success' : vencido ? 'error' : 'neutral'}
          label={c.status === 'concluido' ? 'Concluído' : vencido ? 'Vencido' : 'Em aberto'}
        />
      }
      description={
        <HStack gap={1} wrap="wrap" vAlign="center">
          {c.responsavel !== 'coordenador' && <Token size="sm" label={c.nomeResp} />}
          {vencido && <Token size="sm" color="red" label={`vencido há ${atraso} dias`} />}
          {!vencido && atraso !== null && atraso > -7 && c.status !== 'concluido' && (
            <Token size="sm" color="orange" label={`vence em ${-atraso} dias`} />
          )}
          {c.prazoVago && <Token size="sm" color="orange" label="prazo vago" />}
          {c.herdado >= 2 && <Token size="sm" color="orange" label={`herdado ${c.herdado}×`} />}
          <Text type="supporting">
            prazo original: “{c.prazoTexto}” · 1:1 de {dataBR(c.origemMeeting)}
          </Text>
        </HStack>
      }
    />
  );
}

function Temas({ SLUG }: { SLUG: string }) {
  const t = TEMAS[SLUG];
  if (!t) return null;
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <Heading level={3}>Temas recorrentes</Heading>
        <List density="compact" hasDividers>
          {t.recorrentes.map((x) => (
            <ListItem
              key={x.tema}
              label={x.tema}
              startContent={<StatusDot variant="warning" label="Recorrente" />}
              description={
                <VStack gap={1}>
                  <HStack gap={1} wrap="wrap" vAlign="center">
                    <Token size="sm" color="orange"
                           label={`${x.ocorrencias} das últimas ${x.janela}`} />
                    <Ev refs={x.refs} />
                  </HStack>
                  <Text type="supporting">{x.nota}</Text>
                </VStack>
              }
            />
          ))}
        </List>

        <Divider label="ausentes" />
        <Text type="supporting">O que você cobra e não apareceu</Text>
        <List density="compact" hasDividers>
          {t.ausentes.map((x) => (
            <ListItem
              key={x.tema}
              label={x.tema}
              startContent={<StatusDot variant="neutral" label="Ausente" />}
              description={
                <HStack gap={1} wrap="wrap" vAlign="center">
                  <Token size="sm" label={`sem menção há ${x.conversasSem} conversa(s)`} />
                  <Text type="supporting">
                    {x.ultimo ? `último: ${dataBR(x.ultimo)}` : 'nunca registrado no ciclo'}
                    {x.nota ? ` · ${x.nota}` : ''}
                  </Text>
                </HStack>
              }
            />
          ))}
        </List>
      </VStack>
    </Card>
  );
}

function ProximaConversa({ SLUG }: { SLUG: string }) {
  const pc = PROXIMA_CONVERSA[SLUG];
  if (!pc) return null;
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <Heading level={3}>“Para a próxima conversa”</Heading>
        <Text type="supporting">
          literal da ata de {dataBR(pc.dataOrigem)} — foi combinado, não sugerido
        </Text>
        <List density="compact" listStyle="disc">
          {pc.itens.map((i) => <ListItem key={i} label={i} />)}
        </List>
      </VStack>
    </Card>
  );
}

function Skills({ SLUG }: { SLUG: string }) {
  const skills = SKILLS_GAP[SLUG];
  if (!skills?.length) return null;
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <Heading level={3}>Skills</Heading>
        <Text type="supporting">só o que mudou e o que incomoda</Text>
        <List density="compact" hasDividers>
          {skills.map((s) => {
            const gap = Math.abs(s.lider - s.auto);
            return (
              <ListItem
                key={s.skill}
                label={s.skill}
                endContent={<Text type="supporting" hasTabularNumbers>
                  líder {s.lider} · auto {s.auto} · alvo {s.alvo}
                </Text>}
                description={
                  <HStack gap={1} wrap="wrap" vAlign="center">
                    {gap >= 2 && s.gapConversado === false &&
                      <Token size="sm" color="red" label={`gap ${gap} — pauta obrigatória`} />}
                    {gap === 1 && s.gapConversado === false &&
                      <Token size="sm" color="orange" label={`gap ${gap} não conversado`} />}
                    {s.novo && <Token size="sm" color="green" label="evidência nova" />}
                    {s.busFactor === 1 && <Token size="sm" color="red" label="único em nível 4" />}
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

function Novidades({ SLUG }: { SLUG: string }) {
  const novidades = NOVIDADES[SLUG];
  if (!novidades?.length) return null;
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <Heading level={3}>Desde a última conversa</Heading>
        <List density="compact" hasDividers>
          {novidades.map((n) => (
            <ListItem
              key={n.texto}
              label={n.texto}
              startContent={<StatusDot
                variant={n.tipo === 'alerta' ? 'error' : n.tipo === 'cruzado' ? 'accent' : 'success'}
                label={n.tipo} />}
              description={
                <HStack gap={1} wrap="wrap" vAlign="center">
                  <Token size="sm" label={n.tipo} />
                  <Conf nivel={n.conf} />
                  <Text type="supporting">
                    {dataBR(n.data)}{n.origem ? ` · ${n.origem}` : ''}
                  </Text>
                  {n.ref && <Ev refs={[n.ref]} />}
                </HStack>
              }
            />
          ))}
        </List>
      </VStack>
    </Card>
  );
}

function Pessoa({ SLUG }: { SLUG: string }) {
  const dna = DNA[SLUG];
  if (!dna) return null;
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Heading level={3}>Pessoa</Heading>
          <Text type="supporting">declarado em {dataBR(dna.atualizadoEm)}</Text>
          <Conf nivel={3} />
        </HStack>
        <Text type="body">
          <Text type="label">Âncora primária</Text> {dna.ancoraPrimaria} ·{' '}
          <Text type="label">secundária</Text> {dna.ancoraSecundaria} ·{' '}
          <Text type="label">rejeita</Text> {dna.ancoraRejeitada}
        </Text>
        <Text type="body"><Text type="label">Aspiração</Text> “{dna.aspiracao}”</Text>
        <HStack gap={1} wrap="wrap">
          {dna.motivadoresTop3.map((m) => (
            <Token key={m.nome} size="sm"
                   color={m.atendimento === 'atendido' ? 'green'
                        : m.atendimento === 'parcial' ? 'orange' : 'red'}
                   label={`${m.nome}: ${m.atendimento}`} />
          ))}
        </HStack>
        <Banner
          status="info"
          title={`${dna.sinaisNaoCurados.length} sinal não curado aguardando sua decisão`}
          description={`Hipótese da IA, não fato: “${dna.sinaisNaoCurados[0].texto}”`}
        />
      </VStack>
    </Card>
  );
}
