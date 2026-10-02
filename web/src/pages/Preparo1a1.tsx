/**
 * Preparação de 1:1 — a tela que justifica o produto.
 *
 * Aqui fica só o frame: cabeçalho da pessoa, as duas abas e o estado. O
 * conteúdo está em `./preparo/` — a pauta, o material de apoio e a trava do
 * que não falar.
 *
 * Regras do Astryx seguidas em todo o módulo: sem <div> e sem style={{}};
 * dados densos são linhas, nunca itens de lista embrulhados em Card; status é
 * StatusDot com rótulo em texto; Text usa `type`, não `variant`.
 */

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Banner } from '@astryxdesign/core/Banner';
import { Selector } from '@astryxdesign/core/Selector';
import { TabList, Tab } from '@astryxdesign/core/TabList';

import { AbaPauta } from './preparo/AbaPauta';
import { AbaMaterial } from './preparo/AbaMaterial';
import { SLUG_PADRAO } from './preparo/constantes';
import {
  HOJE, TIMES, COMPROMISSOS, TEMAS, NOVIDADES, DNA, PESSOAS, PAUTA,
  porSlug, montarPauta, diasEntre,
} from '../data/mock';

export default function Preparo1a1() {
  const [SLUG, setSlug] = useState(SLUG_PADRAO);
  const [aba, setAba] = useState('pauta');
  const [duracao, setDuracao] = useState(45);
  const [descartados, setDescartados] = useState<Set<string>>(new Set());

  // O motivo do descarte é o que alimenta a malha de aprendizado do motor:
  // sem motivo registrado, ele não aprende nada.
  const onDescartar = (id: string, motivo: string) => {
    console.log(`[motor de pauta] assunto ${id} descartado — motivo: ${motivo}`);
    setDescartados(new Set(descartados).add(id));
  };

  const p = porSlug(SLUG);
  const dna = DNA[SLUG];
  const dias = diasEntre(p.ultima1a1, HOJE);
  const r = montarPauta(SLUG, duracao, descartados);

  // Nem todo mundo tem pauta ainda: o motor só produz com 1:1 processada.
  // Dizer isso é melhor que mostrar uma tela vazia sem explicação.
  const temDados = (PAUTA[SLUG]?.length ?? 0) > 0;

  // Ordem do seletor: quem está mais perto de estourar a cadência primeiro —
  // é por onde a preparação costuma começar.
  const opcoes = PESSOAS
    .filter((x) => x.status === 'ativo' || x.status === 'afastado')
    .map((x) => ({ x, atraso: diasEntre(x.ultima1a1, HOJE) }))
    .sort((a, b) => b.atraso - a.atraso)
    .map(({ x, atraso }) => ({
      value: x.slug,
      label: x.nome,
      description: `${x.cargo} · última 1:1 há ${atraso} dias`,
    }));

  const vencidos = COMPROMISSOS.filter(
    (c) => c.pessoa === SLUG && c.status !== 'concluido'
        && c.prazoDate && diasEntre(c.prazoDate, HOJE) > 0);
  const meusVencidos = vencidos.filter((c) => c.responsavel === 'coordenador').length;

  return (
    // Coluna centrada: VStack externo alinha, o interno limita a largura.
    <VStack hAlign="center" padding={4}>
      <VStack gap={3} width="100%" maxWidth={960}>
        {/* Seletor antes de tudo: a primeira decisão da tela é com quem. */}
        <HStack gap={2} vAlign="end" wrap="wrap">
          <Selector
            label="Preparar 1:1 com"
            value={SLUG}
            onChange={(v) => v && setSlug(v)}
            options={opcoes}
            hasSearch
            searchPlaceholder="Buscar liderado…"
          />
          <Text type="supporting">
            ordenado por quem está há mais tempo sem conversa
          </Text>
        </HStack>

        <Card padding={3}>
          <VStack gap={1.5}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Heading level={1}>{p.nome}</Heading>
              <Token size="sm" color="blue" label={p.quadrante ?? 'fora do ciclo'} />
              {p.status === 'afastado' && (
                <Token size="sm" color="orange" label="afastado" />
              )}
            </HStack>
            <Text type="supporting">
              {p.cargo}{p.techLead ? ' · Tech Lead' : ''} · {TIMES[p.time].nome}
            </Text>
            <HStack gap={3} wrap="wrap" vAlign="center">
              <Text type="supporting">Última 1:1 há {dias} dias</Text>
              {p.trajetoria.length > 0 && (
                <Text type="supporting">
                  Trajetória 2026: {p.trajetoria.map((x) => (x === 'af' ? '—' : x)).join(' · ')}
                </Text>
              )}
              {dna && (
                <Text type="supporting">
                  Prefere feedback {dna.prefFeedback} · reconhecimento {dna.prefReconhecimento}
                </Text>
              )}
            </HStack>
          </VStack>
        </Card>

        {!temDados && (
          <Banner
            status="info"
            title="Ainda não há pauta gerada para esta pessoa"
            description="O motor precisa de 1:1 processada para produzir assuntos. Processe as transcrições em Importações e a pauta aparece aqui."
          />
        )}

        <TabList value={aba} onChange={setAba} role="tablist" hasDivider>
          <Tab value="pauta" label={`Pauta (${r.dentro.length})`} />
          <Tab value="material" label="Material de apoio" />
        </TabList>

        {/* Atalho para o material não sumir atrás do clique. */}
        {aba === 'pauta' && (
          <Banner
            status={meusVencidos > 0 ? 'warning' : 'info'}
            title={`${vencidos.length} compromissos vencidos${meusVencidos ? `, ${meusVencidos} seu(s)` : ''}`}
            description={`${TEMAS[SLUG]?.ausentes.length ?? 0} temas ausentes · ${NOVIDADES[SLUG]?.length ?? 0} novidades desde a última`}
            endContent={<Button size="sm" variant="ghost" label="Ver material de apoio"
                                onClick={() => setAba('material')} />}
          />
        )}

        {aba === 'pauta'
          ? <AbaPauta SLUG={SLUG} duracao={duracao} setDuracao={setDuracao}
                      descartados={descartados} onDescartar={onDescartar} />
          : <AbaMaterial SLUG={SLUG} />}
      </VStack>
    </VStack>
  );
}
