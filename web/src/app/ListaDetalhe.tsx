/**
 * Padrão lista + detalhe.
 *
 * Decisão de densidade: a LINHA carrega só o que se lê de relance — um ponto de
 * status, o título, no máximo dois marcadores e um número. Toda a prosa (razão,
 * evidência, ação, histórico) vive no painel de detalhe, à direita.
 *
 * O motivo é o que a lista precisa responder: "o que está fora do lugar?".
 * Essa pergunta se responde escaneando. "Por quê?" é outra pergunta, e só vale
 * a pena pagar por ela no item que você escolheu olhar.
 */

import { useState, type ReactNode } from 'react';
import { Layout } from '@astryxdesign/core/Layout';
import { LayoutContent } from '@astryxdesign/core/Layout';
import { LayoutPanel } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Token } from '@astryxdesign/core/Token';
import { Card } from '@astryxdesign/core/Card';

export type DotVariant = 'success' | 'warning' | 'error' | 'accent' | 'neutral';
export type TokenCor =
  | 'default' | 'red' | 'orange' | 'yellow' | 'green' | 'teal'
  | 'cyan' | 'blue' | 'purple' | 'pink' | 'gray';

/** O que a LINHA mostra. Propositalmente pobre. */
export interface LinhaEnxuta {
  id: string | number;
  titulo: string;
  dot: DotVariant;
  dotLabel: string;
  /** No máximo dois — a regra é da lista, não do chamador. */
  marcadores?: { texto: string; cor?: TokenCor }[];
  /** Um número ou prazo curto, alinhado à direita. */
  valor?: string;
}

export function ListaDetalhe<T extends LinhaEnxuta>({
  itens, detalhe, vazio = 'Nada aqui com esses filtros.', larguraPainel = 400,
}: {
  itens: T[];
  detalhe: (item: T) => ReactNode;
  vazio?: string;
  larguraPainel?: number;
}) {
  const [selecionado, setSelecionado] = useState<string | number | null>(
    itens.length ? itens[0].id : null);

  const atual = itens.find((i) => i.id === selecionado) ?? itens[0] ?? null;

  if (itens.length === 0) {
    return <Card padding={4}><Text type="supporting">{vazio}</Text></Card>;
  }

  return (
    <Layout
      height="auto"
      content={
        <LayoutContent>
          <List density="compact" hasDividers>
            {itens.map((i) => (
              <ListItem
                key={i.id}
                label={i.titulo}
                isSelected={atual?.id === i.id}
                onClick={() => setSelecionado(i.id)}
                startContent={<StatusDot variant={i.dot} label={i.dotLabel} />}
                endContent={i.valor
                  ? <Text type="supporting" hasTabularNumbers>{i.valor}</Text>
                  : undefined}
                description={i.marcadores?.length ? (
                  <HStack gap={0.5} wrap="wrap" vAlign="center">
                    {i.marcadores.slice(0, 2).map((m) => (
                      <Token key={m.texto} size="sm" color={m.cor ?? 'gray'} label={m.texto} />
                    ))}
                  </HStack>
                ) : undefined}
              />
            ))}
          </List>
        </LayoutContent>
      }
      end={
        <LayoutPanel width={larguraPainel} hasDivider padding={3} label="Detalhe do item">
          {atual ? detalhe(atual) : <Text type="supporting">Selecione um item.</Text>}
        </LayoutPanel>
      }
    />
  );
}

/** Cabeçalho padrão do painel de detalhe. */
export function Detalhe({ titulo, marcadores, children }: {
  titulo: string;
  marcadores?: ReactNode;
  children: ReactNode;
}) {
  return (
    <VStack gap={2}>
      <Heading level={3}>{titulo}</Heading>
      {marcadores && <HStack gap={1} wrap="wrap" vAlign="center">{marcadores}</HStack>}
      {children}
    </VStack>
  );
}

/** Bloco rotulado dentro do detalhe — o lugar da prosa. */
export function Bloco({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <VStack gap={0.5}>
      <Text type="label">{rotulo}</Text>
      {typeof children === 'string' ? <Text type="supporting">{children}</Text> : children}
    </VStack>
  );
}
