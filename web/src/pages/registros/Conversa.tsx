/**
 * Conteúdo de uma conversa: o registro escrito E a transcrição que o lastreia.
 *
 * As duas coisas juntas numa tela só é o ponto. O registro é a leitura
 * curada; a transcrição é o que foi dito. Quando alguém pergunta "onde ele
 * falou isso", a resposta precisa estar a um clique — senão a evidência vira
 * afirmação de memória, que é exatamente o que este sistema existe para
 * substituir.
 *
 * O conteúdo é buscado sob demanda. Uma transcrição passa de 18 mil
 * caracteres; carregá-las todas junto com o índice seria ~1 MB para exibir
 * uma lista de datas.
 *
 * A confidencialidade aparece em cada aba, e não só no rodapé: a Parte 1 é a
 * única que pode chegar ao liderado, e a transcrição bruta é sempre nível 3
 * porque contém inclusive o que foi cortado de propósito do compartilhável.
 */

import { useEffect, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Card } from '@astryxdesign/core/Card';
import { Token } from '@astryxdesign/core/Token';
import { Banner } from '@astryxdesign/core/Banner';
import { Spinner } from '@astryxdesign/core/Spinner';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';

import { Conf } from '../../app/ui';
import { api, type DetalheRegistroAPI } from '../../lib/api';
import type { Registro1a1 } from '../../data/registros';

const ROTULO_PARTE: Record<string, string> = {
  compartilhavel: 'Parte 1 — compartilhável com o liderado',
  privado_coordenador: 'Parte 2 — privado do coordenador',
  avaliacao_1a1: 'Avaliação do 1:1',
};

const ROTULO_FONTE: Record<string, string> = {
  tactiq: 'Transcrição (Tactiq)',
  gemini_transcript: 'Transcrição (Gemini)',
  gemini_notes: 'Anotações do Gemini',
};

export function Conversa({ r }: { r: Registro1a1 }) {
  const [d, setD] = useState<DetalheRegistroAPI | null>(null);
  const [erro, setErro] = useState(false);
  const [aba, setAba] = useState('');

  useEffect(() => {
    let vivo = true;
    setD(null);
    setErro(false);
    void api.registro(r.id).then((res) => {
      if (!vivo) return;
      if (!res) { setErro(true); return; }
      setD(res);
      // Abre na primeira parte escrita, ou na fonte quando não há registro —
      // há conversa com transcrição e sem registro, e é justamente a que mais
      // interessa abrir, porque é trabalho pendente.
      setAba(res.partes[0]?.formato ?? (res.fontes[0] ? `fonte-${res.fontes[0].id}` : ''));
    });
    return () => { vivo = false; };
  }, [r.id]);

  if (erro) {
    return (
      <Banner status="error" title="Não consegui abrir o conteúdo"
              description="A API não respondeu. O índice abre do cache, mas o texto
                           do registro e a transcrição vêm do banco." />
    );
  }
  if (!d) {
    return <HStack gap={2} vAlign="center"><Spinner size="sm" /><Text type="supporting">Carregando…</Text></HStack>;
  }

  const abas = [
    ...d.partes.map((p) => ({
      id: p.formato,
      rotulo: ROTULO_PARTE[p.formato] ?? p.formato,
      conf: p.conf,
      texto: p.markdown ?? '',
    })),
    ...d.fontes.map((f) => ({
      id: `fonte-${f.id}`,
      rotulo: `${ROTULO_FONTE[f.fonte] ?? f.fonte}${f.falas ? ` · ${f.falas} falas` : ''}`,
      conf: f.conf,
      texto: f.texto ?? '',
    })),
  ];
  const atual = abas.find((a) => a.id === aba) ?? abas[0];

  return (
    <VStack gap={3}>
      {d.divergencia && (
        <Banner
          status="warning"
          title="A data do nome do arquivo não bate com a do conteúdo"
          description="Vale a data do conteúdo. Corrigir o nome evita que a conversa
                       suma quando alguém procurar pela data."
        />
      )}

      {abas.length === 0 ? (
        <Banner status="warning" title="Conversa sem registro e sem transcrição"
                description="A reunião existe no banco, mas nada foi processado ainda." />
      ) : (
        <>
          <TabList value={atual.id} onChange={setAba} hasDivider>
            {abas.map((a) => <Tab key={a.id} value={a.id} label={a.rotulo} />)}
          </TabList>

          <HStack gap={1} vAlign="center" wrap="wrap">
            <Conf nivel={atual.conf as 1 | 2 | 3 | 4} />
            <Text type="supporting">
              {atual.conf === 1
                ? 'Pode ser entregue ao liderado.'
                : atual.conf === 2
                  ? 'Vai para RH e calibragem, não para o liderado.'
                  : 'Não sai daqui — nem para o liderado, nem para o RH.'}
            </Text>
          </HStack>

          {/* `maxLines` em vez de altura fixa: transcrição de 300 falas não
              pode empurrar o resto da tela, e rolagem dentro de bloco é o que
              deixa comparar registro e transcrição sem perder o lugar. */}
          <Card padding={3} variant="muted">
            <VStack gap={1} height={420} isScrollable>
              {atual.texto
                ? atual.texto.split('\n').map((linha, i) => (
                    <Text key={i} type={linha.startsWith('#') ? 'label' : 'supporting'}>
                      {linha || ' '}
                    </Text>
                  ))
                : <Text type="supporting">Sem texto nesta parte.</Text>}
            </VStack>
          </Card>
        </>
      )}

      {d.listaEncaminhamentos.length > 0 && (
        <VStack gap={1}>
          <Text type="label">Encaminhamentos ({d.listaEncaminhamentos.length})</Text>
          <List density="compact" hasDividers>
            {d.listaEncaminhamentos.map((e, i) => (
              <ListItem
                key={i}
                label={e.descricao}
                startContent={<StatusDot
                  variant={e.tipo === 'coordenador' ? 'error' : 'neutral'}
                  label={e.tipo === 'coordenador' ? 'Seu' : 'Do liderado'} />}
                endContent={
                  <Token size="sm" color={e.prazoVago ? 'orange' : 'gray'}
                         label={e.prazoTexto || 'sem prazo'} />
                }
                description={e.responsavel}
              />
            ))}
          </List>
        </VStack>
      )}

      {d.listaOmissoes.length > 0 && (
        <VStack gap={1}>
          <Text type="label">Omitido de propósito ({d.listaOmissoes.length})</Text>
          {/* O ITEM e o MOTIVO aparecem; o conteúdo cortado, nunca. É para isso
              que a seção existe: lembrar que havia algo ali sem fazer circular. */}
          <List density="compact" hasDividers>
            {d.listaOmissoes.map((o, i) => (
              <ListItem key={i} label={o.item}
                        endContent={<Text type="supporting">{o.onde}</Text>}
                        description={o.motivo} />
            ))}
          </List>
        </VStack>
      )}
    </VStack>
  );
}
