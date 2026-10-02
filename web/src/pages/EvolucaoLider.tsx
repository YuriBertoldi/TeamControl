/**
 * Evolução do líder — a sua devolutiva, não a dos liderados.
 *
 * Centraliza o que vem de três lugares que hoje não conversam: o que os
 * liderados trouxeram nas 1:1, o que responderam na avaliação de liderança
 * (anônima) e o que o seu líder respondeu na sua AVD.
 *
 * O valor está no cruzamento. Um tema que aparece numa fonte é um relato; o
 * mesmo tema em três fontes é um padrão — e padrão você trata, não explica.
 */

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { Selector } from '@astryxdesign/core/Selector';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Check, CircleSlash, PenLine } from 'lucide-react';

import { Page, Filtros, Stats, Conf, Ev } from '../app/ui';
import { ListaDetalhe, Detalhe, Bloco, type LinhaEnxuta } from '../app/ListaDetalhe';
import {
  ITENS, ORIGEM_ROTULO, STATUS_ROTULO, temasConvergentes,
  type ItemEvolucao, type OrigemItem, type StatusItem,
} from '../data/mockLider';
import { dataBR } from '../data/mock';

const COR_ORIGEM: Record<OrigemItem, 'green' | 'purple' | 'blue' | 'gray'> = {
  um_a_um: 'green', avd_lideranca: 'purple', avd_meu_lider: 'blue', auto: 'gray',
};
const DOT_STATUS = {
  aberto: 'error', em_andamento: 'warning', resolvido: 'success', nao_vou_mudar: 'neutral',
} as const;
const COR_STATUS = {
  aberto: 'red', em_andamento: 'orange', resolvido: 'green', nao_vou_mudar: 'gray',
} as const;

interface Linha extends LinhaEnxuta { i: ItemEvolucao }

export default function EvolucaoLider() {
  const [aba, setAba] = useState('todos');
  const [status, setStatus] = useState('');
  const [tema, setTema] = useState('');

  const convergentes = useMemo(() => temasConvergentes(ITENS), []);
  const temasConv = new Set(convergentes.map((c) => c.tema));
  const temas = [...new Set(ITENS.map((i) => i.tema))].sort();

  const base = aba === 'todos' ? ITENS : ITENS.filter((i) => i.origem === aba);

  const linhas: Linha[] = base
    .filter((i) => (!status || i.status === status) && (!tema || i.tema === tema))
    .sort((a, b) => b.recorrencia - a.recorrencia)
    .map((i) => ({
      id: i.id,
      titulo: i.tema,
      dot: DOT_STATUS[i.status],
      dotLabel: STATUS_ROTULO[i.status],
      marcadores: [
        { texto: ORIGEM_ROTULO[i.origem].split(' (')[0], cor: COR_ORIGEM[i.origem] },
        ...(temasConv.has(i.tema)
          ? [{ texto: 'convergente', cor: 'red' as const }]
          : i.recorrencia > 1
          ? [{ texto: `${i.recorrencia}×`, cor: 'orange' as const }]
          : []),
      ],
      valor: dataBR(i.data).slice(0, 5),
      i,
    }));

  const abertos = ITENS.filter((i) => i.status === 'aberto');
  const semAcao = ITENS.filter((i) => !i.acao && i.status !== 'resolvido');
  const porOrigem = (o: OrigemItem) => ITENS.filter((i) => i.origem === o).length;

  return (
    <Page
      titulo="Evolução do líder"
      subtitulo="O que o time e a sua liderança dizem sobre você — e o que você fez com isso"
      largura={1240}
    >
      <Stats itens={[
        { valor: ITENS.length, rotulo: 'itens no ciclo' },
        { valor: abertos.length, rotulo: 'abertos', cor: 'red' },
        { valor: convergentes.length, rotulo: 'temas convergentes', cor: 'red' },
        { valor: semAcao.length, rotulo: 'sem ação definida', cor: semAcao.length ? 'red' : undefined },
        { valor: ITENS.filter((i) => i.status === 'resolvido').length, rotulo: 'resolvidos' },
      ]} />

      {convergentes.length > 0 && (
        <Banner
          status="error"
          title={`${convergentes.length} temas aparecem em mais de uma fonte`}
          description={convergentes
            .map((c) => `${c.tema} (${c.origens.length} fontes)`)
            .join(' · ') + '. Um relato é relato; o mesmo tema em fontes independentes é padrão.'}
        />
      )}

      {semAcao.length > 0 && (
        <Banner
          status="warning"
          title={`${semAcao.length} itens sem ação definida`}
          description="Item que você ouviu e não transformou em decisão é item engavetado. Decidir não mudar também é decisão — e é honesto registrar."
        />
      )}

      <TabList value={aba} onChange={setAba} hasDivider>
        <Tab value="todos" label={`Todos (${ITENS.length})`} />
        <Tab value="um_a_um" label={`Trazido nas 1:1 (${porOrigem('um_a_um')})`} />
        <Tab value="avd_lideranca" label={`Avaliação de liderança (${porOrigem('avd_lideranca')})`} />
        <Tab value="avd_meu_lider" label={`Minha AVD (${porOrigem('avd_meu_lider')})`} />
        <Tab value="auto" label={`Autoavaliação (${porOrigem('auto')})`} />
      </TabList>

      <Filtros resultado={`${linhas.length} de ${base.length}`}>
        <Selector label="Status" size="sm" variant="ghost" placeholder="Qualquer status"
                  value={status} onChange={(v) => setStatus(v ?? '')} hasClear
                  options={(Object.keys(STATUS_ROTULO) as StatusItem[])
                    .map((s) => ({ value: s, label: STATUS_ROTULO[s] }))} />
        <Selector label="Tema" size="sm" variant="ghost" placeholder="Todos os temas"
                  value={tema} onChange={(v) => setTema(v ?? '')} hasClear hasSearch
                  options={temas.map((t) => ({ value: t, label: t }))} />
        {(status || tema) && (
          <Button size="sm" variant="ghost" label="Limpar"
                  onClick={() => { setStatus(''); setTema(''); }} />
        )}
      </Filtros>

      <Card padding={0}>
        <ListaDetalhe
          itens={linhas}
          larguraPainel={460}
          vazio="Nenhum item com esses filtros."
          detalhe={(l) => {
            const i = l.i;
            const outras = ITENS.filter((x) => x.tema === i.tema && x.id !== i.id);
            return (
              <Detalhe
                titulo={i.tema}
                marcadores={
                  <>
                    <Token size="sm" color={COR_ORIGEM[i.origem]} label={ORIGEM_ROTULO[i.origem]} />
                    <Token size="sm" color={COR_STATUS[i.status]} label={STATUS_ROTULO[i.status]} />
                    <Conf nivel={i.conf} />
                  </>
                }
              >
                <VStack gap={2}>
                  <Bloco rotulo="Quem trouxe">
                    {i.pessoa ?? 'Anônimo — a avaliação de liderança não identifica o respondente, e é isso que torna o canal seguro.'}
                  </Bloco>

                  <Bloco rotulo="O que foi dito">
                    <VStack gap={1}>
                      <Text type="body">{i.texto}</Text>
                      {i.ref && <Ev refs={[i.ref]} />}
                      <Text type="supporting">{dataBR(i.data)}</Text>
                    </VStack>
                  </Bloco>

                  {i.acao ? (
                    <Bloco rotulo="O que decidi fazer">
                      <Text type="body" weight="medium">{i.acao}</Text>
                    </Bloco>
                  ) : (
                    <Banner
                      status="warning"
                      title="Sem ação definida"
                      description="Escreva o que vai fazer — ou registre que decidiu não mudar e por quê."
                    />
                  )}

                  {outras.length > 0 && (
                    <>
                      <Divider />
                      <Bloco rotulo={`O mesmo tema em outras ${outras.length} fonte(s)`}>
                        <VStack gap={1}>
                          {outras.map((o) => (
                            <HStack key={o.id} gap={1} wrap="wrap" vAlign="center">
                              <Token size="sm" color={COR_ORIGEM[o.origem]}
                                     label={ORIGEM_ROTULO[o.origem].split(' (')[0]} />
                              <Text type="supporting">{dataBR(o.data)}</Text>
                            </HStack>
                          ))}
                          <Text type="supporting">
                            Convergência entre fontes independentes é o sinal mais forte que esta
                            tela produz.
                          </Text>
                        </VStack>
                      </Bloco>
                    </>
                  )}

                  <Divider />
                  <HStack gap={1} wrap="wrap">
                    <Button icon={<Check size={14} />} size="sm" variant="primary" label="Marcar resolvido" />
                    <Button icon={<PenLine size={14} />} size="sm" variant="ghost" label="Definir ação" />
                    <Button icon={<CircleSlash size={14} />} size="sm" variant="ghost" label="Não vou mudar" />
                  </HStack>
                </VStack>
              </Detalhe>
            );
          }}
        />
      </Card>
    </Page>
  );
}
