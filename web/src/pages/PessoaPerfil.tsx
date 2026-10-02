/**
 * Perfil do liderado — tudo sobre uma pessoa em um lugar.
 *
 * Era o buraco central do sistema: os dados existiam espalhados por seis telas
 * e, para preparar uma conversa ou defender uma nota, você tinha que visitar
 * todas. Aqui a pessoa é o eixo e o resto é aba.
 *
 * Ordem das abas = ordem de uso real, não ordem de importância abstrata:
 * primeiro o que você precisa antes da próxima conversa, depois o que sustenta
 * o ciclo. DNA vem cedo porque muda COMO você conduz tudo o que vem depois.
 *
 * A confidencialidade continua valendo aqui: o que é privado aparece marcado,
 * e o que é saúde aparece como contagem sem conteúdo.
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
import { Avatar } from '@astryxdesign/core/Avatar';
import { ArrowLeft, MessagesSquare, Sparkles } from 'lucide-react';

import { Page, Stats, Conf, corDaCadeira, rotuloCargo } from '../app/ui';
import { Bloco } from '../app/ListaDetalhe';
import { useNavegacao } from '../app/navegacao';
import {
  porSlug, nivelDe, timeDe, ehNovo, HOJE, diasEntre, dataBR, moeda, mesesEntre,
  COMPROMISSOS, TEMAS, DNA as DNA_QUALITATIVO,
} from '../data/mock';
import { carregarConfig } from '../config';
import { squadsDe } from '../data/squads';
import { REGISTROS, FEEDBACKS } from '../data/registros';
import { SKILLS, NIVEIS, AUTO, NIVEL_ROTULO, NIVEL_COR, AVD, QAS, PDIS, TRILHA, media, faixa } from '../data/mockCiclo';
import { skillsDoCargo } from '../data/cadastro';
import { carregarCiclos, cicloVigente } from '../data/ciclos';
import {
  dnaDe, apurarRegistro, condutaDe, historicoDe, descricaoPessoal, intensidadeDe, ROTULO_POLO,
} from '../data/dna';
import { QuestionarioDNA } from './dna/Questionario';

const ROTULO_PARTE: Record<string, string> = {
  compartilhavel: 'Parte 1 · compartilhável',
  privado_coordenador: 'Parte 2 · privado',
  avaliacao_1a1: 'Avaliação da portal de avaliação',
};

export default function PessoaPerfil({ slug }: { slug: string }) {
  const { fecharPessoa, ir } = useNavegacao();
  const [aba, setAba] = useState('geral');

  const p = porSlug(slug);
  const cfg = carregarConfig();
  const limite = cfg.cadenciaDias + cfg.folgaCadenciaDias;
  const dias = diasEntre(p.ultima1a1, HOJE);

  const regs = REGISTROS.filter((r) => r.slug === slug)
    .sort((a, b) => b.data.localeCompare(a.data));
  const fbs = FEEDBACKS.filter((f) => f.slug === slug);
  const reg = dnaDe(slug);
  const avaliacao = AVD.find((a) => a.slug === slug);
  const qa = QAS.find((q) => q.slug === slug);
  const pdi = PDIS.find((x) => x.slug === slug);
  const abertos = COMPROMISSOS.filter((c) => c.pessoa === slug && c.status !== 'concluido');

  const squads = squadsDe(slug, cfg.squads);

  return (
    <Page
      titulo={p.nome}
      subtitulo={`${p.cargo}${p.techLead ? ' · Tech Lead' : ''} · ${timeDe(p.time).nome}${
        squads.length ? ` · ${squads.map((s) => s.nome).join(', ')}` : ' · sem squad'}`}
      largura={1240}
      acoes={
        <HStack gap={1} wrap="wrap">
          <Button icon={<MessagesSquare size={14} />} variant="primary"
                  label="Preparar 1:1" onClick={() => ir('preparo')} />
          <Button icon={<ArrowLeft size={14} />} variant="ghost"
                  label="Voltar" onClick={fecharPessoa} />
        </HStack>
      }
    >
      <Card padding={4}>
        <HStack gap={3} vAlign="center" wrap="wrap">
          <Avatar name={p.nome} size="lg" />
          <VStack gap={1}>
            <HStack gap={1} wrap="wrap" vAlign="center">
              <Token size="sm" color={corDaCadeira(p.familia, nivelDe(p))} label={rotuloCargo(p)} />
              {p.quadrante
                ? <Token size="sm" color="blue" label={p.quadrante} />
                : <Token size="sm" color="gray" label={p.motivoInelegivel ?? 'fora do ciclo'} />}
              {p.status === 'afastado' && <Token size="sm" color="orange" label="afastado" />}
              {p.status === 'fora_gestao' && <Token size="sm" color="gray" label="fora da gestão" />}
              {ehNovo(p) && <Token size="sm" color="purple" label="menos de 120 dias de casa" />}
              {reg?.origem && (
                <Token size="sm" color="teal"
                       label={apurarRegistro(reg).codigo ?? 'DNA incompleto'} />
              )}
            </HStack>
            <Text type="supporting">
              Admitido em {dataBR(p.admissao)} · última 1:1 há {dias} dias
              {dias > limite ? ' — fora da cadência' : ''}
            </Text>
          </VStack>
        </HStack>
      </Card>

      {p.status === 'afastado' && p.motivoAfastamento && (
        <Banner
          status="info"
          title="Pessoa afastada"
          description={`${p.motivoAfastamento}${
            p.retornoPrevisto ? ` · retorno previsto ${dataBR(p.retornoPrevisto)}` : ''}. O período sai do cálculo de cadência e de avaliação.`}
        />
      )}

      <Stats itens={[
        { valor: regs.length, rotulo: '1:1 registradas', cor: regs.length ? undefined : 'red' },
        { valor: dias, rotulo: 'dias desde a última', cor: dias > limite ? 'red' : undefined },
        { valor: abertos.length, rotulo: 'compromissos abertos' },
        { valor: fbs.length, rotulo: 'feedbacks avulsos' },
        { valor: reg ? (apurarRegistro(reg).codigo ?? '—') : '—', rotulo: 'DNA motivacional' },
        { valor: p.trajetoria.length, rotulo: 'avaliações mensais' },
      ]} />

      <TabList value={aba} onChange={setAba} hasDivider>
        <Tab value="geral" label="Visão geral" />
        <Tab value="dna" label="DNA motivacional" />
        <Tab value="conversas" label={`1:1 e feedbacks (${regs.length + fbs.length})`} />
        <Tab value="skills" label="Skills" />
        <Tab value="avd" label="AVD" />
        <Tab value="desenvolvimento" label="PDI e trilha" />
      </TabList>

      {aba === 'geral' && <Geral slug={slug} />}
      {aba === 'dna' && <AbaDNA slug={slug} />}
      {aba === 'conversas' && <Conversas slug={slug} />}
      {aba === 'skills' && <AbaSkills slug={slug} />}
      {aba === 'avd' && <AbaAVD slug={slug} avaliacao={avaliacao} />}
      {aba === 'desenvolvimento' && <Desenvolvimento qa={qa} pdi={pdi} />}
    </Page>
  );
}

/* ---------- visão geral ---------- */

function Geral({ slug }: { slug: string }) {
  const p = porSlug(slug);
  const dna = DNA_QUALITATIVO[slug];
  const temas = TEMAS[slug];
  const abertos = COMPROMISSOS.filter((c) => c.pessoa === slug && c.status !== 'concluido');
  const meus = abertos.filter((c) => c.responsavel === 'coordenador');

  return (
    <VStack gap={3}>
      {meus.length > 0 && (
        <Banner
          status="warning"
          title={`${meus.length} compromisso(s) em aberto que são SEUS`}
          description={meus.map((c) => c.descricao).join(' · ')}
        />
      )}

      <Card padding={4}>
        <VStack gap={2}>
          <Heading level={3}>Trajetória</Heading>
          {p.trajetoria.length === 0
            ? <Text type="supporting">Sem avaliação mensal registrada.</Text>
            : (
              <HStack gap={0.5} wrap="wrap">
                {p.trajetoria.map((t, i) => (
                  <Token key={i} size="sm"
                         color={t === 'E' ? 'green' : t === 'S' ? 'blue' : 'gray'}
                         label={t === 'af' ? 'afastado' : t === 'E' ? 'Excepcional' : 'Satisfatório'} />
                ))}
              </HStack>
            )}
          <Text type="supporting">
            A série vai inteira. Escolher os meses bons é o jeito mais rápido de
            produzir uma defesa que a mesa derruba.
          </Text>
        </VStack>
      </Card>

      {temas && (
        <Card padding={4}>
          <VStack gap={2}>
            <Heading level={3}>Temas das conversas</Heading>
            <List density="compact" hasDividers>
              {temas.recorrentes.map((r) => (
                <ListItem
                  key={r.tema}
                  label={r.tema}
                  startContent={<StatusDot variant="warning" label="Recorrente" />}
                  endContent={<Text type="supporting">{r.ocorrencias}/{r.janela}</Text>}
                  description={<Text type="supporting">{r.nota}</Text>}
                />
              ))}
              {temas.ausentes.map((a) => (
                <ListItem
                  key={a.tema}
                  label={a.tema}
                  startContent={<StatusDot variant="neutral" label="Ausente" />}
                  endContent={<Text type="supporting">{a.conversasSem} conversas</Text>}
                  description={<Text type="supporting">
                    {a.ultimo ? `último registro ${dataBR(a.ultimo)}` : 'nunca mencionado'}
                  </Text>}
                />
              ))}
            </List>
          </VStack>
        </Card>
      )}

      <Remuneracao slug={slug} />

      {dna && (
        <Card padding={4}>
          <VStack gap={2}>
            <Heading level={3}>Leitura qualitativa</Heading>
            <Bloco rotulo="Como dar feedback">
              {`${dna.prefFeedback} · reconhecimento ${dna.prefReconhecimento}`}
            </Bloco>
            <Bloco rotulo="Âncora de carreira">
              {`${dna.ancoraPrimaria} · rejeita ${dna.ancoraRejeitada}`}
            </Bloco>
            <Bloco rotulo="Aspiração declarada">{`“${dna.aspiracao}”`}</Bloco>
          </VStack>
        </Card>
      )}
    </VStack>
  );
}

/**
 * Remuneração — confidencialidade 3, atrás de um clique.
 *
 * Fica oculto por padrão porque esta tela é aberta em reunião e com gente
 * olhando a mesma mesa. Esconder não é segurança (o dado está aqui), é evitar
 * o vazamento banal: o salário aparecer de relance para quem passa atrás.
 *
 * O que vale como gestão não é o valor e sim o TEMPO sem reajuste. Nos seus
 * próprios registros o tema aparece sempre como "mantido apenas no privado" —
 * o sistema só reproduz a regra que você já pratica.
 */
function Remuneracao({ slug }: { slug: string }) {
  const [visivel, setVisivel] = useState(false);
  const p = porSlug(slug);

  if (!p.salario && !p.ultimoReajuste) {
    return (
      <Card padding={4}>
        <HStack gap={2} vAlign="center" wrap="wrap" hAlign="between">
          <VStack gap={0.5}>
            <Heading level={3}>Remuneração</Heading>
            <Text type="supporting">
              Sem salário cadastrado. Preencha em Cadastros › Pessoas.
            </Text>
          </VStack>
          <Conf nivel={3} />
        </HStack>
      </Card>
    );
  }

  const meses = p.ultimoReajuste ? mesesEntre(p.ultimoReajuste) : null;
  // Doze meses é o marco em que a conversa sobre mérito deixa de ser
  // antecipação e vira pendência — inclusive para o liderado.
  const parado = meses !== null && meses >= 12;

  return (
    <Card padding={4}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center" wrap="wrap" hAlign="between">
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Heading level={3}>Remuneração</Heading>
            <Conf nivel={3} />
            {parado && (
              <Token size="sm" color="orange" label={`${meses} meses sem reajuste`} />
            )}
          </HStack>
          <Button size="sm" variant="ghost"
                  label={visivel ? 'Ocultar valores' : 'Mostrar valores'}
                  onClick={() => setVisivel(!visivel)} />
        </HStack>

        {visivel ? (
          <HStack gap={3} wrap="wrap">
            {p.salario !== undefined && (
              <Bloco rotulo="Salário atual">{moeda(p.salario)}</Bloco>
            )}
            {p.faixaSalarial && <Bloco rotulo="Faixa">{p.faixaSalarial}</Bloco>}
            {p.ultimoReajuste && (
              <Bloco rotulo="Último reajuste">
                {`${dataBR(p.ultimoReajuste)} · há ${meses} meses`}
              </Bloco>
            )}
          </HStack>
        ) : (
          <Text type="supporting">
            {meses !== null
              ? `Último reajuste há ${meses} meses. Os valores estão ocultos.`
              : 'Valores ocultos.'}
          </Text>
        )}

        {parado && (
          <Banner
            status="warning"
            title="Mais de um ano sem reajuste"
            description="É sinal de retenção, não de desempenho. Entra na sua preparação de 1:1 como assunto seu — mas nunca em justificativa de AVD: remuneração não é argumento de nota, e durante a calibragem o tema é proibido na conversa."
          />
        )}

        <Text type="supporting">
          Nível 3: não sai em relatório, export ou pacote para IA. Nem para o RH.
        </Text>
      </VStack>
    </Card>
  );
}

/* ---------- DNA ---------- */

function AbaDNA({ slug }: { slug: string }) {
  const [responder, setResponder] = useState(false);
  const hist = historicoDe(slug);
  const reg = hist[0];

  if (responder || !reg) {
    return (
      <VStack gap={2}>
        {!reg && (
          <Banner
            status="info"
            title="Esta pessoa ainda não tem DNA motivacional registrado"
            description="São 21 escolhas forçadas. Em cada par, a afirmativa que melhor descreve como ela age na maior parte da vida. Responder junto na 1:1 costuma render mais que mandar a planilha."
          />
        )}
        <QuestionarioDNA slug={slug} aoSalvar={() => setResponder(false)}
                         aoCancelar={reg ? () => setResponder(false) : undefined} />
      </VStack>
    );
  }

  const ap = apurarRegistro(reg);
  const condutas = condutaDe(ap);

  return (
    <VStack gap={3}>
      <Card padding={4}>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center" wrap="wrap" hAlign="between">
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Heading level={2}>{ap.perfil?.nome ?? 'Perfil incompleto'}</Heading>
              {ap.codigo && <Token size="sm" color="teal" label={ap.codigo} />}
              <Text type="supporting">
                lido em {dataBR(reg.data)} · {reg.origem === 'planilha' ? 'importado da planilha' : 'respondido no sistema'}
              </Text>
            </HStack>
            <Button size="sm" variant="ghost" label="Nova leitura"
                    onClick={() => setResponder(true)} />
          </HStack>

          {/* A leitura desta pessoa primeiro; o texto do tipo é referência. */}
          <VStack gap={1}>
            {descricaoPessoal(ap, porSlug(slug).curto).map((par, i) => (
              <Text key={i} type="body">{par}</Text>
            ))}
          </VStack>

          {ap.perfil && (
            <Bloco rotulo={`Descrição do tipo ${ap.perfil.codigo}`}>
              <Text type="supporting">{ap.perfil.descricao}</Text>
            </Bloco>
          )}

          <Divider />

          {/* Cada eixo com os dois polos: a MARGEM importa tanto quanto o lado. */}
          <VStack gap={2}>
            {ap.eixos.map((e) => {
              const [a, b] = e.eixo.polos;
              const total = e.pontos[0] + e.pontos[1] || 1;
              return (
                <VStack key={e.eixo.id} gap={0.5}>
                  <HStack gap={2} vAlign="center" wrap="wrap" hAlign="between">
                    <Text type="label">{e.eixo.nome}</Text>
                    <HStack gap={1} vAlign="center">
                      <Text type="supporting">
                        {ROTULO_POLO[a]} {e.pontos[0]} · {ROTULO_POLO[b]} {e.pontos[1]}
                      </Text>
                      <Token size="sm" color={e.margem <= 1 ? 'orange' : 'teal'}
                             label={`${ROTULO_POLO[e.vencedor]} · ${intensidadeDe(e)}`} />
                    </HStack>
                  </HStack>
                  <ProgressBar
                    label={`${e.eixo.nome}: ${ROTULO_POLO[e.vencedor]}`}
                    isLabelHidden
                    value={e.pontos[0]}
                    max={total}
                    variant={e.margem <= 1 ? 'warning' : 'accent'}
                  />
                  <Text type="supporting">{e.eixo.pergunta}</Text>
                </VStack>
              );
            })}
          </VStack>

          {ap.fracos.length > 0 && (
            <Banner
              status="warning"
              title={`${ap.fracos.length} eixo(s) decidido(s) por 1 ponto`}
              description={`${ap.fracos.map((e) => e.eixo.nome).join(', ')} — a letra do código saiu, mas a preferência é fraca. Trate como "transita entre os dois", não como traço.`}
            />
          )}
        </VStack>
      </Card>

      {ap.perfil && (
        <HStack gap={3} wrap="wrap" vAlign="stretch">
          <Card padding={4} width="48%">
            <VStack gap={1.5}>
              <Heading level={3}>Motiva</Heading>
              <List density="compact" hasDividers>
                {ap.perfil.motivadores.map((m) => (
                  <ListItem key={m} label={m}
                            startContent={<StatusDot variant="success" label="Motiva" />} />
                ))}
              </List>
            </VStack>
          </Card>
          <Card padding={4} width="48%">
            <VStack gap={1.5}>
              <Heading level={3}>Desmotiva</Heading>
              <List density="compact" hasDividers>
                {ap.perfil.desmotivadores.map((m) => (
                  <ListItem key={m} label={m}
                            startContent={<StatusDot variant="error" label="Desmotiva" />} />
                ))}
              </List>
            </VStack>
          </Card>
        </HStack>
      )}

      <Card padding={4}>
        <VStack gap={2}>
          <Heading level={3}>O que isso muda na sua conduta</Heading>
          <Text type="supporting">
            A parte que transforma o teste em ferramenta. Sem ela o resultado é
            um rótulo bonito que ninguém usa na segunda-feira.
          </Text>
          <List density="balanced" hasDividers>
            {condutas.map((c) => (
              <ListItem key={c.titulo} label={c.titulo}
                        startContent={<StatusDot variant="accent" label="Conduta" />}
                        description={<Text type="supporting">{c.texto}</Text>} />
            ))}
          </List>
        </VStack>
      </Card>

      {ap.perfil && (
        <Card padding={4}>
          <VStack gap={2}>
            <Heading level={3}>Como ela atinge metas</Heading>
            <List density="balanced" hasDividers>
              {ap.perfil.dicas.map((d, i) => (
                <ListItem key={i} label={d}
                          startContent={<StatusDot variant="neutral" label={`Dica ${i + 1}`} />} />
              ))}
            </List>
          </VStack>
        </Card>
      )}

      {hist.length > 1 && (
        <Card padding={4}>
          <VStack gap={2}>
            <Heading level={3}>Histórico de leituras</Heading>
            <Text type="supporting">
              O delta entre duas leituras é o sinal de retenção mais honesto que
              existe — mais que qualquer score preditivo.
            </Text>
            <List density="compact" hasDividers>
              {hist.map((r) => {
                const a = apurarRegistro(r);
                return (
                  <ListItem
                    key={r.data}
                    label={dataBR(r.data)}
                    startContent={<StatusDot variant="neutral" label="Leitura" />}
                    endContent={<Token size="sm" color="teal" label={a.codigo ?? '—'} />}
                    description={<Text type="supporting">
                      {a.perfil?.nome ?? 'incompleto'} · {r.origem === 'planilha' ? 'planilha' : 'questionário'}
                    </Text>}
                  />
                );
              })}
            </List>
          </VStack>
        </Card>
      )}

      <Banner
        status="info"
        title="Isto não entra em avaliação de desempenho"
        description="Motivação não é argumento de nota. O pacote de insumo da AVD exclui o DNA por desenho, não por esquecimento — serve para decidir como conversar, alocar e reconhecer."
      />
    </VStack>
  );
}

/* ---------- conversas ---------- */

function Conversas({ slug }: { slug: string }) {
  const [filtro, setFiltro] = useState('');
  const regs = REGISTROS.filter((r) => r.slug === slug)
    .sort((a, b) => b.data.localeCompare(a.data));
  const fbs = FEEDBACKS.filter((f) => f.slug === slug);

  const visiveis = regs.filter((r) =>
    !filtro || r.tema.toLowerCase().includes(filtro.toLowerCase()));

  if (regs.length === 0 && fbs.length === 0) {
    return (
      <Banner
        status="warning"
        title="Nenhuma 1:1 processada nem feedback registrado"
        description="A conversa pode ter acontecido e a transcrição não ter virado registro. Confira a fila em Importações."
      />
    );
  }

  return (
    <VStack gap={2}>
      <Card padding={0}>
        <List density="balanced" hasDividers>
          {visiveis.map((r) => (
            <ListItem
              key={r.arquivo}
              label={`${dataBR(r.data)} · ${r.duracao}`}
              startContent={<StatusDot variant="success" label={`${r.partes.length} partes`} />}
              description={
                <VStack gap={0.5}>
                  <Text type="supporting">{r.tema}</Text>
                  <HStack gap={0.5} wrap="wrap" vAlign="center">
                    {r.partes.map((parte) => (
                      <HStack key={parte.formato} gap={0.5} vAlign="center">
                        <Conf nivel={parte.conf} />
                        <Text type="supporting">{ROTULO_PARTE[parte.formato]}</Text>
                      </HStack>
                    ))}
                  </HStack>
                  <HStack gap={0.5} wrap="wrap" vAlign="center">
                    {r.performance && (
                      <Token size="sm" color={r.performance.startsWith('Excep') ? 'green' : 'blue'}
                             label={`${r.performance}${r.impacto ? ` · impacto ${r.impacto}` : ''}`} />
                    )}
                    {r.encaminhamentos > 0 && (
                      <Token size="sm" color={r.prazosVagos ? 'orange' : 'gray'}
                             label={`${r.encaminhamentos} encaminhamentos${
                               r.prazosVagos ? ` · ${r.prazosVagos} sem data` : ''}`} />
                    )}
                    {r.meus > 0 && <Token size="sm" color="red" label={`${r.meus} seus`} />}
                    {r.omitidos > 0 && <Token size="sm" color="gray" label={`${r.omitidos} omitidos`} />}
                    {r.omitidoSaude > 0 && (
                      <Token size="sm" color="red" label={`${r.omitidoSaude} de saúde`} />
                    )}
                  </HStack>
                </VStack>
              }
            />
          ))}
        </List>
      </Card>

      {fbs.length > 0 && (
        <Card padding={4}>
          <VStack gap={2}>
            <Heading level={3}>Feedbacks avulsos</Heading>
            <List density="compact" hasDividers>
              {fbs.map((f) => (
                <ListItem key={f.arquivo} label={f.titulo}
                          startContent={<StatusDot variant="accent" label="Feedback" />}
                          endContent={<Text type="supporting">{f.data ? dataBR(f.data) : '—'}</Text>} />
              ))}
            </List>
          </VStack>
        </Card>
      )}

      {filtro && visiveis.length === 0 && (
        <Text type="supporting">Nenhuma conversa com esse termo no tema.</Text>
      )}
      <Text type="supporting">
        O conteúdo integral fica no arquivo. Aqui está o índice com a
        confidencialidade de cada parte — só a Parte 1 é entregável à pessoa.
      </Text>
      <input hidden value={filtro} onChange={(e) => setFiltro(e.target.value)} readOnly />
    </VStack>
  );
}

/* ---------- skills ---------- */

function AbaSkills({ slug }: { slug: string }) {
  const p = porSlug(slug);
  const esperado = skillsDoCargo(p.cargo, p.techLead);
  const atual = NIVEIS[slug] ?? {};
  const auto = AUTO[slug] ?? {};
  const nome = (cod: string) => SKILLS.find((s) => s.codigo === cod)?.nome ?? cod;

  const temLeitura = Object.keys(atual).length > 0;
  const extras = Object.keys(atual).filter((c) => !esperado.some((e) => e.codigo === c));

  return (
    <VStack gap={2}>
      {!temLeitura && (
        <Banner
          status="warning"
          title="Nenhuma skill avaliada ainda"
          description={`A cadeira de ${p.cargo} cobra ${esperado.length} competências. Sem leitura não há gap a cobrar — há uma pendência sua.`}
        />
      )}

      <Card padding={4}>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Heading level={3}>Skills da cadeira</Heading>
            <Token size="sm" color={corDaCadeira(p.familia, nivelDe(p))} label={p.cargo} />
            <Text type="supporting">{esperado.length} competências esperadas</Text>
          </HStack>

          <List density="compact" hasDividers>
            {esperado.map((e) => {
              const n = atual[e.codigo] ?? 0;
              const a = auto[e.codigo];
              const abaixo = temLeitura && n < e.nivelEsperado;
              const gap = a !== undefined ? Math.abs(a - n) : 0;
              return (
                <ListItem
                  key={e.codigo}
                  label={nome(e.codigo)}
                  startContent={<StatusDot
                    variant={!temLeitura ? 'neutral' : abaixo ? 'warning' : 'success'}
                    label={!temLeitura ? 'Sem leitura' : abaixo ? 'Abaixo do esperado' : 'Atinge a cadeira'} />}
                  endContent={
                    <HStack gap={0.5} vAlign="center" wrap="wrap">
                      <Token size="sm" color={NIVEL_COR[n]} label={`${n} ${NIVEL_ROTULO[n]}`} />
                      {abaixo && <Token size="sm" color="red" label={`alvo ${e.nivelEsperado}`} />}
                      {a !== undefined && (
                        <Token size="sm" color={gap >= 2 ? 'red' : 'purple'} label={`auto ${a}`} />
                      )}
                    </HStack>
                  }
                  description={gap >= 2
                    ? <Text type="supporting">
                        Divergência de {gap} níveis entre a autoavaliação e a sua leitura — pauta obrigatória.
                      </Text>
                    : undefined}
                />
              );
            })}
          </List>
        </VStack>
      </Card>

      {extras.length > 0 && (
        <Card padding={4}>
          <VStack gap={1.5}>
            <Heading level={3}>Fora da cadeira</Heading>
            <Text type="supporting">
              Competências que a pessoa tem e o cargo não cobra. Não é lacuna —
              é onde uma mudança de cadeira já tem base.
            </Text>
            <HStack gap={0.5} wrap="wrap">
              {extras.map((c) => (
                <Token key={c} size="sm" color="gray" label={`${nome(c)} ${atual[c]}`} />
              ))}
            </HStack>
          </VStack>
        </Card>
      )}
    </VStack>
  );
}

/* ---------- AVD ---------- */

function AbaAVD({ slug, avaliacao }: {
  slug: string;
  avaliacao: typeof AVD[number] | undefined;
}) {
  const p = porSlug(slug);
  const ciclos = carregarCiclos();
  const ciclo = ciclos.find((c) => c.id === avaliacao?.ciclo) ?? cicloVigente(ciclos);
  const escala = ['', ...ciclo.rotulosEscala];

  if (!avaliacao) {
    return (
      <Banner
        status="info"
        title={`Sem avaliação lançada em ${ciclo.nome}`}
        description={p.elegivel
          ? 'A pessoa é elegível ao ciclo, mas as notas ainda não foram registradas no sistema.'
          : `Fora do ciclo: ${p.motivoInelegivel ?? 'inelegível'}.`}
      />
    );
  }

  const mc = media(avaliacao.comportamento);
  const md = media(avaliacao.desempenho);
  const buracos = avaliacao.semEvidenciaComp.length + avaliacao.semEvidenciaDesemp.length;

  const eixo = (nomes: string[], notas: number[], semEv: number[], offset: number) => (
    <List density="compact" hasDividers>
      {nomes.map((n, i) => (
        <ListItem
          key={n}
          label={n}
          startContent={<StatusDot variant={semEv.includes(i) ? 'error' : 'success'}
                                   label={semEv.includes(i) ? 'Sem evidência' : 'Com evidência'} />}
          endContent={
            <HStack gap={0.5} vAlign="center">
              <Token size="sm" color={NIVEL_COR[notas[i]]} label={`${notas[i]} ${escala[notas[i]]}`} />
              {semEv.includes(i) && <Token size="sm" color="red" label="sem lastro" />}
            </HStack>
          }
          description={avaliacao.comentarios[i + offset]
            ? <Text type="supporting">{avaliacao.comentarios[i + offset]}</Text>
            : undefined}
        />
      ))}
    </List>
  );

  return (
    <VStack gap={2}>
      <Card padding={4}>
        <VStack gap={1.5}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Heading level={3}>{ciclo.nome}</Heading>
            <Token size="sm" color="blue" label={avaliacao.quadrante} />
            <Token size="sm" color="gray" label={`Comportamento ${mc.toFixed(2)} (${faixa(mc)})`} />
            <Token size="sm" color="gray" label={`Desempenho ${md.toFixed(2)} (${faixa(md)})`} />
          </HStack>
          {avaliacao.auto && (
            <Banner
              status={Math.abs(avaliacao.auto.desempenho - md) >= 0.8 ? 'error' : 'info'}
              title={`Autoavaliação: C ${avaliacao.auto.comportamento.toFixed(2)} · D ${avaliacao.auto.desempenho.toFixed(2)}`}
              description={Math.abs(avaliacao.auto.desempenho - md) >= 0.8
                ? 'Divergência grande em relação à sua leitura. A mesa vai perguntar por quê — leve a trajetória completa e casos concretos.'
                : 'Leituras próximas. Gap pequeno não costuma ser questionado na calibragem.'}
            />
          )}
          {buracos > 0 && (
            <Banner
              status="warning"
              title={`${buracos} driver(s) sem evidência vinculada`}
              description="Driver sem lastro é o que a mesa derruba primeiro. Vincule antes de fechar o ciclo."
            />
          )}
        </VStack>
      </Card>

      <Card padding={4}>
        <VStack gap={2}>
          <Heading level={3}>Comportamento</Heading>
          {eixo(ciclo.driversComportamento, avaliacao.comportamento, avaliacao.semEvidenciaComp, 0)}
          <Divider />
          <Heading level={3}>Desempenho</Heading>
          {eixo(ciclo.driversDesempenho, avaliacao.desempenho, avaliacao.semEvidenciaDesemp,
                ciclo.driversComportamento.length)}
        </VStack>
      </Card>

      <Text type="supporting">
        A nota quem digita é você. A IA propõe faixa, lista evidências e redige a
        justificativa a partir da nota — nunca o contrário.
      </Text>
    </VStack>
  );
}

/* ---------- desenvolvimento ---------- */

function Desenvolvimento({ qa, pdi }: {
  qa: typeof QAS[number] | undefined;
  pdi: typeof PDIS[number] | undefined;
}) {
  return (
    <VStack gap={3}>
      {!pdi && (
        <Banner
          status="warning"
          title="Sem PDI registrado"
          description="Objetivo de PDI sem skill-alvo é incobrável. A função mais valiosa da tela de PDI não é o editor — é a lista de quem não tem."
        />
      )}

      {pdi && (
        <Card padding={4}>
          <VStack gap={2}>
            <Heading level={3}>PDI · ciclo {pdi.ciclo}</Heading>
            {pdi.objetivos.map((o) => (
              <VStack key={o.titulo} gap={1}>
                <Text type="label">{o.titulo}</Text>
                <Text type="supporting">{o.porQue}</Text>
                <List density="compact" hasDividers>
                  {o.marcos.map((m) => (
                    <ListItem
                      key={m.titulo}
                      label={m.titulo}
                      startContent={<StatusDot
                        variant={m.status === 'concluido' ? 'success'
                               : m.status === 'em_andamento' ? 'warning' : 'neutral'}
                        label={m.status} />}
                      endContent={<Text type="supporting">{dataBR(m.prazo)}</Text>}
                      description={<Text type="supporting">
                        {m.skill} → nível {m.nivelAlvo}
                      </Text>}
                    />
                  ))}
                </List>
              </VStack>
            ))}
          </VStack>
        </Card>
      )}

      {qa && (
        <Card padding={4}>
          <VStack gap={2}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Heading level={3}>Trilha QA → Dev</Heading>
              <Token size="sm" color="blue" label={`${qa.nivelAtual} → ${qa.nivelAlvo}`} />
              <Text type="supporting">na trilha desde {dataBR(qa.entrouEm)}</Text>
            </HStack>

            <List density="compact" hasDividers>
              {(TRILHA.find((n) => n.id === qa.nivelAlvo)?.criterios ?? []).map((c, i) => {
                const prog = qa.progresso[i];
                return (
                  <ListItem
                    key={c}
                    label={c}
                    startContent={<StatusDot
                      variant={prog?.feito ? 'success' : (prog?.diasParado ?? 0) > 40 ? 'error' : 'neutral'}
                      label={prog?.feito ? 'Atingido' : 'Pendente'} />}
                    endContent={prog?.diasParado
                      ? <Token size="sm" color={prog.diasParado > 40 ? 'red' : 'orange'}
                               label={`parado há ${prog.diasParado}d`} />
                      : prog?.evidencia
                        ? <Token size="sm" color="gray" label={prog.evidencia} />
                        : undefined}
                  />
                );
              })}
            </List>

            {qa.bloqueio && (
              <Banner
                status={qa.bloqueioEhMeu ? 'error' : 'warning'}
                title={qa.bloqueioEhMeu
                  ? 'Bloqueio provável: o encaminhamento é SEU'
                  : 'Bloqueio provável'}
                description={qa.bloqueio}
              />
            )}
          </VStack>
        </Card>
      )}

      {!qa && !pdi && (
        <Card padding={4}>
          <HStack gap={2} vAlign="center">
            <Sparkles size={16} />
            <Text type="supporting">
              Sem PDI e fora da trilha QA. É onde a conversa de desenvolvimento
              ainda não começou.
            </Text>
          </HStack>
        </Card>
      )}
    </VStack>
  );
}
