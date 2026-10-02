/**
 * DNA Motivacional do time.
 *
 * A leitura individual mora no perfil da pessoa. Aqui está o que só aparece no
 * agregado: a distribuição por eixo, que muda como você monta squad e
 * distribui frente, e a lista de quem ainda não respondeu.
 *
 * Um time inteiro de Estabilidade não absorve três mudanças de escopo no
 * trimestre; um time inteiro de Variedade não sustenta legado. Isso não está
 * em nenhuma 1:1 individual — só na soma.
 */

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Token } from '@astryxdesign/core/Token';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { UserSearch } from 'lucide-react';

import { Page, Stats, corDaCadeira, rotuloCargo } from '../app/ui';
import { useNavegacao } from '../app/navegacao';
import { souMeus, nivelDe, dataBR } from '../data/mock';
import {
  PERFIS, ROTULO_POLO, carregarDNA, dnaDe, apurarRegistro,
  intensidadeDe, distribuicaoDoTime,
} from '../data/dna';

export default function DNA() {
  const { abrirPessoa } = useNavegacao();
  const [aba, setAba] = useState('time');

  const pessoas = souMeus();
  const lista = carregarDNA();
  const comLeitura = pessoas.filter((p) => dnaDe(p.slug, lista));
  const sem = pessoas.filter((p) => !dnaDe(p.slug, lista));
  const dist = distribuicaoDoTime(pessoas.map((p) => p.slug), lista);

  return (
    <Page
      titulo="DNA Motivacional"
      subtitulo="21 pares de escolha forçada · 3 eixos · 8 perfis. O que move cada pessoa, e o que o time inteiro pede."
      largura={1240}
    >
      <Stats itens={[
        { valor: comLeitura.length, rotulo: 'com leitura' },
        { valor: sem.length, rotulo: 'sem leitura', cor: sem.length ? 'orange' : undefined },
        { valor: new Set(comLeitura.map((p) => apurarRegistro(dnaDe(p.slug, lista)!).codigo)).size,
          rotulo: 'perfis distintos' },
        { valor: PERFIS.length, rotulo: 'perfis possíveis' },
      ]} />

      {sem.length > 0 && (
        <Banner
          status="info"
          title={`${sem.length} pessoa(s) sem DNA registrado`}
          description={`${sem.map((p) => p.curto).join(', ')} — responder junto na 1:1 costuma render mais que mandar a planilha, porque as dúvidas aparecem na hora.`}
        />
      )}

      <TabList value={aba} onChange={setAba} hasDivider>
        <Tab value="time" label="Distribuição do time" />
        <Tab value="pessoas" label={`Por pessoa (${pessoas.length})`} />
        <Tab value="perfis" label={`Os ${PERFIS.length} perfis`} />
      </TabList>

      {aba === 'time' && (
        <VStack gap={3}>
          <Card padding={4}>
            <VStack gap={2}>
              <Heading level={3}>Os três eixos no time</Heading>
              <Text type="supporting">
                Só quem tem leitura entra na conta. A barra mostra para que lado
                o time pende em cada eixo.
              </Text>
              {dist.map(({ eixo, contagem, semLeitura }) => {
                const total = contagem[0] + contagem[1];
                return (
                  <VStack key={eixo.id} gap={0.5}>
                    <HStack gap={2} vAlign="center" wrap="wrap" hAlign="between">
                      <Text type="label">{eixo.nome}</Text>
                      <HStack gap={1} vAlign="center" wrap="wrap">
                        <Token size="sm" color="teal"
                               label={`${ROTULO_POLO[eixo.polos[0]]} ${contagem[0]}`} />
                        <Token size="sm" color="purple"
                               label={`${ROTULO_POLO[eixo.polos[1]]} ${contagem[1]}`} />
                        {semLeitura > 0 && (
                          <Text type="supporting">{semLeitura} sem leitura</Text>
                        )}
                      </HStack>
                    </HStack>
                    <ProgressBar
                      label={`${eixo.nome}: ${contagem[0]} em ${ROTULO_POLO[eixo.polos[0]]}, ${contagem[1]} em ${ROTULO_POLO[eixo.polos[1]]}`}
                      isLabelHidden
                      value={contagem[0]}
                      max={total || 1}
                      variant="accent"
                    />
                    <Text type="supporting">{eixo.pergunta}</Text>
                  </VStack>
                );
              })}
            </VStack>
          </Card>

          <LeituraDoTime dist={dist} />
        </VStack>
      )}

      {aba === 'pessoas' && (
        <Card padding={0}>
          <List density="balanced" hasDividers>
            {pessoas.map((p) => {
              const reg = dnaDe(p.slug, lista);
              const ap = reg ? apurarRegistro(reg) : null;
              return (
                <ListItem
                  key={p.slug}
                  label={p.nome}
                  startContent={<StatusDot variant={ap?.codigo ? 'success' : 'neutral'}
                                           label={ap?.codigo ? 'Com leitura' : 'Sem leitura'} />}
                  onClick={() => abrirPessoa(p.slug)}
                  endContent={
                    <HStack gap={0.5} vAlign="center" wrap="wrap">
                      <Token size="sm" color={corDaCadeira(p.familia, nivelDe(p))}
                             label={rotuloCargo(p)} />
                      {ap?.codigo
                        ? <Token size="sm" color="teal" label={ap.codigo} />
                        : <Token size="sm" color="orange" label="responder" />}
                    </HStack>
                  }
                  description={
                    ap?.perfil
                      ? <HStack gap={1} wrap="wrap" vAlign="center">
                          <Text type="supporting">{ap.perfil.nome}</Text>
                          {ap.eixos.map((e) => (
                            <Token key={e.eixo.id} size="sm"
                                   color={intensidadeDe(e) === 'forte' ? 'teal'
                                        : intensidadeDe(e) === 'clara' ? 'blue' : 'gray'}
                                   label={`${ROTULO_POLO[e.vencedor]} ${e.pontos[0]}×${e.pontos[1]}`} />
                          ))}
                          <Text type="supporting">lido em {dataBR(reg!.data)}</Text>
                        </HStack>
                      : <Text type="supporting">
                          Abra o perfil para responder as 21 questões ou importar os totais da planilha.
                        </Text>
                  }
                />
              );
            })}
          </List>
        </Card>
      )}

      {aba === 'perfis' && (
        <VStack gap={2}>
          <Banner
            status="info"
            title="O código é posicional"
            description="Primeira letra P ou C (Produção/Conexão), segunda E ou V (Estabilidade/Variedade), terceira I ou E (Interioridade/Exterioridade). A letra E significa coisas diferentes na segunda e na terceira posição — por isso o sistema trabalha com os nomes dos polos, não com as letras."
          />
          {PERFIS.map((perfil) => {
            const quem = pessoas.filter((p) => {
              const reg = dnaDe(p.slug, lista);
              return reg && apurarRegistro(reg).codigo === perfil.codigo;
            });
            return (
              <Card key={perfil.codigo} padding={4}>
                <VStack gap={1.5}>
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Heading level={3}>{perfil.nome}</Heading>
                    <Token size="sm" color="teal" label={perfil.codigo} />
                    {quem.length > 0
                      ? quem.map((p) => (
                          <Button key={p.slug} size="sm" variant="ghost" label={p.curto}
                                  icon={<UserSearch size={12} />}
                                  onClick={() => abrirPessoa(p.slug)} />
                        ))
                      : <Text type="supporting">ninguém do time</Text>}
                  </HStack>
                  <Text type="supporting">{perfil.descricao}</Text>
                  <Divider />
                  <HStack gap={3} wrap="wrap" vAlign="start">
                    <VStack gap={0.5} width="46%">
                      <Text type="label">Motiva</Text>
                      <HStack gap={0.5} wrap="wrap">
                        {perfil.motivadores.map((m) => (
                          <Token key={m} size="sm" color="green" label={m} />
                        ))}
                      </HStack>
                    </VStack>
                    <VStack gap={0.5} width="46%">
                      <Text type="label">Desmotiva</Text>
                      <HStack gap={0.5} wrap="wrap">
                        {perfil.desmotivadores.map((m) => (
                          <Token key={m} size="sm" color="red" label={m} />
                        ))}
                      </HStack>
                    </VStack>
                  </HStack>
                </VStack>
              </Card>
            );
          })}
        </VStack>
      )}
    </Page>
  );
}

/**
 * O que a distribuição significa para a condução do time.
 *
 * Números sem leitura não mudam decisão nenhuma. Estas três frases são a parte
 * acionável — e saem do agregado, não de nenhuma conversa individual.
 */
function LeituraDoTime({ dist }: { dist: ReturnType<typeof distribuicaoDoTime> }) {
  const avisos: { titulo: string; texto: string }[] = [];

  for (const { eixo, contagem } of dist) {
    const total = contagem[0] + contagem[1];
    if (total < 3) continue;
    const [a, b] = eixo.polos;
    const dominio = contagem[0] / total;

    if (eixo.id === 'necessidade') {
      if (dominio >= 0.75) avisos.push({
        titulo: 'Time majoritariamente de Estabilidade',
        texto: 'Absorve pouca mudança de escopo em sequência. Replanejamento comunicado em cima da hora custa mais aqui do que o cronograma sugere — anuncie com antecedência e com o porquê.',
      });
      if (dominio <= 0.25) avisos.push({
        titulo: 'Time majoritariamente de Variedade',
        texto: 'Sustentação de legado e rotina longa desgastam rápido. Rodízio planejado entre frentes deixa de ser cortesia e vira medida de retenção.',
      });
    }

    if (eixo.id === 'impulso' && dominio >= 0.8) avisos.push({
      titulo: 'Time majoritariamente de Produção',
      texto: 'Entrega bem e cuida pouco do clima. Mentoria, onboarding e revisão de PR tendem a ficar sem dono — precisam ser alocados explicitamente, não esperados.',
    });

    if (eixo.id === 'premio' && dominio >= 0.8) avisos.push({
      titulo: 'Time majoritariamente de Interioridade',
      texto: 'Reconhecimento público rende pouco e pode até constranger. O que registra aqui é devolutiva específica e reservada, ligada ao sentido do trabalho.',
    });

    if (eixo.id === 'premio' && dominio <= 0.2) avisos.push({
      titulo: 'Time majoritariamente de Exterioridade',
      texto: 'Entrega grande sem retorno visível é o que corrói. Citar na daily, na retro e para o gestor não é formalidade — é parte da remuneração percebida.',
    });

    void b;
    void a;
  }

  if (avisos.length === 0) {
    return (
      <Card padding={4}>
        <Text type="supporting">
          A distribuição ainda não é concentrada o bastante para uma leitura de
          time — ou faltam leituras. Com poucos respondentes, o agregado diz
          mais sobre quem respondeu do que sobre o time.
        </Text>
      </Card>
    );
  }

  return (
    <Card padding={4}>
      <VStack gap={2}>
        <Heading level={3}>O que isso muda na condução do time</Heading>
        <List density="balanced" hasDividers>
          {avisos.map((a) => (
            <ListItem key={a.titulo} label={a.titulo}
                      startContent={<StatusDot variant="accent" label="Leitura" />}
                      description={<Text type="supporting">{a.texto}</Text>} />
          ))}
        </List>
      </VStack>
    </Card>
  );
}
