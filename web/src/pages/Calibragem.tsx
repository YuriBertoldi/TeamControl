/**
 * Calibragem — a geração automática do Defesas-Calibragem.md.
 *
 * Esse arquivo é hoje o artefato de maior valor da pasta e é 100% manual,
 * reconstruído todo ciclo relendo 28 registros. Aqui ele é uma projeção das
 * evidências.
 *
 * O bloco "por que não maior" é obrigatório e vem das evidências de valência
 * contrária. Sem ele a peça vira advocacia cega — que é o que a mesa derruba.
 */

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Download, PenLine, RefreshCw, ShieldCheck } from 'lucide-react';

import { Page, Metrica, Ev } from '../app/ui';
import { ListaDetalhe, Detalhe, Bloco, type LinhaEnxuta } from '../app/ListaDetalhe';
import { porSlug } from '../data/mock';
import { DEFESAS, AVD, media, faixa, type Defesa } from '../data/mockCiclo';
import { useCiclo, SeletorCiclo } from '../app/SeletorCiclo';

const COR_RISCO = { alto: 'red', medio: 'orange', baixo: 'green' } as const;
const DOT_RISCO = { alto: 'error', medio: 'warning', baixo: 'success' } as const;

interface Linha extends LinhaEnxuta { d: Defesa }

export default function Calibragem() {
  const { ciclos, ciclo, trocar, bloqueado } = useCiclo();
  const [modoMesa, setModoMesa] = useState(false);

  const linhas: Linha[] = DEFESAS.map((d) => {
    const a = AVD.find((x) => x.slug === d.slug)!;
    return {
      id: d.slug,
      titulo: porSlug(d.slug).nome,
      dot: DOT_RISCO[d.nivelRisco],
      dotLabel: `Risco ${d.nivelRisco}`,
      marcadores: [
        { texto: a.quadrante, cor: 'blue' as const },
        { texto: `risco ${d.nivelRisco}`, cor: COR_RISCO[d.nivelRisco] },
      ],
      valor: `${d.evidencias.length} ev.`,
      d,
    };
  });

  const altos = DEFESAS.filter((d) => d.nivelRisco === 'alto');
  const semDefesa = AVD.length - DEFESAS.length;

  return (
    <Page
      titulo="Calibragem"
      subtitulo="Defesas geradas das evidências, com cada afirmação ancorada em ref_code"
      acoes={
        <>
          <Button label={modoMesa ? 'Sair do modo mesa' : 'Modo mesa'}
                  variant={modoMesa ? 'primary' : 'secondary'}
                  onClick={() => setModoMesa(!modoMesa)} />
          <Button icon={<Download size={14} />} label="Exportar dossiê" variant="ghost" />
        </>
      }
      largura={1240}
    >
      <SeletorCiclo ciclos={ciclos} ciclo={ciclo} trocar={trocar}
                    contagem={(x) => `${AVD.filter((a) => a.ciclo === x.id).length} avaliações`} />

      <HStack gap={2} wrap="wrap">
        <Metrica valor={DEFESAS.length} rotulo="Defesas prontas" cor="green" />
        <Metrica valor={semDefesa} rotulo="Sem defesa gerada"
                 nota="não vá para a mesa assim" cor="red" />
        <Metrica valor={altos.length} rotulo="Risco alto na mesa" cor="red" />
        <Metrica valor={DEFESAS.reduce((s, d) => s + d.evidencias.length, 0)}
                 rotulo="Evidências citadas" />
      </HStack>

      {semDefesa > 0 && (
        <Banner
          status="warning"
          title={`${semDefesa} avaliados ainda sem defesa gerada`}
          description="A defesa só é gerável para quem tem evidência acumulada. Quem está sem é quem você não vai conseguir sustentar."
        />
      )}

      {modoMesa ? (
        <VStack gap={2}>
          {DEFESAS.map((d) => <CardMesa key={d.slug} d={d} />)}
        </VStack>
      ) : (
        <Card padding={0}>
          <ListaDetalhe
            itens={linhas}
            larguraPainel={460}
            detalhe={(l) => {
              const d = l.d;
              const a = AVD.find((x) => x.slug === d.slug)!;
              const mc = media(a.comportamento);
              const md = media(a.desempenho);
              return (
                <Detalhe
                  titulo={porSlug(d.slug).nome}
                  marcadores={
                    <>
                      <Token size="sm" color="blue" label={a.quadrante} />
                      <Token size="sm" color="gray"
                             label={`C ${mc.toFixed(2)} ${faixa(mc)}`} />
                      <Token size="sm" color="gray"
                             label={`D ${md.toFixed(2)} ${faixa(md)}`} />
                    </>
                  }
                >
                  <VStack gap={2}>
                    <Bloco rotulo="Tese">
                      <Text type="body">{d.tese}</Text>
                    </Bloco>

                    <Bloco rotulo="Evidências (defesa)">
                      <VStack gap={1}>
                        {d.evidencias.map((e) => (
                          <VStack key={e.ref} gap={0.5}>
                            <Text type="supporting">{e.texto}</Text>
                            <Ev refs={[e.ref]} />
                          </VStack>
                        ))}
                      </VStack>
                    </Bloco>

                    <Bloco rotulo="Trajetória 2026">
                      <HStack gap={0.5} wrap="wrap">
                        {porSlug(d.slug).trajetoria.map((t, i) => (
                          <Token key={i} size="sm"
                                 color={t === 'E' ? 'green' : t === 'S' ? 'blue' : 'gray'}
                                 label={t === 'af' ? 'afast.' : t} />
                        ))}
                      </HStack>
                      <Text type="supporting">
                        A série completa, nunca selecionada — seleção é o que a mesa fareja.
                      </Text>
                    </Bloco>

                    <Divider />
                    <Banner
                      status="info"
                      title="Por que não maior"
                      description={d.porQueNaoMaior}
                    />

                    <Bloco rotulo="Risco previsto na mesa">
                      <HStack gap={1} wrap="wrap" vAlign="center">
                        <Token size="sm" color={COR_RISCO[d.nivelRisco]}
                               label={`risco ${d.nivelRisco}`} />
                      </HStack>
                      <Text type="supporting">{d.risco}</Text>
                    </Bloco>

                    <Divider />
                    <HStack gap={1} wrap="wrap">
                      <Button icon={<ShieldCheck size={14} />} size="sm" variant="primary" label="Marcar como verificada" />
                      {!bloqueado && <Button icon={<RefreshCw size={14} />} size="sm" variant="ghost" label="Regerar" />}
                    </HStack>
                  </VStack>
                </Detalhe>
              );
            }}
          />
        </Card>
      )}

      {!modoMesa && (
        <Card padding={3}>
          <VStack gap={2}>
            <Text type="label">Depois da mesa</Text>
            <Text type="supporting">
              Registrar o que foi efetivamente questionado, comparado ao que a defesa previu, é o
              único mecanismo que calibra a sua régua ao longo dos anos. Hoje esse aprendizado
              evapora no dia seguinte.
            </Text>
            <List density="compact" hasDividers>
              {DEFESAS.map((d) => (
                <ListItem
                  key={d.slug}
                  label={porSlug(d.slug).nome}
                  startContent={<StatusDot variant="neutral" label="Aguardando mesa" />}
                  endContent={<Button icon={<PenLine size={14} />} size="sm" variant="ghost" label="Registrar desfecho" />}
                  description={<Text type="supporting">Previsto: {d.risco}</Text>}
                />
              ))}
            </List>
          </VStack>
        </Card>
      )}
    </Page>
  );
}

/** Card de mesa: um por pessoa, navegável, para quando perguntam fora do roteiro. */
function CardMesa({ d }: { d: Defesa }) {
  const a = AVD.find((x) => x.slug === d.slug)!;
  const p = porSlug(d.slug);
  return (
    <Card padding={3}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Text type="large" weight="bold">{p.nome}</Text>
          <Token size="sm" color="blue" label={a.quadrante} />
          <Token size="sm" color={COR_RISCO[d.nivelRisco]} label={`risco ${d.nivelRisco}`} />
        </HStack>
        <Text type="body">{d.tese}</Text>
        <HStack gap={0.5} wrap="wrap">
          {p.trajetoria.map((t, i) => (
            <Token key={i} size="sm" color={t === 'E' ? 'green' : t === 'S' ? 'blue' : 'gray'}
                   label={t === 'af' ? 'afast.' : t} />
          ))}
        </HStack>
        <Divider />
        <Text type="label">Por que não maior</Text>
        <Text type="body">{d.porQueNaoMaior}</Text>
      </VStack>
    </Card>
  );
}
