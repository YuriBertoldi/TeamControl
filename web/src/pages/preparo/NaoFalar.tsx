/**
 * "O que não falar" — a trava de conversa.
 *
 * Fica na aba Pauta e não no material de apoio de propósito: é informação que
 * você precisa na hora da conversa, não depois. Traduz a regra de privacidade
 * mais importante da skill em superfície de produto.
 */

import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Banner } from '@astryxdesign/core/Banner';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { List, ListItem } from '@astryxdesign/core/List';
import { Collapsible } from '@astryxdesign/core/Collapsible';

import { Conf } from '../../app/ui';
import { NAO_FALAR } from '../../data/mock';


export function NaoFalar({ SLUG }: { SLUG: string }) {
  const nf = NAO_FALAR[SLUG];
  if (!nf) return null;
  return (
    <Card padding={4}>
      <Collapsible defaultIsOpen={false} trigger={<Heading level={3}>O que não falar</Heading>}>
        <VStack gap={2} paddingBlockStart={2}>
          <Banner status="error" title="Restrição do ciclo vigente" description={nf.cicloVigente} />
          <List density="compact" hasDividers>
            {nf.itens.map((i) => (
              <ListItem
                key={i.texto}
                label={i.texto}
                startContent={<StatusDot variant="error" label="Não falar" />}
                description={
                  <HStack gap={1} wrap="wrap" vAlign="center">
                    <Conf nivel={i.conf} />
                    <Text type="supporting">{i.motivo}</Text>
                  </HStack>
                }
              />
            ))}
          </List>
        </VStack>
      </Collapsible>
    </Card>
  );
}
