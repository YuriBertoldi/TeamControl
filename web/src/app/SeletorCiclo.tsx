/**
 * Seletor de ciclo — o cabeçalho comum do módulo Ciclo.
 *
 * Todas as telas do módulo (AVD, Calibragem, Radar, Relatórios) olham o MESMO
 * ciclo, e esta é a única superfície que o troca. Antes cada tela assumia o
 * vigente por conta própria, o que produzia o erro mais caro possível: abrir a
 * calibragem de um ciclo achando que era de outro.
 *
 * Quando o ciclo está encerrado, o componente avisa em vez de deixar a tela
 * parecer editável. Histórico que aceita edição não é histórico.
 */

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { Selector } from '@astryxdesign/core/Selector';
import { Banner } from '@astryxdesign/core/Banner';

import { dataBR } from '../data/mock';
import {
  carregarCiclos, cicloSelecionado, selecionarCiclo, somenteLeitura,
  STATUS_CICLO, type Ciclo,
} from '../data/ciclos';

/**
 * Hook do módulo Ciclo: devolve o ciclo em foco e um gatilho de troca.
 *
 * A leitura é do localStorage, então uma tela que monte depois de outra já
 * nasce com o mesmo ciclo — sem precisar de contexto nem de prop drilling
 * entre rotas carregadas com `lazy`.
 */
export function useCiclo() {
  const ciclos = carregarCiclos();
  const [id, setId] = useState(() => cicloSelecionado(ciclos).id);
  const ciclo = ciclos.find((c) => c.id === id) ?? ciclos[0];

  const trocar = (novo: string) => {
    selecionarCiclo(novo);
    setId(novo);
  };

  return { ciclos, ciclo, trocar, bloqueado: somenteLeitura(ciclo) };
}

export function SeletorCiclo({ ciclos, ciclo, trocar, contagem }: {
  ciclos: Ciclo[];
  ciclo: Ciclo;
  trocar: (id: string) => void;
  /** Quantos itens cada ciclo tem na tela atual — avaliações, defesas, etc. */
  contagem?: (c: Ciclo) => string;
}) {
  const st = STATUS_CICLO.find((s) => s.valor === ciclo.status)!;

  return (
    <VStack gap={1}>
      <HStack gap={2} vAlign="end" wrap="wrap">
        <Selector
          label="Ciclo"
          value={ciclo.id}
          onChange={(v) => v && trocar(v)}
          options={ciclos.map((c) => ({
            value: c.id,
            label: c.nome,
            description: `${STATUS_CICLO.find((s) => s.valor === c.status)!.rotulo}${
              contagem ? ` · ${contagem(c)}` : ''}`,
          }))}
        />
        <Token size="sm" color={st.cor} label={st.rotulo} />
        <Text type="supporting">
          {dataBR(ciclo.inicio)} a {dataBR(ciclo.fim)} · corte {dataBR(ciclo.dataCorte)}
        </Text>
      </HStack>

      {somenteLeitura(ciclo) && (
        <Banner
          status="info"
          title={`Ciclo encerrado${ciclo.encerradoEm ? ` em ${dataBR(ciclo.encerradoEm)}` : ''} — somente histórico`}
          description="As notas, justificativas e defesas continuam aqui exatamente como ficaram, e é isso que sustenta a comparação com os ciclos seguintes. Para voltar a editar, reabra em Ciclos de AVD."
        />
      )}

      {ciclo.status === 'calibragem' && (
        <Banner
          status="warning"
          title="Calibragem em andamento — restrição de conversa vigente"
          description="Enquanto este ciclo estiver em calibragem, nenhuma 1:1 pode citar mérito, promoção, aumento ou próximo nível."
        />
      )}
    </VStack>
  );
}
