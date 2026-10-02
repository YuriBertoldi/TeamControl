/**
 * Registros de 1:1 e feedbacks — o acervo por pessoa.
 *
 * É a tela que faltava: o histórico existia em 28 arquivos soltos e não tinha
 * nenhuma superfície no sistema. Sem ela, "o que conversamos nos últimos seis
 * meses" só se responde relendo `.md`.
 *
 * Cada registro tem até três partes com confidencialidade própria, e a tela
 * mostra isso explicitamente — a Parte 1 é a única que você entrega à pessoa.
 * O bloco "omitido de propósito" aparece como CONTAGEM e motivo, nunca como
 * conteúdo: saber que sete itens foram cortados muda como você lê o resto.
 */

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { MessagesSquare, FileDown, FilterX, UserSearch } from 'lucide-react';

import { Page, Filtros, Stats, Conf, corDaCadeira, rotuloCargo } from '../app/ui';
import { ListaDetalhe, Detalhe, Bloco, type LinhaEnxuta, type DotVariant } from '../app/ListaDetalhe';
import { PESSOAS, souMeus, porSlug, nivelDe, HOJE, diasEntre, dataBR } from '../data/mock';
import { REGISTROS, FEEDBACKS, type Registro1a1 } from '../data/registros';
import { useNavegacao } from '../app/navegacao';

const ROTULO_PARTE: Record<string, string> = {
  compartilhavel: 'Parte 1 · compartilhável',
  privado_coordenador: 'Parte 2 · privado',
  avaliacao_1a1: 'Avaliação da portal de avaliação',
};

const registrosDe = (slug: string) =>
  REGISTROS.filter((r) => r.slug === slug).sort((a, b) => b.data.localeCompare(a.data));

const feedbacksDe = (slug: string) =>
  FEEDBACKS.filter((f) => f.slug === slug).sort((a, b) => b.data.localeCompare(a.data));

interface LinhaPessoa extends LinhaEnxuta { slug: string }

export default function Registros() {
  const [aba, setAba] = useState('pessoa');

  const comRegistro = new Set(REGISTROS.map((r) => r.slug));
  const semRegistro = souMeus().filter((p) => !comRegistro.has(p.slug));

  const totalEnc = REGISTROS.reduce((s, r) => s + r.encaminhamentos, 0);
  const vagos = REGISTROS.reduce((s, r) => s + r.prazosVagos, 0);
  const meus = REGISTROS.reduce((s, r) => s + r.meus, 0);

  return (
    <Page
      titulo="Registros de 1:1"
      subtitulo={`${REGISTROS.length} conversas registradas de ${comRegistro.size} pessoas · ${FEEDBACKS.length} feedback avulso`}
      largura={1240}
    >
      <Stats itens={[
        { valor: REGISTROS.length, rotulo: 'registros' },
        { valor: comRegistro.size, rotulo: 'pessoas com histórico' },
        { valor: semRegistro.length, rotulo: 'sem nenhum registro',
          cor: semRegistro.length ? 'red' : undefined },
        { valor: totalEnc, rotulo: 'encaminhamentos' },
        { valor: vagos, rotulo: 'com prazo vago', cor: vagos ? 'red' : undefined },
        { valor: meus, rotulo: 'que são seus', cor: meus ? 'orange' : undefined },
      ]} />

      {vagos === totalEnc && totalEnc > 0 && (
        <Banner
          status="warning"
          title={`Os ${totalEnc} encaminhamentos têm prazo textual, nenhum tem data`}
          description={'"Imediato", "Próximas semanas", "Até a próxima 1:1" — nada disso é computável, e por isso não há como responder o que está vencido hoje. Converter prazo em data na curadoria do pós-1:1 é o que destrava o board de compromissos.'}
        />
      )}

      {semRegistro.length > 0 && (
        <Banner
          status="error"
          title={`${semRegistro.length} pessoas sem nenhum registro de 1:1`}
          description={`${semRegistro.map((p) => p.curto).join(', ')} — sem histórico não há o que levar para a calibragem nem do que o motor de pauta partir.`}
        />
      )}

      <TabList value={aba} onChange={setAba} hasDivider>
        <Tab value="pessoa" label="Por pessoa" />
        <Tab value="todos" label={`Todos os registros (${REGISTROS.length})`} />
        <Tab value="feedbacks" label={`Feedbacks (${FEEDBACKS.length})`} />
      </TabList>

      {aba === 'pessoa' && <PorPessoa />}
      {aba === 'todos' && <TodosRegistros />}
      {aba === 'feedbacks' && <BancoFeedbacks />}
    </Page>
  );
}

/* ---------- por pessoa ---------- */

function PorPessoa() {
  const { abrirPessoa } = useNavegacao();
  const [busca, setBusca] = useState('');
  const [situacao, setSituacao] = useState('');

  const linhas: LinhaPessoa[] = souMeus().filter((p) => {
    if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase())) return false;
    const regs = registrosDe(p.slug);
    const dias = regs[0] ? diasEntre(regs[0].data, HOJE) : Infinity;
    if (situacao === 'sem' && regs.length > 0) return false;
    if (situacao === 'atrasado' && dias <= 60) return false;
    if (situacao === 'feedback' && feedbacksDe(p.slug).length === 0) return false;
    if (situacao === 'meus' && regs.every((r) => r.meus === 0)) return false;
    return true;
  }).map((p) => {
    const regs = registrosDe(p.slug);
    const fbs = feedbacksDe(p.slug);
    const dias = regs[0] ? diasEntre(regs[0].data, HOJE) : null;
    return {
      id: p.slug,
      slug: p.slug,
      titulo: p.nome,
      dot: (regs.length === 0 ? 'error' : (dias ?? 0) > 60 ? 'warning' : 'success') as DotVariant,
      dotLabel: regs.length === 0
        ? 'Sem registro'
        : `Último há ${dias} dias`,
      marcadores: [
        { texto: rotuloCargo(p), cor: corDaCadeira(p.familia, nivelDe(p)) },
        ...(fbs.length ? [{ texto: `${fbs.length} feedback`, cor: 'purple' as const }] : []),
      ],
      valor: `${regs.length} reg.`,
    };
  // Quem tem menos histórico primeiro: é onde o buraco dói.
  }).sort((a, b) => parseInt(a.valor!) - parseInt(b.valor!));

  const temFiltro = !!(busca || situacao);

  return (
    <VStack gap={2}>
      <Filtros resultado={`${linhas.length} de ${souMeus().length}`}>
        <TextInput label="Buscar pessoa" size="sm" placeholder="nome do liderado"
                   value={busca} onChange={setBusca} />
        <Selector label="Situação" size="sm" variant="ghost" placeholder="Qualquer situação"
                  value={situacao} onChange={(v) => setSituacao(v ?? '')} hasClear
                  options={[
                    { value: 'sem', label: 'Sem nenhum registro',
                      description: 'nada para levar à calibragem' },
                    { value: 'atrasado', label: 'Último registro há mais de 60 dias',
                      description: 'fora da cadência combinada' },
                    { value: 'meus', label: 'Com encaminhamento meu',
                      description: 'o que mais morre em silêncio' },
                    { value: 'feedback', label: 'Com feedback avulso' },
                  ]} />
        {temFiltro && (
          <Button icon={<FilterX size={14} />} size="sm" variant="ghost" label="Limpar"
                  onClick={() => { setBusca(''); setSituacao(''); }} />
        )}
      </Filtros>

      <Card padding={0}>
        <ListaDetalhe
          itens={linhas}
          larguraPainel={520}
          vazio="Nenhuma pessoa com esses filtros."
          detalhe={(l) => (
            <VStack gap={2}>
              <Button icon={<UserSearch size={14} />} size="sm" variant="primary"
                      label="Abrir perfil completo" onClick={() => abrirPessoa(l.slug)} />
              <TimelineDaPessoa slug={l.slug} />
            </VStack>
          )}
        />
      </Card>
    </VStack>
  );
}

function TimelineDaPessoa({ slug }: { slug: string }) {
  const p = porSlug(slug);
  const regs = registrosDe(slug);
  const fbs = feedbacksDe(slug);

  const enc = regs.reduce((s, r) => s + r.encaminhamentos, 0);
  const meus = regs.reduce((s, r) => s + r.meus, 0);
  const omit = regs.reduce((s, r) => s + r.omitidos, 0);
  const saude = regs.reduce((s, r) => s + r.omitidoSaude, 0);

  // Lacuna entre conversas: o buraco de junho e julho só aparece assim.
  const lacunas = regs.slice(0, -1).map((r, i) => ({
    de: regs[i + 1].data, para: r.data, dias: diasEntre(regs[i + 1].data, r.data),
  })).filter((g) => g.dias > 60);

  return (
    <Detalhe
      titulo={p.nome}
      marcadores={
        <>
          <Token size="sm" color={corDaCadeira(p.familia, nivelDe(p))} label={rotuloCargo(p)} />
          <Token size="sm" color="gray" label={`${regs.length} registros`} />
        </>
      }
    >
      <VStack gap={2}>
        {regs.length === 0 ? (
          <Banner
            status="warning"
            title="Nenhuma 1:1 processada"
            description="A conversa pode ter acontecido e a transcrição não ter virado registro. Confira a fila em Importações."
          />
        ) : (
          <>
            <HStack gap={2} wrap="wrap">
              <Bloco rotulo="Encaminhamentos">
                {`${enc} no total${meus ? ` · ${meus} seus` : ''}`}
              </Bloco>
              <Bloco rotulo="Omitido de propósito">
                {`${omit} itens${saude ? ` · ${saude} de saúde (nível 4)` : ''}`}
              </Bloco>
            </HStack>

            {saude > 0 && (
              <Banner
                status="info"
                title={`${saude} item(ns) de saúde registrados como omitidos`}
                description="O conteúdo não está no sistema e não sai em nenhum relatório, nem para o RH (LGPD art. 11). O que fica registrado é que existe — para você lembrar que cortou, e por quê."
              />
            )}

            {lacunas.map((g) => (
              <Banner
                key={g.para}
                status="warning"
                title={`${g.dias} dias sem registro entre ${dataBR(g.de)} e ${dataBR(g.para)}`}
                description="Ou a conversa não aconteceu, ou aconteceu e não foi processada. As duas coisas custam na hora da AVD."
              />
            ))}

            <Divider label="Conversas" />
            <List density="balanced" hasDividers>
              {regs.map((r) => <LinhaRegistro key={r.arquivo} r={r} />)}
            </List>
          </>
        )}

        {fbs.length > 0 && (
          <>
            <Divider label="Feedbacks avulsos" />
            <List density="compact" hasDividers>
              {fbs.map((f) => (
                <ListItem
                  key={f.arquivo}
                  label={f.titulo}
                  startContent={<StatusDot variant="accent" label="Feedback" />}
                  endContent={<Text type="supporting">{f.data ? dataBR(f.data) : '—'}</Text>}
                  description={<Text type="supporting">{f.arquivo}</Text>}
                />
              ))}
            </List>
          </>
        )}
      </VStack>
    </Detalhe>
  );
}

function LinhaRegistro({ r }: { r: Registro1a1 }) {
  return (
    <ListItem
      label={dataBR(r.data)}
      startContent={<StatusDot
        variant={r.prazosVagos === r.encaminhamentos && r.encaminhamentos > 0 ? 'warning' : 'success'}
        label={`${r.partes.length} partes`} />}
      endContent={<Text type="supporting">{r.duracao}</Text>}
      description={
        <VStack gap={0.5}>
          <Text type="supporting">{r.tema}</Text>
          <HStack gap={0.5} wrap="wrap" vAlign="center">
            {/* Confidencialidade por parte: é o que diz o que pode sair daqui. */}
            {r.partes.map((parte) => (
              <HStack key={parte.formato} gap={0.5} vAlign="center">
                <Conf nivel={parte.conf} />
                <Text type="supporting">{ROTULO_PARTE[parte.formato]}</Text>
              </HStack>
            ))}
          </HStack>
          <HStack gap={0.5} wrap="wrap" vAlign="center">
            {r.performance && (
              <Token size="sm"
                     color={r.performance.startsWith('Excep') ? 'green' : 'blue'}
                     label={`${r.performance}${r.impacto ? ` · impacto ${r.impacto}` : ''}`} />
            )}
            {r.encaminhamentos > 0 && (
              <Token size="sm" color={r.prazosVagos ? 'orange' : 'gray'}
                     label={`${r.encaminhamentos} encaminhamentos${
                       r.prazosVagos ? ` · ${r.prazosVagos} sem data` : ''}`} />
            )}
            {r.meus > 0 && <Token size="sm" color="red" label={`${r.meus} seus`} />}
            {r.omitidos > 0 && (
              <Token size="sm" color="gray" label={`${r.omitidos} omitidos`} />
            )}
            {r.omitidoSaude > 0 && (
              <Token size="sm" color="red" label={`${r.omitidoSaude} saúde`} />
            )}
          </HStack>
          <Text type="supporting">{r.fonte}</Text>
        </VStack>
      }
    />
  );
}

/* ---------- todos ---------- */

function TodosRegistros() {
  const [busca, setBusca] = useState('');
  const [pessoa, setPessoa] = useState('');
  const [mes, setMes] = useState('');

  const meses = [...new Set(REGISTROS.map((r) => r.data.slice(0, 7)))].sort().reverse();

  const visiveis = useMemo(() => REGISTROS
    .filter((r) => {
      if (pessoa && r.slug !== pessoa) return false;
      if (mes && !r.data.startsWith(mes)) return false;
      if (busca && !r.tema.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => b.data.localeCompare(a.data)), [busca, pessoa, mes]);

  const temFiltro = !!(busca || pessoa || mes);

  return (
    <VStack gap={2}>
      <Filtros resultado={`${visiveis.length} de ${REGISTROS.length}`}>
        <TextInput label="Buscar no tema" size="sm" placeholder="palavra do tema"
                   value={busca} onChange={setBusca} />
        <Selector label="Pessoa" size="sm" variant="ghost" placeholder="Todas as pessoas"
                  value={pessoa} onChange={(v) => setPessoa(v ?? '')} hasClear hasSearch
                  options={[...new Set(REGISTROS.map((r) => r.slug))].map((s) => ({
                    value: s,
                    label: PESSOAS.find((p) => p.slug === s)?.nome ?? s,
                    description: `${registrosDe(s).length} registros`,
                  }))} />
        <Selector label="Mês" size="sm" variant="ghost" placeholder="Todos os meses"
                  value={mes} onChange={(v) => setMes(v ?? '')} hasClear
                  options={meses.map((m) => ({
                    value: m,
                    label: m.split('-').reverse().join('/'),
                    description: `${REGISTROS.filter((r) => r.data.startsWith(m)).length} registros`,
                  }))} />
        {temFiltro && (
          <Button icon={<FilterX size={14} />} size="sm" variant="ghost" label="Limpar"
                  onClick={() => { setBusca(''); setPessoa(''); setMes(''); }} />
        )}
      </Filtros>

      <Card padding={0}>
        <List density="balanced" hasDividers>
          {visiveis.map((r) => (
            <ListItem
              key={r.arquivo}
              label={`${dataBR(r.data)} · ${porSlug(r.slug).curto}`}
              startContent={<StatusDot variant="success" label={`${r.partes.length} partes`} />}
              endContent={<Text type="supporting">{r.duracao}</Text>}
              description={
                <VStack gap={0.5}>
                  <Text type="supporting">{r.tema}</Text>
                  <HStack gap={0.5} wrap="wrap" vAlign="center">
                    {r.performance && (
                      <Token size="sm" color={r.performance.startsWith('Excep') ? 'green' : 'blue'}
                             label={r.performance} />
                    )}
                    {r.encaminhamentos > 0 && (
                      <Token size="sm" color="gray" label={`${r.encaminhamentos} encam.`} />
                    )}
                    {r.meus > 0 && <Token size="sm" color="red" label={`${r.meus} seus`} />}
                    {r.omitidos > 0 && (
                      <Token size="sm" color="gray" label={`${r.omitidos} omitidos`} />
                    )}
                  </HStack>
                </VStack>
              }
            />
          ))}
        </List>
      </Card>
    </VStack>
  );
}

/* ---------- feedbacks ---------- */

function BancoFeedbacks() {
  return (
    <VStack gap={2}>
      <Banner
        status="info"
        title="Feedback avulso é evidência que some na hora da AVD"
        description="Hoje existe um único feedback registrado fora da 1:1, numa subpasta solta. É exatamente o tipo de coisa que você lembra que aconteceu e não acha quando precisa defender uma nota — por isso o banco é superfície própria, e não mais um parágrafo de ata."
      />

      <Card padding={0}>
        <List density="balanced" hasDividers>
          {FEEDBACKS.map((f) => {
            const p = PESSOAS.find((x) => x.slug === f.slug);
            return (
              <ListItem
                key={f.arquivo}
                label={f.titulo}
                startContent={<StatusDot variant="accent" label="Feedback" />}
                endContent={<Text type="supporting">{f.data ? dataBR(f.data) : 'sem data'}</Text>}
                description={
                  <HStack gap={1} wrap="wrap" vAlign="center">
                    {p
                      ? <Token size="sm" color={corDaCadeira(p.familia, nivelDe(p))} label={p.nome} />
                      : <Token size="sm" color="orange" label={`pessoa não resolvida: ${f.slug}`} />}
                    <Text type="supporting">{f.arquivo}</Text>
                  </HStack>
                }
              />
            );
          })}
        </List>
      </Card>

      <HStack gap={1} wrap="wrap">
        <Button icon={<MessagesSquare size={14} />} variant="primary"
                label="Registrar feedback agora" />
        <Button icon={<FileDown size={14} />} variant="ghost"
                label="Importar da pasta" />
      </HStack>
    </VStack>
  );
}
