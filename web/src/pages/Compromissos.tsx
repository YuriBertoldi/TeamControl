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
import { CalendarClock } from 'lucide-react';

import { Page, Filtros, Metrica } from '../app/ui';
import { api } from '../lib/api';
import { invalidarPreparo } from '../data/preparo';
import { ListaDetalhe, Detalhe, Bloco, type LinhaEnxuta } from '../app/ListaDetalhe';
import { COMPROMISSOS, PESSOAS, HOJE, diasEntre, dataBR, type Compromisso } from '../data/mock';

type Visao = 'vencidos' | 'meus' | 'semdata' | 'todos' | 'concluidos';
interface Linha extends LinhaEnxuta { c: Compromisso }

export default function Compromissos() {
  const [visao, setVisao] = useState<Visao>('vencidos');
  const [pessoa, setPessoa] = useState('');
  const [busca, setBusca] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [versao, setVersao] = useState(0);
  const [novaData, setNovaData] = useState<Record<number, string>>({});
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  const atraso = (c: Compromisso) => (c.prazoDate ? diasEntre(c.prazoDate, HOJE) : null);
  const feito = (c: Compromisso) => c.status === 'concluido';

  /**
   * Combinado de conduta, não entrega.
   *
   * "Contínuo", "Sob demanda", "A partir de agora" — um terço da pasta. Isso
   * não vence, não atrasa, e não deve aparecer em lista de pendência. Contá-lo
   * como prazo encheria o board de vencido falso, e board que grita por engano
   * é board que se aprende a ignorar junto com o que gritava com razão.
   */
  const conduta = (c: Compromisso) => c.natureza === 'continuo';

  const abertos = COMPROMISSOS.filter((c) => !feito(c));
  const comPrazo = abertos.filter((c) => !conduta(c));
  const vencidos = comPrazo.filter((c) => (atraso(c) ?? 0) > 0 || c.venceAgora);
  const meus = abertos.filter((c) => c.responsavel === 'coordenador');
  const meusVencidos = vencidos.filter((c) => c.responsavel === 'coordenador');
  // Sem data E sem ninguém ter confirmado uma. Conduta fica fora: ela não tem
  // data porque não deve ter, não porque alguém esqueceu de pôr.
  const vagos = comPrazo.filter((c) => c.prazoVago && !c.prazoDate);
  // O que o sistema LEU e está esperando confirmação. É a fila de trabalho que
  // transforma "próximas semanas" em algo que o board consegue cobrar.
  const aConfirmar = vagos.filter((c) => !!c.prazoSugerido);
  const continuos = abertos.filter(conduta);

  const linhas: Linha[] = useMemo(() => COMPROMISSOS
    .filter((c) => {
      const d = atraso(c);
      const ok = feito(c);
      if (visao === 'vencidos' && (ok || conduta(c) || ((d === null || d <= 0) && !c.venceAgora))) return false;
      if (visao === 'meus' && (c.responsavel !== 'coordenador' || ok)) return false;
      if (visao === 'semdata' && (ok || conduta(c) || !!c.prazoDate || !c.prazoVago)) return false;
      if (visao === 'todos' && ok) return false;
      if (visao === 'concluidos' && !ok) return false;
      if (pessoa && c.pessoa !== pessoa) return false;
      if (busca && !c.descricao.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    })
    .map((c) => {
      const d = atraso(c);
      const ok = feito(c);
      const venc = !ok && !conduta(c) && ((d !== null && d > 0) || !!c.venceAgora);
      return {
        id: c.id,
        titulo: c.descricao,
        dot: ok ? 'success' : venc ? 'error' : 'neutral',
        dotLabel: ok ? 'Concluído' : venc ? 'Vencido' : 'Em aberto',
        marcadores: [
          { texto: c.responsavel === 'coordenador' ? 'Eu' : c.nomeResp,
            cor: c.responsavel === 'coordenador' ? ('purple' as const) : ('gray' as const) },
          ...(conduta(c) ? [{ texto: 'conduta contínua', cor: 'blue' as const }]
            : c.venceAgora ? [{ texto: 'vence na próxima 1:1', cor: 'red' as const }]
            : c.herdado >= 2 ? [{ texto: `herdado ${c.herdado}×`, cor: 'red' as const }]
            : c.prazoVago ? [{ texto: 'prazo vago', cor: 'orange' as const }] : []),
        ],
        valor: ok ? '✓' : c.venceAgora ? 'hoje' : venc ? `−${d}d`
             : c.prazoDate ? dataBR(c.prazoDate).slice(0, 5) : '—',
        c,
      };
    }), [visao, pessoa, busca, versao]);

  /**
   * Grava no banco e só então mexe na tela.
   *
   * A ordem importa: marcar na interface antes da resposta faria o board
   * mostrar um compromisso concluído que o Postgres nunca registrou — e isso
   * só apareceria na próxima subida, quando ele reaparecesse em aberto sem
   * explicação. Melhor o botão demorar um instante.
   */
  const gravar = async (c: Compromisso, dados: { prazo?: string; status?: string },
                        feitoTexto: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await api.atualizarCompromisso(c.id, dados);
      if (dados.prazo) {
        c.prazoDate = dados.prazo;
        c.prazoVago = false;
        c.venceAgora = false;
      }
      if (dados.status) c.status = dados.status as Compromisso['status'];
      // A preparação de 1:1 é montada do mesmo dado; esquecer o que já foi
      // buscado evita ela continuar mostrando o estado anterior.
      invalidarPreparo();
      setVersao((v) => v + 1);
      setAviso({ tipo: 'success', texto: feitoTexto });
    } catch (e) {
      setAviso({ tipo: 'error', texto: `Não consegui gravar: ${(e as Error).message}` });
    } finally {
      setOcupado(false);
    }
  };

  const confirmarPrazo = (c: Compromisso, data: string) =>
    gravar(c, { prazo: data }, `Prazo de "${c.descricao.slice(0, 40)}…" gravado para ${dataBR(data)}.`);

  const alternar = (c: Compromisso) =>
    gravar(c, { status: feito(c) ? 'aberto' : 'concluido' },
           feito(c) ? 'Reaberto.' : 'Concluído.');

  return (
    <Page
      titulo="Compromissos"
      subtitulo={`${abertos.length} em aberto · ${vencidos.length} vencidos · ${vagos.length} sem data · ${continuos.length} de conduta contínua`}
      largura={1240}
    >
      {aviso && (
        <Banner status={aviso.tipo === 'error' ? 'error' : 'success'}
                title={aviso.tipo === 'error' ? 'Não deu certo' : 'Pronto'}
                description={aviso.texto} />
      )}

      <HStack gap={2} wrap="wrap">
        <Metrica valor={vencidos.length} rotulo="Vencidos" cor="red" />
        <Metrica valor={meusVencidos.length} rotulo="Vencidos que são meus"
                 nota="ninguém te cobra por estes" cor="red" />
        <Metrica valor={vagos.length} rotulo="Prazo nunca convertido em data"
                 nota={aConfirmar.length ? `${aConfirmar.length} com data sugerida` : undefined}
                 cor="orange" />
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
        <Tab value="semdata" label={`Sem data (${vagos.length})`} />
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
                  <Bloco rotulo="Data que vale">
                    {c.prazoDate
                      ? dataBR(c.prazoDate)
                      : conduta(c)
                        ? 'Não tem data — é combinado de conduta, não entrega. Não vence.'
                        : c.venceAgora
                          ? 'Vence na próxima 1:1 — que é a que você está preparando.'
                          : 'Nunca convertido em data. Prazo vago não é cobrável por ninguém.'}
                  </Bloco>

                  {/* A sugestão e a confirmação são coisas separadas, e a
                      ordem entre elas é a decisão de produto que mais pesa no
                      board. O sistema LÊ "próximas semanas" e propõe; quem
                      assumiu o compromisso confirma. Gravar direto faria o
                      board cobrar data que ninguém combinou — e a primeira vez
                      que isso acontecesse numa 1:1 o instrumento perderia a
                      confiança de quem o usa. */}
                  {!c.prazoDate && !conduta(c) && c.prazoSugerido && (
                    <Bloco rotulo="O que eu li deste prazo">
                      <VStack gap={1}>
                        <Text type="body">
                          {`“${c.prazoTexto}” na 1:1 de ${dataBR(c.origemMeeting)} → ${dataBR(c.prazoSugerido)}`}
                        </Text>
                        <HStack gap={1} wrap="wrap">
                          <Button size="sm" variant="primary" isDisabled={ocupado}
                                  label={`Confirmar ${dataBR(c.prazoSugerido)}`}
                                  onClick={() => { void confirmarPrazo(c, c.prazoSugerido!); }} />
                          <Text type="supporting">
                            É sugestão minha, não combinado. Confirme só se for isso mesmo.
                          </Text>
                        </HStack>
                      </VStack>
                    </Bloco>
                  )}

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
                    <Button size="sm" variant={ok ? 'ghost' : 'primary'} isDisabled={ocupado}
                            label={ok ? 'Reabrir' : 'Concluir'} onClick={() => { void alternar(c); }} />
                    <TextInput size="sm" label="Outra data" placeholder="AAAA-MM-DD"
                               value={novaData[c.id] ?? ''}
                               onChange={(v) => setNovaData({ ...novaData, [c.id]: v })} />
                    <Button icon={<CalendarClock size={14} />} size="sm" variant="ghost"
                            label="Gravar prazo" isDisabled={ocupado || !novaData[c.id]}
                            onClick={() => { void confirmarPrazo(c, novaData[c.id]); }} />
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
