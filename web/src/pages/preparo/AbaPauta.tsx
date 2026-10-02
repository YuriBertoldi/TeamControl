/**
 * Aba Pauta — o motor de pauta renderizado.
 *
 * Prioridade estrita: item ALTA nunca é deslocado pela trava de equilíbrio.
 * A trava reserva espaço para desenvolvimento e escuta antes de preencher com
 * MÉDIA/BAIXA; se não couber, avisa e sugere aumentar a duração em vez de
 * cortar um item crítico.
 */

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';

import { ListaDetalhe } from '../../app/ListaDetalhe';
import { montarPauta, type Assunto } from '../../data/mock';
import { AssuntoDetalhe } from './AssuntoDetalhe';
import { NaoFalar } from './NaoFalar';
import { DOT_PRIORIDADE, PRIORIDADE_COR, ROTULO_CURTO, ROTULO_PRIORIDADE } from './constantes';

const DURACOES = [30, 45, 60];

export function AbaPauta({ SLUG, duracao, setDuracao, descartados, onDescartar }: {
  SLUG: string;
  duracao: number;
  setDuracao: (n: number) => void;
  descartados: Set<string>;
  onDescartar: (id: string, motivo: string) => void;
}) {
  const r = montarPauta(SLUG, duracao, descartados);

  return (
    <VStack gap={3}>
      <Card padding={3}>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Heading level={2}>Pauta sugerida</Heading>
            <Text type="supporting">gerada do histórico · {r.dentro.length} assuntos</Text>
          </HStack>

          <HStack gap={2} vAlign="center" wrap="wrap">
            <Text type="label">Duração</Text>
            <SegmentedControl
              size="sm"
              label="Duração da conversa"
              value={String(duracao)}
              onChange={(v) => setDuracao(Number(v))}
            >
              {DURACOES.map((d) => (
                <SegmentedControlItem key={d} value={String(d)} label={`${d} min`} />
              ))}
            </SegmentedControl>
            <Text type="supporting">
              {r.usado} de {r.orcamento} min alocados · {r.fora.length} fora
            </Text>
          </HStack>

          <AvisoEquilibrio r={r} setDuracao={setDuracao} />

          <ListaDetalhe
            larguraPainel={420}
            itens={r.dentro.map((a) => ({
              id: a.id,
              titulo: a.titulo,
              dot: DOT_PRIORIDADE[a.prioridade],
              dotLabel: ROTULO_PRIORIDADE[a.prioridade],
              marcadores: [
                { texto: ROTULO_CURTO[a.prioridade], cor: PRIORIDADE_COR[a.prioridade] },
                ...(r.injetados.includes(a.id)
                  ? [{ texto: 'garantido', cor: 'green' as const }] : []),
              ],
              valor: `${a.minutos} min`,
              a,
            }))}
            detalhe={(l) => (
              <AssuntoDetalhe a={l.a} injetado={r.injetados.includes(l.a.id)}
                              onDescartar={onDescartar} />
            )}
          />

          {r.fora.length > 0 && <ForaDoOrcamento fora={r.fora} orcamento={r.orcamento} />}
        </VStack>
      </Card>

      <NaoFalar SLUG={SLUG} />
    </VStack>
  );
}

/** A trava comunica os dois casos: o que garantiu e o que não coube. */
function AvisoEquilibrio({ r, setDuracao }: {
  r: ReturnType<typeof montarPauta>;
  setDuracao: (n: number) => void;
}) {
  if (r.faltouDev || r.faltouEscuta) {
    const faltou = [
      r.faltouDev && 'o item de desenvolvimento',
      r.faltouEscuta && 'a escuta aberta',
    ].filter(Boolean).join(' nem ');

    return (
      <Banner
        status="warning"
        title="Pauta 100% cobrança"
        description={`Não coube ${faltou}. Nenhum item de prioridade alta foi cortado — precisaria de ${r.minimoSugerido} min.`}
        endContent={<Button size="sm" label="Usar 60 min" onClick={() => setDuracao(60)} />}
      />
    );
  }

  if (r.injetados.length > 0) {
    return (
      <Banner
        status="info"
        title="Trava de equilíbrio aplicada"
        description={`Espaço reservado para ${r.injetados.length} itens de desenvolvimento e escuta.`}
      />
    );
  }

  return null;
}

function ForaDoOrcamento({ fora, orcamento }: { fora: Assunto[]; orcamento: number }) {
  return (
    <>
      <Divider />
      <VStack gap={1}>
        <Text type="label">
          Ficou de fora do orçamento de {orcamento} min — carrega para a próxima
        </Text>
        {fora.map((a) => (
          <Text key={a.id} type="supporting">
            {a.titulo} ({a.minutos} min · {a.categoria})
          </Text>
        ))}
      </VStack>
    </>
  );
}
