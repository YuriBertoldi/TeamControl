/**
 * Importações — a fila de ingestão.
 *
 * A aba Revisão virou um filtro da mesma lista, não uma tela paralela: as
 * decisões (qual pessoa, qual data, processar ou ignorar) moram no painel de
 * detalhe, junto do arquivo. Antes eram cartões empilhados com toda a prosa
 * visível de uma vez.
 */

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Token } from '@astryxdesign/core/Token';
import { Button } from '@astryxdesign/core/Button';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { FileInput } from '@astryxdesign/core/FileInput';
import { Banner } from '@astryxdesign/core/Banner';
import { List, ListItem } from '@astryxdesign/core/List';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Divider } from '@astryxdesign/core/Divider';
import { Check, EyeOff, Play, RefreshCw } from 'lucide-react';

import { Page, Filtros, Metrica } from '../app/ui';
import { ListaDetalhe, Detalhe, Bloco, type LinhaEnxuta } from '../app/ListaDetalhe';
import { dataBR, PESSOAS, souMeus } from '../data/mock';
import { carregarConfig } from '../config';
import { api } from '../lib/api';
import { escreverJSON } from '../data/armazenamento';
import {
  ARQUIVOS, TIPO_ROTULO, STATUS_ROTULO,
  type StatusFonte, type TipoFonte, type ArquivoFonte,
} from '../data/mockOps';

const DOT: Record<StatusFonte, 'success' | 'warning' | 'error' | 'neutral'> = {
  processado: 'success', pendente: 'neutral', revisao_manual: 'warning',
  erro: 'error', ignorado: 'neutral',
};
const COR: Record<StatusFonte, 'green' | 'orange' | 'red' | 'gray'> = {
  processado: 'green', pendente: 'gray', revisao_manual: 'orange',
  erro: 'red', ignorado: 'gray',
};

const kb = (b: number) => `${Math.round(b / 1024)} kB`;

interface Linha extends LinhaEnxuta { a: ArquivoFonte }

export default function Importacoes() {
  const cfg = carregarConfig();
  // `?? cfg.pastas[0]` ainda devolve undefined com a lista vazia. A tela não
  // pode quebrar por causa de configuração ruim — ela mostra o que tem.
  const principal = cfg.pastas.find((p) => p.ativa) ?? cfg.pastas[0];

  const [aba, setAba] = useState('fila');
  const [status, setStatus] = useState('');
  const [tipo, setTipo] = useState('');
  const [busca, setBusca] = useState('');
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [colado, setColado] = useState('');

  // A fila vira estado local, e não leitura direta do cache: "Ignorar" precisa
  // sumir o arquivo da lista na hora. Sem isto a ação iria ao banco e a tela
  // continuaria mostrando o mesmo, dando a impressão de botão quebrado.
  const [lista, setLista] = useState<ArquivoFonte[]>(ARQUIVOS);
  const [ocupado, setOcupado] = useState(false);
  // Escolha por arquivo: o painel de detalhe troca de arquivo sem desmontar, e
  // um estado único faria a seleção de um vazar para o seguinte.
  const [escolha, setEscolha] = useState<Record<number, string>>({});
  const [aviso, setAviso] = useState<{ tipo: 'success' | 'error'; texto: string } | null>(null);

  /** Recarrega do banco e atualiza o cache, para a próxima subida já vir certa. */
  const recarregar = async () => {
    const nova = await api.importacoes();
    if (nova) {
      setLista(nova as unknown as ArquivoFonte[]);
      escreverJSON('importacoes', nova);
    }
  };

  const mudarStatus = async (a: ArquivoFonte, novo: 'ignorado' | 'pendente') => {
    setOcupado(true);
    setAviso(null);
    try {
      await api.marcarArquivo(a.id, novo);
      await recarregar();
      setAviso({ tipo: 'success', texto: novo === 'ignorado'
        ? `"${a.arquivo}" saiu da fila. Dá para voltar atrás no filtro de ignorados.`
        : `"${a.arquivo}" voltou para a fila.` });
    } catch (e) {
      // O erro chega à tela em vez de sumir no console: sem isto o botão
      // pareceria não fazer nada, que é exatamente o sintoma relatado.
      setAviso({ tipo: 'error', texto: `Não consegui alterar: ${(e as Error).message}` });
    } finally {
      setOcupado(false);
    }
  };

  /**
   * Aponta de quem é o arquivo quando a carga não soube dizer.
   *
   * Era a metade que faltava da revisão manual: a tela sabia dizer "não
   * identifiquei de quem é" e não oferecia saída nenhuma. O arquivo ficava ali
   * acusando um problema que não dava para resolver em lugar nenhum.
   */
  const atribuir = async (a: ArquivoFonte, slug: string, nome: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await api.atribuirPessoa(a.id, slug);
      await recarregar();
      setAviso({ tipo: 'success', texto:
        `"${a.arquivo}" agora é de ${nome}. Use "Varrer agora" para importar o conteúdo.` });
    } catch (e) {
      setAviso({ tipo: 'error', texto: `Não consegui vincular: ${(e as Error).message}` });
    } finally {
      setOcupado(false);
    }
  };

  const varrer = async () => {
    setOcupado(true);
    setAviso(null);
    try {
      const r = await api.varrer();
      await recarregar();
      const pendencias = (r.revisao?.length ?? 0) + (r.erros?.length ?? 0);
      setAviso({ tipo: 'success', texto:
        `${r.vistos} arquivos varridos · ${r.reunioes} reuniões · ${r.registros} registros` +
        (pendencias ? ` · ${pendencias} precisam de você` : '') });
    } catch (e) {
      setAviso({ tipo: 'error', texto: `A varredura falhou: ${(e as Error).message}` });
    } finally {
      setOcupado(false);
    }
  };

  const porStatus = (s: StatusFonte) => lista.filter((a) => a.status === s).length;
  const porTipo = (t: TipoFonte) => lista.filter((a) => a.tipo === t).length;
  const precisamDeVoce = lista.filter(
    (a) => a.status === 'revisao_manual' || a.status === 'erro');

  const base = aba === 'revisao' ? precisamDeVoce : lista;

  const linhas: Linha[] = useMemo(() => base
    .filter((a) => {
      if (status && a.status !== status) return false;
      if (tipo && a.tipo !== tipo) return false;
      if (busca && !a.arquivo.toLowerCase().includes(busca.toLowerCase())) return false;
      return true;
    })
    .map((a) => ({
      id: a.id,
      titulo: a.arquivo,
      dot: DOT[a.status],
      dotLabel: STATUS_ROTULO[a.status],
      marcadores: [
        { texto: STATUS_ROTULO[a.status], cor: COR[a.status] },
        ...(a.pessoa
          ? [{ texto: a.pessoa.split(' ')[0], cor: 'blue' as const }]
          : [{ texto: 'sem pessoa', cor: 'red' as const }]),
      ],
      valor: kb(a.bytes),
      a,
    })), [base, status, tipo, busca]);

  return (
    <Page
      titulo="Importações"
      subtitulo={`${principal?.caminho ?? "pasta não configurada"} · ${lista.length} arquivos`}
      acoes={<Button icon={<RefreshCw size={14} />} label="Varrer agora"
                     onClick={() => { void varrer(); }} isDisabled={ocupado} />}
      largura={1240}
    >
      {aviso && (
        <Banner status={aviso.tipo === 'error' ? 'error' : 'success'}
                title={aviso.tipo === 'error' ? 'Não deu certo' : 'Pronto'}
                description={aviso.texto} />
      )}

      {/* Contagens derivadas de `lista`, e não do ACERVO calculado na subida:
          depois de ignorar um arquivo ou varrer, os números precisam acompanhar
          a tela. Senão o painel contradiz a lista logo abaixo dele. */}
      <HStack gap={2} wrap="wrap">
        <Metrica valor={porStatus('processado')} rotulo="Processados"
                 nota={`de ${lista.length} arquivos`} cor="green" />
        <Metrica valor={porStatus('pendente')} rotulo="Na fila" cor="orange" />
        <Metrica valor={precisamDeVoce.length} rotulo="Precisam de você" cor="red" />
        <Metrica valor={porStatus('ignorado')} rotulo="Ignorados" />
        <Metrica valor={porTipo('tactiq_txt')} rotulo="Tactiq .txt" />
        <Metrica valor={porTipo('gemini_notes_pdf') + porTipo('gemini_transcript_pdf')}
                 rotulo="PDFs do Gemini" />
      </HStack>

      <TabList value={aba} onChange={setAba} hasDivider>
        <Tab value="fila" label={`Fila (${lista.length})`} />
        <Tab value="revisao" label={`Precisam de você (${precisamDeVoce.length})`} />
        <Tab value="entrada" label="Nova entrada" />
      </TabList>

      {aba !== 'entrada' && (
        <>
          {aba === 'revisao' && (
            <Banner
              status="warning"
              title="Nada entra no sistema sem a sua decisão"
              description="A ingestão resolve pessoa e data sozinha quando tem certeza. Quando não tem, para aqui — em vez de adivinhar e contaminar o dossiê."
            />
          )}

          <Filtros resultado={`${linhas.length} de ${base.length}`}>
            <TextInput label="Buscar arquivo" size="sm"
                       placeholder="Buscar…" value={busca} onChange={setBusca} />
            <Selector label="Status" size="sm" variant="ghost" placeholder="Todos os status"
                      value={status} onChange={(v) => setStatus(v ?? '')} hasClear
                      options={(Object.keys(STATUS_ROTULO) as StatusFonte[])
                        .map((s) => ({ value: s, label: `${STATUS_ROTULO[s]} (${porStatus(s)})` }))} />
            <Selector label="Tipo" size="sm" variant="ghost" placeholder="Todos os tipos"
                      value={tipo} onChange={(v) => setTipo(v ?? '')} hasClear
                      options={(Object.keys(TIPO_ROTULO) as TipoFonte[])
                        .map((t) => ({ value: t, label: TIPO_ROTULO[t] }))} />
            {(busca || status || tipo) && (
              <Button size="sm" variant="ghost" label="Limpar filtros"
                      onClick={() => { setBusca(''); setStatus(''); setTipo(''); }} />
            )}
          </Filtros>

          <Card padding={0}>
            <ListaDetalhe
              itens={linhas}
              larguraPainel={440}
              vazio="Nenhum arquivo com esses filtros."
              detalhe={(l) => {
                const a = l.a;
                const divergente = a.dataReuniao && a.dataArquivo && a.dataReuniao !== a.dataArquivo;
                return (
                  <Detalhe
                    titulo={a.arquivo}
                    marcadores={
                      <>
                        <Token size="sm" color={COR[a.status]} label={STATUS_ROTULO[a.status]} />
                        <Token size="sm" color="gray" label={TIPO_ROTULO[a.tipo]} />
                        <Token size="sm" color="gray" label={kb(a.bytes)} />
                      </>
                    }
                  >
                    <VStack gap={2}>
                      <Bloco rotulo="Pasta">{`${a.pasta}/`}</Bloco>
                      <Bloco rotulo="Pessoa">
                        {a.pessoa ?? 'Não resolvida — decida abaixo'}
                      </Bloco>

                      {a.motivo && (
                        <Banner status={a.status === 'erro' ? 'error' : 'warning'}
                                title="Por que parou aqui" description={a.motivo} />
                      )}

                      {divergente && (
                        <Bloco rotulo="Qual data vale?">
                          <HStack gap={1} wrap="wrap">
                            <Button size="sm" variant="primary"
                                    label={`Conteúdo: ${dataBR(a.dataReuniao!)}`} />
                            <Button size="sm" variant="ghost"
                                    label={`Nome: ${dataBR(a.dataArquivo!)}`} />
                          </HStack>
                          <Text type="supporting">
                            O padrão é a data do cabeçalho; o nome do arquivo fica só como auditoria.
                          </Text>
                        </Bloco>
                      )}

                      {!a.pessoa && a.status !== 'ignorado' && (
                        <Bloco rotulo="De quem é esta conversa?">
                          <VStack gap={1}>
                            <Selector
                              label="Pessoa"
                              value={escolha[a.id] ?? ''}
                              onChange={(v) => setEscolha({ ...escolha, [a.id]: String(v) })}
                              options={[
                                { value: '', label: 'Escolha…' },
                                ...souMeus().map((p) => ({ value: p.slug, label: p.nome })),
                              ]} />
                            <Button size="sm" variant="primary" label="Vincular"
                                    isDisabled={ocupado || !escolha[a.id]}
                                    onClick={() => {
                                      const slug = escolha[a.id];
                                      const p = PESSOAS.find((x) => x.slug === slug);
                                      if (p) void atribuir(a, p.slug, p.nome);
                                    }} />
                            <Text type="supporting">
                              Vale só para este arquivo. Depois use "Varrer agora" para importar
                              o conteúdo.
                            </Text>
                          </VStack>
                        </Bloco>
                      )}

                      {a.status === 'erro' && (
                        <Bloco rotulo="Fallback: colar o texto">
                          <VStack gap={1}>
                            <TextInput label="Texto da transcrição" isLabelHidden
                                       placeholder="Cole aqui o conteúdo do PDF…"
                                       value={colado} onChange={setColado} />
                            <Button icon={<Play size={14} />} size="sm" label="Processar texto colado" isDisabled={!colado} />
                          </VStack>
                        </Bloco>
                      )}

                      <Divider />
                      <HStack gap={1} wrap="wrap">
                        {/* "Processar" devolve o arquivo para a fila e roda a
                            varredura. A passada é idempotente, então repetir é
                            seguro — e é o que permite oferecer isto como botão. */}
                        <Button icon={<Check size={14} />} size="sm" variant="primary"
                                label={a.status === 'processado' ? 'Reprocessar' : 'Confirmar e processar'}
                                isDisabled={ocupado}
                                onClick={() => { void (async () => {
                                  await mudarStatus(a, 'pendente');
                                  await varrer();
                                })(); }} />
                        {a.status === 'ignorado' ? (
                          <Button icon={<Check size={14} />} size="sm" variant="ghost"
                                  label="Voltar para a fila" isDisabled={ocupado}
                                  onClick={() => { void mudarStatus(a, 'pendente'); }} />
                        ) : (
                          <Button icon={<EyeOff size={14} />} size="sm" variant="ghost"
                                  label="Ignorar" isDisabled={ocupado}
                                  onClick={() => { void mudarStatus(a, 'ignorado'); }} />
                        )}
                      </HStack>
                      <Text type="supporting">
                        Ignorar não apaga nada: o arquivo sai da fila e continua
                        na pasta. Dá para trazer de volta filtrando por ignorados.
                      </Text>
                    </VStack>
                  </Detalhe>
                );
              }}
            />
          </Card>
        </>
      )}

      {aba === 'entrada' && (
        <VStack gap={3}>
          <Card padding={4}>
            <VStack gap={2}>
              <Heading level={3}>Enviar arquivos</Heading>
              <FileInput
                label="Arquivos de 1:1"
                accept={cfg.extensoes.join(',')}
                isMultiple
                value={arquivos}
                onChange={(f) => setArquivos(Array.isArray(f) ? f : f ? [f] : [])}
                description={`Aceita ${cfg.extensoes.join(', ')}. Pessoa e data vêm do cabeçalho; divergências vão para revisão.`}
              />
              {arquivos.length > 0 && (
                <Button label={`Processar ${arquivos.length} arquivo(s)`} variant="primary" />
              )}
            </VStack>
          </Card>

          <Card padding={4}>
            <VStack gap={2}>
              <Heading level={3}>Colar texto</Heading>
              <TextInput label="Transcrição ou anotações" isLabelHidden
                         placeholder="Cole aqui a transcrição ou suas anotações cruas…"
                         value={colado} onChange={setColado} />
              <HStack gap={1}>
                <Button icon={<Play size={14} />} label="Processar" variant="primary" isDisabled={!colado} />
              </HStack>
            </VStack>
          </Card>

          <Card padding={4}>
            <VStack gap={2}>
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Heading level={3}>Pastas monitoradas</Heading>
                <Text type="supporting">configuradas em Configurações</Text>
              </HStack>
              <List density="compact" hasDividers>
                {cfg.pastas.map((p) => (
                  <ListItem
                    key={p.id}
                    label={p.caminho || '(caminho vazio)'}
                    startContent={<StatusDot variant={p.ativa ? 'success' : 'neutral'}
                                             label={p.ativa ? 'Ativa' : 'Inativa'} />}
                    endContent={<Text type="supporting">
                      {p.ativa ? `a cada ${cfg.intervaloVarreduraSeg}s` : 'parada'}
                    </Text>}
                    description={<Text type="supporting">{p.rotulo}</Text>}
                  />
                ))}
              </List>
              <Banner
                status="info"
                title="O Drive entra pela pasta monitorada"
                description="Com o Google Drive para Desktop montando a pasta como unidade local, o watcher a varre como qualquer outra — sem OAuth."
              />
            </VStack>
          </Card>
        </VStack>
      )}
    </Page>
  );
}
