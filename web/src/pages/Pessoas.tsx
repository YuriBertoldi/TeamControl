/** Pessoas — lista filtrável dos dois squads, com o perfil no detalhe. */

import { useMemo, useState } from 'react';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Divider } from '@astryxdesign/core/Divider';
import { Banner } from '@astryxdesign/core/Banner';
import { FilterX, MessagesSquare, Sparkles, UserSearch } from 'lucide-react';

import { Page, Filtros } from '../app/ui';
import { ListaDetalhe, Detalhe, Bloco, type LinhaEnxuta } from '../app/ListaDetalhe';
import { PESSOAS, souMeus, timeDe, DNA, HOJE, diasEntre, dataBR, type Pessoa } from '../data/mock';
import { carregarTribos } from '../data/cadastro';
import { useNavegacao } from '../app/navegacao';
import { carregarConfig } from '../config';

const QUADRANTES = ['Estrela', 'Forte Desempenho', 'Forte Comportamento', 'Mantenedor'];

interface Linha extends LinhaEnxuta { p: Pessoa }

export default function Pessoas() {
  const { abrirPessoa } = useNavegacao();
  const cfg = carregarConfig();
  const limite = cfg.cadenciaDias + cfg.folgaCadenciaDias;

  const [busca, setBusca] = useState('');
  const [time, setTime] = useState('');
  const [quadrante, setQuadrante] = useState('');
  const [situacao, setSituacao] = useState('');

  const linhas: Linha[] = useMemo(() => PESSOAS
    .filter((p) => {
      if (busca && !p.nome.toLowerCase().includes(busca.toLowerCase())) return false;
      if (time && p.time !== time) return false;
      if (quadrante && p.quadrante !== quadrante) return false;
      if (situacao === 'elegivel' && !p.elegivel) return false;
      if (situacao === 'fora' && p.elegivel) return false;
      if (situacao === 'atrasado' && diasEntre(p.ultima1a1, HOJE) <= limite) return false;
      if (situacao === 'tl' && !p.techLead) return false;
      return true;
    })
    .map((p) => {
      const dias = diasEntre(p.ultima1a1, HOJE);
      const atrasado = p.status === 'ativo' && dias > limite;
      return {
        id: p.slug,
        titulo: p.nome,
        dot: p.status === 'desligado' ? 'neutral' : atrasado ? 'error' : 'success',
        dotLabel: p.status === 'desligado' ? 'Desligado' : atrasado ? '1:1 atrasada' : 'Em dia',
        marcadores: [
          p.quadrante
            ? { texto: p.quadrante, cor: 'blue' as const }
            : { texto: 'fora do ciclo', cor: 'red' as const },
          ...(p.techLead ? [{ texto: 'Tech Lead', cor: 'purple' as const }] : []),
        ],
        valor: `${dias}d`,
        p,
      };
    }), [busca, time, quadrante, situacao, limite]);

  const limpar = () => { setBusca(''); setTime(''); setQuadrante(''); setSituacao(''); };
  const temFiltro = !!(busca || time || quadrante || situacao);

  return (
    <Page
      titulo="Pessoas"
      /* Contado, não digitado: número fixo no subtítulo envelhece no primeiro
         cadastro novo — já envelheceu uma vez, dizia 16 em 2 squads. */
      subtitulo={`${souMeus().length} liderados em ${cfg.squads.length} squads · ${
        souMeus().filter((p) => p.elegivel).length} elegíveis ao ciclo AVD-2026 · alerta de cadência em ${limite} dias`}
      largura={1240}
    >
      <Filtros resultado={`${linhas.length} de ${PESSOAS.length}`}>
        <TextInput label="Buscar por nome" size="sm" placeholder="nome do liderado"
                   value={busca} onChange={setBusca} />
        <Selector label="Tribo" size="sm" variant="ghost" placeholder="Todas as tribos"
                  value={time} onChange={(v) => setTime(v ?? '')} hasClear
                  options={carregarTribos().map((t) => ({
                    value: t.id, label: t.nome, description: `produto ${t.produto}`,
                  }))} />
        <Selector label="Quadrante 9-box" size="sm" variant="ghost" placeholder="Todos os quadrantes"
                  value={quadrante} onChange={(v) => setQuadrante(v ?? '')} hasClear
                  options={QUADRANTES.map((q) => ({ value: q, label: q }))} />
        <Selector label="Situação" size="sm" variant="ghost" placeholder="Qualquer situação"
                  value={situacao} onChange={(v) => setSituacao(v ?? '')} hasClear
                  options={[
                    { value: 'elegivel', label: 'Elegível à AVD' },
                    { value: 'fora', label: 'Fora do ciclo' },
                    { value: 'atrasado', label: `1:1 atrasada (>${limite} dias)` },
                    { value: 'tl', label: 'Tech Lead' },
                  ]} />
        {temFiltro && <Button icon={<FilterX size={14} />} size="sm" variant="ghost" label="Limpar filtros" onClick={limpar} />}
      </Filtros>

      <Card padding={0}>
        <ListaDetalhe
          itens={linhas}
          vazio="Nenhuma pessoa com esses filtros."
          larguraPainel={420}
          detalhe={(l) => {
            const p = l.p;
            const dias = diasEntre(p.ultima1a1, HOJE);
            const dna = DNA[p.slug];
            return (
              <Detalhe
                titulo={p.nome}
                marcadores={
                  <>
                    <Token size="sm" color="gray" label={p.cargo} />
                    {p.techLead && <Token size="sm" color="purple" label="Tech Lead" />}
                    {p.quadrante && <Token size="sm" color="blue" label={p.quadrante} />}
                  </>
                }
              >
                <VStack gap={2}>
                  {!p.elegivel && (
                    <Banner status="warning" title="Fora do ciclo AVD-2026"
                            description={p.motivoInelegivel} />
                  )}

                  <Bloco rotulo="Squad">{timeDe(p.time).nome}</Bloco>
                  <Bloco rotulo="Admissão">
                    {`${dataBR(p.admissao)} · ${Math.floor(
                      diasEntre(p.admissao, HOJE) / 365)} anos de casa`}
                  </Bloco>
                  <Bloco rotulo="Última 1:1">
                    {`${dataBR(p.ultima1a1)} · há ${dias} dias${dias > limite ? ' — fora da cadência' : ''}`}
                  </Bloco>

                  <Bloco rotulo="Trajetória 2026">
                    <HStack gap={0.5} wrap="wrap">
                      {p.trajetoria.map((t, i) => (
                        <Token key={i} size="sm"
                               color={t === 'E' ? 'green' : t === 'S' ? 'blue' : 'gray'}
                               label={t === 'af' ? 'afast.' : t === 'E' ? 'Excep.' : 'Satisf.'} />
                      ))}
                    </HStack>
                  </Bloco>

                  {dna && (
                    <>
                      <Divider />
                      <Bloco rotulo="Como dar feedback">
                        {`${dna.prefFeedback} · reconhecimento ${dna.prefReconhecimento}`}
                      </Bloco>
                      <Bloco rotulo="Âncora de carreira">
                        {`${dna.ancoraPrimaria} · rejeita ${dna.ancoraRejeitada}`}
                      </Bloco>
                      <Bloco rotulo="Aspiração declarada">
                        <Text type="body">“{dna.aspiracao}”</Text>
                      </Bloco>
                    </>
                  )}

                  <Divider />
                  <HStack gap={1} wrap="wrap">
                    <Button icon={<UserSearch size={14} />} size="sm" variant="primary"
                            label="Abrir perfil completo" onClick={() => abrirPessoa(p.slug)} />
                    <Button icon={<MessagesSquare size={14} />} size="sm" variant="ghost" label="Preparar 1:1" />
                    <Button icon={<Sparkles size={14} />} size="sm" variant="ghost" label="Gerar resumo" />
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
