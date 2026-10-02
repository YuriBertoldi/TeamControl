/**
 * Detalhe de um assunto da pauta.
 *
 * A LINHA mostra prioridade, título e minutos. Aqui fica o resto: a razão com
 * as evidências, a pergunta de abertura, a justificativa da formulação e o
 * descarte com motivo — que é o que alimenta o aprendizado do motor.
 */

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { Button } from '@astryxdesign/core/Button';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';

import { Detalhe, Bloco } from '../../app/ListaDetalhe';
import { Conf, Ev } from '../../app/ui';
import type { Assunto } from '../../data/mock';
import {
  ORIGEM_ROTULO, PRIORIDADE_COR, ROTULO_CURTO, MOTIVOS_DESCARTE,
} from './constantes';

export function AssuntoDetalhe({ a, injetado, onDescartar }: {
  a: Assunto;
  injetado: boolean;
  onDescartar: (id: string, motivo: string) => void;
}) {
  return (
    <Detalhe
      titulo={a.titulo}
      marcadores={
        <>
          <Token size="sm" color={PRIORIDADE_COR[a.prioridade]} label={ROTULO_CURTO[a.prioridade]} />
          <Token size="sm" color="gray" label={`${a.minutos} min`} />
          <Token size="sm" color="cyan" label={ORIGEM_ROTULO[a.origem] ?? a.origem} />
          {a.conf && <Conf nivel={a.conf} />}
          {injetado && <Token size="sm" color="green" label="garantido pela trava" />}
          {a.herdado && <Token size="sm" color="orange" label="herdado" />}
        </>
      }
    >
      <VStack gap={2}>
        <Bloco rotulo="Por que agora">
          <VStack gap={1}>
            <Text type="supporting">{a.porQueAgora}</Text>
            <Ev refs={a.refs} />
          </VStack>
        </Bloco>

        {/* A pergunta é o que você lê em voz alta — o elemento com mais peso. */}
        <Bloco rotulo="Pergunta de abertura">
          <Text type="body" weight="medium">{a.pergunta}</Text>
        </Bloco>

        {a.avisoConf && (
          <Banner status="warning" title="Cuidado com a fonte" description={a.avisoConf} />
        )}

        <Bloco rotulo="Por que formulada assim">{a.porQueAssim}</Bloco>

        {a.toca.length > 0 && (
          <Bloco rotulo="O que este assunto toca">
            <HStack gap={0.5} wrap="wrap">
              {a.toca.map((t) => <Token key={t} size="sm" label={t} />)}
            </HStack>
          </Bloco>
        )}

        <Divider />
        <Bloco rotulo="Descartar — o motivo é o que ensina o motor">
          <HStack gap={1} wrap="wrap">
            {MOTIVOS_DESCARTE.map((m) => (
              <Button key={m} size="sm" variant="ghost" label={m}
                      onClick={() => onDescartar(a.id, m)} />
            ))}
          </HStack>
        </Bloco>
      </VStack>
    </Detalhe>
  );
}
