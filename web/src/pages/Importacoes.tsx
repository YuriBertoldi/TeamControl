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
import { dataBR } from '../data/mock';
import { carregarConfig } from '../config';
import {
  ARQUIVOS, ACERVO, TIPO_ROTULO, STATUS_ROTULO,
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

  const porStatus = (s: StatusFonte) => ARQUIVOS.filter((a) => a.status === s).length;
  const precisamDeVoce = ARQUIVOS.filter(
    (a) => a.status === 'revisao_manual' || a.status === 'erro');

  const base = aba === 'revisao' ? precisamDeVoce : ARQUIVOS;

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
      subtitulo={`${principal?.caminho ?? "pasta não configurada"} · varredura a cada ${cfg.intervaloVarreduraSeg}s · ${ACERVO.totalArquivos} arquivos`}
      acoes={<Button icon={<RefreshCw size={14} />} label="Varrer agora" />}
      largura={1240}
    >
      <HStack gap={2} wrap="wrap">
        <Metrica valor={ACERVO.registrosProcessados} rotulo="Registros processados"
                 nota={`de ${ACERVO.tactiq + ACERVO.geminiNotas} transcrições`} cor="green" />
        <Metrica valor={porStatus('pendente')} rotulo="Na fila"
                 nota="jun/jul nunca processados" cor="orange" />
        <Metrica valor={precisamDeVoce.length} rotulo="Precisam de você" cor="red" />
        <Metrica valor={ACERVO.tactiq} rotulo="Tactiq .txt" />
        <Metrica valor={ACERVO.geminiNotas + ACERVO.geminiTranscricao} rotulo="PDFs do Gemini"
                 nota="substituíram o Tactiq em set/26" />
      </HStack>

      <TabList value={aba} onChange={setAba} hasDivider>
        <Tab value="fila" label={`Fila (${ARQUIVOS.length})`} />
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

                      {a.candidatos && (
                        <Bloco rotulo="Vincular a">
                          <VStack gap={1}>
                            {a.candidatos.map((c, i) => (
                              <Button key={c} size="sm" label={c}
                                      variant={i === 0 ? 'primary' : 'ghost'} />
                            ))}
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
                        <Button icon={<Check size={14} />} size="sm" variant="primary" label="Confirmar e processar"
                                isDisabled={a.status === 'processado'} />
                        <Button icon={<EyeOff size={14} />} size="sm" variant="ghost" label="Ignorar" />
                      </HStack>
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
