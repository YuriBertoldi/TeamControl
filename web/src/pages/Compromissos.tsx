/**
 * Compromissos — o board que hoje não existe em lugar nenhum.
 *
 * Os encaminhamentos vivem dentro de tabelas markdown de atas individuais, com
 * prazo textual ("Imediato", "Próximas semanas"). Aqui ganham data computada,
 * estado e visão agregada. A linha mostra o estado; a origem e o histórico
 * ficam no detalhe.
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
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Divider } from '@astryxdesign/core/Divider';
import { CalendarClock, X } from 'lucide-react';

import { Page, Filtros, Metrica } from '../app/ui';
import { ListaDetalhe, Detalhe, Bloco, type LinhaEnxuta } from '../app/ListaDetalhe';
import { COMPROMISSOS, PESSOAS, HOJE, diasEntre, dataBR, type Compromisso } from '../data/mock';

type Visao = 'vencidos' | 'meus' | 'todos' | 'concluidos';
interface Linha extends LinhaEnxuta { c: Compromisso }

export default function Compromissos() {
  const [visao, setVisao] = useState<Visao>('vencidos');
  const [pessoa, setPessoa] = useState('');
  const [busca, setBusca] = useState('');
  const [concluidos, setConcluidos] = useState<Set<number>>(new Set());

  const atraso = (c: Compromisso) => (c.prazoDate ? diasEntre(c.prazoDate, HOJE) : null);
  const feito = (c: Compromisso) => c.status === 'concluido' || concluidos.has(c.id);

  const abertos = COMPROMISSOS.filter((c) => !feito(c));
  const vencidos = abertos.filter((c) => (atraso(c) ?? 0) > 0);
  const meus = abertos.filter((c) => c.responsavel === 'coordenador');
  const meusVencidos = vencidos.filter((c) => c.responsavel === 'coordenador');
  const vagos = abertos.filter((c) => c.prazoVago);

  const linhas: Linha[] = useMemo(() => COMPROMISSOS
    .filter((c) => {
      const d = atraso(c);
      const ok = feito(c);
      if (visao === 'vencidos' && (ok || d === null || d <= 0)) return false;
      if (visao === 'meus' && (c.responsavel !== 'coordenador' || ok)) return false;
      if (visao === 'todos' && ok) return false;
      if (visao === 'concluidos' && !ok) return false;
      if (pessoa && c.pessoa !== pessoa) return false;
      if (busca && !c.descricao.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    })
    .map((c) => {
      const d = atraso(c);
      const ok = feito(c);
      const venc = !ok && d !== null && d > 0;
      return {
        id: c.id,
        titulo: c.descricao,
        dot: ok ? 'success' : venc ? 'error' : 'neutral',
        dotLabel: ok ? 'Concluído' : venc ? 'Vencido' : 'Em aberto',
        marcadores: [
          { texto: c.responsavel === 'coordenador' ? 'Eu' : c.nomeResp,
            cor: c.responsavel === 'coordenador' ? ('purple' as const) : ('gray' as const) },
          ...(c.herdado >= 2 ? [{ texto: `herdado ${c.herdado}×`, cor: 'red' as const }]
            : c.prazoVago ? [{ texto: 'prazo vago', cor: 'orange' as const }] : []),
        ],
        valor: ok ? '✓' : venc ? `−${d}d` : c.prazoDate ? dataBR(c.prazoDate).slice(0, 5) : '—',
        c,
      };
    }), [visao, pessoa, busca, concluidos]);

  const alternar = (id: number) => {
    const novo = new Set(concluidos);
    novo.has(id) ? novo.delete(id) : novo.add(id);
    setConcluidos(novo);
  };

  return (
    <Page
      titulo="Compromissos"
      subtitulo={`${abertos.length} em aberto · ${vencidos.length} vencidos · ${vagos.length} com prazo vago`}
      largura={1240}
    >
      <HStack gap={2} wrap="wrap">
        <Metrica valor={vencidos.length} rotulo="Vencidos" cor="red" />
        <Metrica valor={meusVencidos.length} rotulo="Vencidos que são meus"
                 nota="ninguém te cobra por estes" cor="red" />
        <Metrica valor={vagos.length} rotulo="Prazo nunca convertido em data" cor="orange" />
        <Metrica valor={abertos.filter((c) => c.herdado >= 2).length}
                 rotulo="Herdados 2+ conversas" nota="renegociar ou matar" cor="orange" />
      </HStack>

      {meusVencidos.length > 0 && (
        <Banner
          status="error"
          title={`${meusVencidos.length} compromisso(s) seu(s) vencido(s)`}
          description="Compromisso do líder que morre em silêncio é o que mais corrói a confiança na 1:1."
          endContent={<Button size="sm" label="Ver só os meus" onClick={() => setVisao('meus')} />}
        />
      )}

      <TabList value={visao} onChange={(v) => setVisao(v as Visao)} hasDivider>
        <Tab value="vencidos" label={`Vencidos (${vencidos.length})`} />
        <Tab value="meus" label={`Meus (${meus.length})`} />
        <Tab value="todos" label={`Em aberto (${abertos.length})`} />
        <Tab value="concluidos" label="Concluídos" />
      </TabList>

      <Filtros resultado={`${linhas.length} item(ns)`}>
        <TextInput label="Buscar na descrição" size="sm"
                   placeholder="Buscar…" value={busca} onChange={setBusca} />
        <Selector label="Pessoa" size="sm" variant="ghost" placeholder="Todas as pessoas"
                  value={pessoa} onChange={(v) => setPessoa(v ?? '')} hasClear
                  options={PESSOAS.filter((p) => p.status === 'ativo')
                    .map((p) => ({ value: p.slug, label: p.curto }))} />
        {(busca || pessoa) && (
          <Button size="sm" variant="ghost" label="Limpar"
                  onClick={() => { setBusca(''); setPessoa(''); }} />
        )}
      </Filtros>

      <Card padding={0}>
        <ListaDetalhe
          itens={linhas}
          detalhe={(l) => {
            const c = l.c;
            const d = atraso(c);
            const ok = feito(c);
            return (
              <Detalhe
                titulo={c.descricao}
                marcadores={
                  <>
                    <Token size="sm" color={ok ? 'green' : (d ?? 0) > 0 ? 'red' : 'gray'}
                           label={ok ? 'Concluído' : (d ?? 0) > 0 ? `Vencido há ${d} dias` : 'Em aberto'} />
                    <Token size="sm" color={c.responsavel === 'coordenador' ? 'purple' : 'gray'}
                           label={c.responsavel === 'coordenador' ? 'Responsável: eu' : `Responsável: ${c.nomeResp}`} />
                  </>
                }
              >
                <VStack gap={2}>
                  <Bloco rotulo="Prazo original, como foi dito">
                    <Text type="body">“{c.prazoTexto}”</Text>
                  </Bloco>
                  <Bloco rotulo="Data computada">
                    {c.prazoDate
                      ? dataBR(c.prazoDate)
                      : 'Nunca convertido em data — prazo vago não é cobrável.'}
                  </Bloco>
                  <Bloco rotulo="Origem">{`1:1 de ${dataBR(c.origemMeeting)}`}</Bloco>

                  {c.herdado >= 2 && (
                    <Bloco rotulo="Item herdado">
                      <Text type="body" color="accent">
                        Atravessou {c.herdado} conversas sem avanço. {c.notaHerdado}
                      </Text>
                    </Bloco>
                  )}

                  <Divider />
                  <HStack gap={1} wrap="wrap">
                    <Button size="sm" variant={ok ? 'ghost' : 'primary'}
                            label={ok ? 'Reabrir' : 'Concluir'} onClick={() => alternar(c.id)} />
                    <Button icon={<CalendarClock size={14} />} size="sm" variant="ghost" label="Renegociar prazo" />
                    <Button icon={<X size={14} />} size="sm" variant="ghost" label="Cancelar" />
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
