/**
 * Trilha QA → Dev.
 *
 * Duas premissas que o desenho assume explicitamente:
 *
 * 1. Nem todo QA vira dev, e tudo bem. N2 e N3 são SAÍDAS VÁLIDAS — quem chega
 *    a N3 já resolveu o problema de negócio mesmo que nunca escreva Delphi.
 *    Trilha com saída única transforma N3 em fracasso, o que é absurdo.
 *
 * 2. A trilha tem que ser capaz de ACUSAR O COORDENADOR. Se o critério trava
 *    por falta de oportunidade, o encaminhamento é seu, e a tela diz isso com
 *    todas as letras. Trilha que só cobra o liderado é pressão disfarçada de
 *    desenvolvimento.
 */

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Token } from '@astryxdesign/core/Token';
import { Button } from '@astryxdesign/core/Button';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { List, ListItem } from '@astryxdesign/core/List';
import { MessagesSquare, TrendingUp } from 'lucide-react';

import { Page, Metrica, Ev } from '../app/ui';
import { ListaDetalhe, Detalhe, Bloco, type LinhaEnxuta } from '../app/ListaDetalhe';
import { HOJE, diasEntre } from '../data/mock';
import { TRILHA, QAS, RITMO_COORTE, type QA } from '../data/mockCiclo';

interface Linha extends LinhaEnxuta { qa: QA }

const nivel = (id: string) => TRILHA.find((n) => n.id === id)!;

export default function Trilha() {
  const [verNiveis, setVerNiveis] = useState(false);

  const linhas: Linha[] = QAS.map((qa) => {
    const feitos = qa.progresso.filter((p) => p.feito).length;
    const total = qa.progresso.length;
    const parado = Math.max(0, ...qa.progresso.map((p) => p.diasParado ?? 0));
    return {
      id: qa.slug,
      titulo: qa.nome,
      dot: parado > 40 ? 'error' : parado > 20 ? 'warning' : 'success',
      dotLabel: parado > 40 ? 'Travado' : parado > 20 ? 'Atenção' : 'Avançando',
      marcadores: [
        { texto: nivel(qa.nivelAtual).nome.split(' · ')[0], cor: 'blue' as const },
        ...(qa.bloqueioEhMeu ? [{ texto: 'bloqueio meu', cor: 'red' as const }] : []),
      ],
      valor: `${feitos}/${total}`,
      qa,
    };
  });

  const travados = QAS.filter((q) => q.progresso.some((p) => (p.diasParado ?? 0) > 40));
  const meus = QAS.filter((q) => q.bloqueioEhMeu);
  const emSaidaValida = QAS.filter((q) => q.nivelAtual === 'n2' || q.nivelAtual === 'n3');

  return (
    <Page
      titulo="Trilha QA → Dev"
      subtitulo={`${QAS.length} QAs em transição · N2 e N3 são saídas válidas, não etapas`}
      acoes={<Button label={verNiveis ? 'Ver coorte' : 'Ver os 5 níveis'} variant="ghost"
                     onClick={() => setVerNiveis(!verNiveis)} />}
      largura={1240}
    >
      <HStack gap={2} wrap="wrap">
        <Metrica valor={QAS.length} rotulo="QAs na trilha" />
        <Metrica valor={emSaidaValida.length} rotulo="Já fora do teste manual"
                 nota="N2 ou acima — problema de negócio resolvido" cor="green" />
        <Metrica valor={travados.length} rotulo="Travados há 40+ dias" cor="red" />
        <Metrica valor={meus.length} rotulo="Travados por minha causa"
                 nota="falta de alocação, não de capacidade" cor="red" />
      </HStack>

      {meus.length > 0 && (
        <Banner
          status="error"
          title={`${meus.length} QAs travados por falta de oportunidade, não de competência`}
          description={`${meus.map((q) => q.nome).join(' e ')} dependem de acesso ou alocação que só eu destravo. O encaminhamento é meu.`}
        />
      )}

      {verNiveis ? (
        <VStack gap={2}>
          {TRILHA.map((n) => (
            <Card key={n.id} padding={3}
                  variant={n.saidaValida ? 'green' : 'default'}>
              <VStack gap={1.5}>
                <HStack gap={2} vAlign="center" wrap="wrap">
                  <Heading level={3}>{n.nome}</Heading>
                  <Token size="sm" color="gray" label={n.identidade} />
                  {n.saidaValida && <Token size="sm" color="green" label="saída válida" />}
                </HStack>
                {n.saidaValida && <Text type="supporting">{n.saidaValida}</Text>}
                <Divider />
                <Text type="label">Critérios para entrar neste nível</Text>
                <List density="compact">
                  {n.criterios.map((c) => (
                    <ListItem key={c} label={c}
                              startContent={<StatusDot variant="neutral" label="Critério" />} />
                  ))}
                </List>
              </VStack>
            </Card>
          ))}
          <Banner
            status="info"
            title="Mapa de competência, não promessa de cargo"
            description="Mesma regra do ciclo AVD: o sistema nunca escreve “promovido a”. Escreve “atingiu N3 em 12/03 com as evidências X, Y, Z”. Conversa de cargo é outra mesa."
          />
        </VStack>
      ) : (
        <Card padding={0}>
          <ListaDetalhe
            itens={linhas}
            larguraPainel={470}
            detalhe={(l) => {
              const qa = l.qa;
              const origem = nivel(qa.nivelAtual);
              const alvo = nivel(qa.nivelAlvo);
              const feitos = qa.progresso.filter((p) => p.feito).length;
              const dias = diasEntre(qa.entrouEm, HOJE);
              const ritmo = RITMO_COORTE[qa.nivelAlvo];
              return (
                <Detalhe
                  titulo={qa.nome}
                  marcadores={
                    <>
                      <Token size="sm" color="blue" label={origem.nome} />
                      <Token size="sm" color="gray" label={`alvo ${alvo.nome}`} />
                    </>
                  }
                >
                  <VStack gap={2}>
                    <Bloco rotulo={`Progresso para ${alvo.nome}`}>
                      <VStack gap={1}>
                        <ProgressBar
                          label={`${feitos} de ${qa.progresso.length} critérios`}
                          value={feitos} max={qa.progresso.length}
                          hasValueLabel
                          formatValueLabel={(v, m) => `${v} de ${m} critérios`}
                          variant={feitos === qa.progresso.length ? 'success'
                                 : feitos >= qa.progresso.length / 2 ? 'warning' : 'error'}
                        />
                        <Text type="supporting">
                          {dias} dias neste nível · ritmo do coorte: ~{ritmo} dias
                          {dias > ritmo ? ' — acima do esperado' : ''}
                        </Text>
                      </VStack>
                    </Bloco>

                    <Divider />
                    <Bloco rotulo="Critérios">
                      <List density="compact" hasDividers>
                        {alvo.criterios.map((c, i) => {
                          const p = qa.progresso[i];
                          return (
                            <ListItem
                              key={c}
                              label={c}
                              startContent={<StatusDot
                                variant={p.feito ? 'success'
                                       : (p.diasParado ?? 0) > 40 ? 'error' : 'warning'}
                                label={p.feito ? 'Atendido' : 'Pendente'} />}
                              endContent={p.feito
                                ? <Text type="supporting">✓</Text>
                                : <Text type="supporting">{p.diasParado}d parado</Text>}
                              description={p.evidencia ? <Ev refs={[p.evidencia]} /> : undefined}
                            />
                          );
                        })}
                      </List>
                    </Bloco>

                    {qa.bloqueio && (
                      <Banner
                        status={qa.bloqueioEhMeu ? 'error' : 'warning'}
                        title={qa.bloqueioEhMeu ? 'Bloqueio é meu' : 'Hipótese de bloqueio'}
                        description={qa.bloqueio}
                      />
                    )}

                    {qa.bloqueioEhMeu && (
                      <Bloco rotulo="Pergunta sugerida para a 1:1">
                        <Text type="body" weight="medium">
                          Os pontos que faltam dependem de você ter a oportunidade de executar.
                          Você está tendo, ou a alocação está te mantendo no manual?
                        </Text>
                      </Bloco>
                    )}

                    <Divider />
                    <HStack gap={1} wrap="wrap">
                      <Button icon={<TrendingUp size={14} />} size="sm" variant="primary" label="Registrar avanço"
                              isDisabled={feitos < qa.progresso.length} />
                      <Button icon={<MessagesSquare size={14} />} size="sm" variant="ghost" label="Levar para a 1:1" />
                    </HStack>
                    <Text type="supporting">
                      A passagem de nível exige as três coisas: critérios atendidos, evidência
                      rastreável de cada um e decisão sua, registrada e datada. Nunca automática.
                    </Text>
                  </VStack>
                </Detalhe>
              );
            }}
          />
        </Card>
      )}
    </Page>
  );
}
