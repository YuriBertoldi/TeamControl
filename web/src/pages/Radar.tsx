/**
 * Radar de alertas — lista enxuta à esquerda, razão e ação no detalhe.
 *
 * Regra de higiene: alerta sem ação possível não existe. Se não dá para
 * escrever a ação sugerida, a regra não entra no sistema.
 */

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { Divider } from '@astryxdesign/core/Divider';
import { Card } from '@astryxdesign/core/Card';
import { Clock, MessagesSquare } from 'lucide-react';

import { Page, Filtros, Conf, Metrica } from '../app/ui';
import { useCiclo, SeletorCiclo } from '../app/SeletorCiclo';
import { ListaDetalhe, Detalhe, Bloco, type LinhaEnxuta } from '../app/ListaDetalhe';
import { ALERTAS, SEV_COR, SEV_DOT, SEV_ROTULO, type Severidade, type Alerta } from '../data/mockOps';

const FAMILIAS = ['Ritual', 'Compromisso', 'Desenvolvimento', 'Ciclo', 'Risco de time', 'Pessoa'];

interface LinhaAlerta extends LinhaEnxuta { alerta: Alerta }

export default function Radar() {
  // O radar muda de significado por ciclo: 'driver sem evidência' só é alerta
  // enquanto o ciclo está aberto.
  const { ciclos, ciclo, trocar } = useCiclo();
  const [severidade, setSeveridade] = useState('');
  const [familia, setFamilia] = useState('');
  const [resolvidos, setResolvidos] = useState<Set<number>>(new Set());

  const ativos = ALERTAS.filter((a) => !resolvidos.has(a.id));
  const conta = (s: Severidade) => ativos.filter((a) => a.severidade === s).length;

  const linhas: LinhaAlerta[] = useMemo(() => ativos
    .filter((a) => (!severidade || a.severidade === severidade)
                && (!familia || a.familia === familia))
    .map((a) => ({
      id: a.id,
      titulo: a.titulo,
      dot: SEV_DOT[a.severidade],
      dotLabel: SEV_ROTULO[a.severidade],
      // Dois marcadores no máximo: severidade e quem. O resto vai ao detalhe.
      marcadores: [
        { texto: SEV_ROTULO[a.severidade], cor: SEV_COR[a.severidade] },
        ...(a.pessoa ? [{ texto: a.pessoa.split(' ')[0], cor: 'blue' as const }] : []),
      ],
      valor: a.dias ? `${a.dias}d` : undefined,
      alerta: a,
    })), [ativos, severidade, familia]);

  return (
    <Page
      titulo="Radar de alertas"
      subtitulo={`${ativos.length} ativos · cada um com uma ação concreta`}
      largura={1240}
    >
      <SeletorCiclo ciclos={ciclos} ciclo={ciclo} trocar={trocar} />

      <HStack gap={2} wrap="wrap">
        <Metrica valor={conta('critica')} rotulo="Críticos" cor="red" />
        <Metrica valor={conta('alta')} rotulo="Altos" cor="orange" />
        <Metrica valor={conta('media')} rotulo="Médios" />
        <Metrica valor={resolvidos.size} rotulo="Resolvidos na sessão" cor="green" />
      </HStack>

      <Filtros resultado={`${linhas.length} de ${ativos.length}`}>
        <Selector label="Severidade" size="sm" variant="ghost" placeholder="Todas as severidades"
                  value={severidade} onChange={(v) => setSeveridade(v ?? '')} hasClear
                  options={(['critica', 'alta', 'media'] as Severidade[])
                    .map((s) => ({ value: s, label: `${SEV_ROTULO[s]} (${conta(s)})` }))} />
        <Selector label="Família" size="sm" variant="ghost" placeholder="Todas as famílias"
                  value={familia} onChange={(v) => setFamilia(v ?? '')} hasClear
                  options={FAMILIAS.map((f) => ({
                    value: f, label: `${f} (${ativos.filter((a) => a.familia === f).length})`,
                  }))} />
        {(severidade || familia) && (
          <Button size="sm" variant="ghost" label="Limpar filtros"
                  onClick={() => { setSeveridade(''); setFamilia(''); }} />
        )}
      </Filtros>

      <Card padding={0}>
        <ListaDetalhe
          itens={linhas}
          vazio="Nenhum alerta com esses filtros. Se resolveu tudo, o radar fica vazio de propósito."
          detalhe={(l) => {
            const a = l.alerta;
            return (
              <Detalhe
                titulo={a.titulo}
                marcadores={
                  <>
                    <Token size="sm" color={SEV_COR[a.severidade]} label={SEV_ROTULO[a.severidade]} />
                    <Token size="sm" color="gray" label={a.familia} />
                    {a.pessoa && <Token size="sm" color="blue" label={a.pessoa} />}
                    <Conf nivel={a.conf} />
                  </>
                }
              >
                <VStack gap={2}>
                  <Bloco rotulo="O que está acontecendo">{a.detalhe}</Bloco>
                  <Divider />
                  <Bloco rotulo="Ação sugerida">
                    <Text type="body" weight="medium">{a.acao}</Text>
                  </Bloco>
                  <Bloco rotulo="Regra que disparou">
                    <Text type="code">{a.regra}</Text>
                  </Bloco>
                  <Divider />
                  <HStack gap={1} wrap="wrap">
                    <Button size="sm" variant="primary" label="Resolver"
                            onClick={() => setResolvidos(new Set(resolvidos).add(a.id))} />
                    <Button icon={<Clock size={14} />} size="sm" variant="ghost" label="Adiar 7 dias" />
                    <Button icon={<MessagesSquare size={14} />} size="sm" variant="ghost" label="Levar para a 1:1" />
                  </HStack>
                </VStack>
              </Detalhe>
            );
          }}
        />
      </Card>
    </Page>
  );
}
