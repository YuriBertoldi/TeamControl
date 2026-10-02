/**
 * Painel — a visão de times primeiro, a gestão logo abaixo.
 *
 * A ordem não é estética. O recorte organizacional (quem é quem, em que
 * cadeira, em que squad) é o que dá contexto para tudo o que vem depois: um
 * alerta de 1:1 atrasada significa coisas diferentes para um Tech Lead e para
 * alguém com 60 dias de casa.
 *
 * Regra de cor do sistema inteiro, herdada da referência: **a família do cargo
 * define o tom, o nível define a intensidade.** A legenda no topo é também o
 * filtro — clicar num nível esconde aquelas pessoas em todos os blocos.
 */

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { List, ListItem } from '@astryxdesign/core/List';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Sparkles, FilterX, FolderInput } from 'lucide-react';

import { Page, Stats, corDaCadeira, rotuloCargo } from '../app/ui';
import { LegendaFamilias, ChipsTribo, TreemapTribos, BlocoTribo, visivel } from '../app/times';
import type { RotaId } from '../app/Shell';
import { PESSOAS, COMPROMISSOS, HOJE, diasEntre, nivelDe, ehNovo } from '../data/mock';
import { carregarTribos } from '../data/cadastro';
import { useNavegacao } from '../app/navegacao';
import { carregarConfig } from '../config';
import { ACERVO, ALERTAS, alertasDe1a1, ARQUIVOS, TEMAS_ESTRATEGICOS, SEV_COR, SEV_DOT, SEV_ROTULO } from '../data/mockOps';

export default function Painel({ ir }: { ir: (r: RotaId) => void }) {
  const { abrirPessoa } = useNavegacao();

  /** Filtros da legenda e das tribos. Valem para todos os blocos abaixo. */
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [tribo, setTribo] = useState('');

  const alternar = (chave: string) => {
    const nova = new Set(ocultos);
    if (nova.has(chave)) nova.delete(chave); else nova.add(chave);
    setOcultos(nova);
  };

  const cfg = carregarConfig();
  const tribos = carregarTribos();
  const limite = cfg.cadenciaDias + cfg.folgaCadenciaDias;

  const ativos = PESSOAS.filter((p) => p.status === 'ativo' || p.status === 'afastado');
  const filtrados = ativos.filter(
    (p) => visivel(p, ocultos) && (!tribo || p.time === tribo));

  const vencidos = COMPROMISSOS.filter(
    (c) => c.status !== 'concluido' && c.prazoDate && diasEntre(c.prazoDate, HOJE) > 0);
  const meusVencidos = vencidos.filter((c) => c.responsavel === 'coordenador');
  const naFila = ARQUIVOS.filter((a) => a.status !== 'processado' && a.status !== 'ignorado');
  const criticos = ALERTAS.filter((a) => a.severidade === 'critica');
  const semRegistro = ACERVO.tactiq + ACERVO.geminiNotas - ACERVO.registrosProcessados;
  const atrasados = filtrados.filter((p) => diasEntre(p.ultima1a1, HOJE) > limite);
  const alertas1a1 = alertasDe1a1(filtrados, limite, HOJE);

  const squads = cfg.squads;
  const semSquad = filtrados.filter(
    (p) => !squads.some((s) => s.membros.includes(p.slug)));
  const temFiltro = ocultos.size > 0 || !!tribo;

  return (
    <Page
      /* "Painel", não "Visão do time": já existe uma rota com esse nome, e dois
         itens de menu quase homônimos é o tipo de coisa que faz perder tempo. */
      titulo="Painel"
      subtitulo="Seus liderados, agrupados por tribo e squad. A família do cargo define o tom da cor e o nível define a intensidade."
      largura={1400}
      acoes={
        <Button icon={<Sparkles size={14} />} label="Gerar pulso do mês"
                onClick={() => ir('relatorios')} />
      }
    >
      <LegendaFamilias pessoas={ativos} ocultos={ocultos} alternar={alternar} />

      <HStack gap={2} wrap="wrap" vAlign="center" hAlign="between">
        <ChipsTribo tribos={tribos} pessoas={ativos}
                    selecionada={tribo} selecionar={setTribo} />
        {temFiltro && (
          <Button icon={<FilterX size={14} />} size="sm" variant="ghost"
                  label="Limpar filtros"
                  onClick={() => { setOcultos(new Set()); setTribo(''); }} />
        )}
      </HStack>

      <Stats itens={[
        { valor: tribos.length, rotulo: 'tribos' },
        { valor: squads.length, rotulo: 'squads' },
        { valor: filtrados.length, rotulo: 'pessoas' },
        { valor: semSquad.length, rotulo: 'sem squad',
          cor: semSquad.length ? 'orange' : undefined },
        { valor: filtrados.filter((p) => p.familia === 'Testes / QA').length, rotulo: 'QA em dev' },
        { valor: filtrados.filter((p) => ehNovo(p)).length, rotulo: 'novos' },
      ]} />

      <TreemapTribos tribos={tribos} squads={squads} pessoas={filtrados} />

      {/* Uma seção por tribo, com a barra de cadeiras e os cards de squad. */}
      {tribos.map((t) => (
        <BlocoTribo key={t.id} tribo={t} pessoas={filtrados} squads={squads}
                    aoClicar={abrirPessoa} />
      ))}

      <Divider label="O que precisa de você hoje" />

      <Banner
        status="warning"
        title={`${semRegistro} transcrições ainda não viraram registro`}
        description="As 1:1s de junho e julho nunca foram processadas. É o buraco que some na hora da AVD."
        endContent={<Button icon={<FolderInput size={14} />} size="sm"
                            label="Ver importações" onClick={() => ir('importacoes')} />}
      />

      <Stats itens={[
        { valor: vencidos.length, rotulo: 'compromissos vencidos', cor: 'red' },
        { valor: meusVencidos.length, rotulo: 'vencidos que são meus', cor: 'red' },
        { valor: naFila.length, rotulo: 'arquivos na fila' },
        { valor: criticos.length, rotulo: 'alertas críticos', cor: 'red' },
        { valor: atrasados.length, rotulo: '1:1 fora da cadência',
          cor: atrasados.length ? 'red' : undefined },
      ]} />

      {/* Quem está fora da cadência, em uma linha por pessoa. */}
      {atrasados.length > 0 && (
        <Card padding={3}>
          <VStack gap={2}>
            <Heading level={3}>Fora da cadência de {limite} dias</Heading>
            <List density="compact" hasDividers>
              {[...atrasados]
                .sort((a, b) => diasEntre(b.ultima1a1, HOJE) - diasEntre(a.ultima1a1, HOJE))
                .map((p) => (
                  <ListItem
                    key={p.slug}
                    label={p.nome}
                    startContent={<StatusDot variant="error" label="Atrasado" />}
                    onClick={() => abrirPessoa(p.slug)}
                    endContent={
                      <HStack gap={0.5} vAlign="center">
                        <Token size="sm" color={corDaCadeira(p.familia, nivelDe(p))}
                               label={rotuloCargo(p)} />
                        <Text type="supporting" hasTabularNumbers>
                          {diasEntre(p.ultima1a1, HOJE)}d
                        </Text>
                      </HStack>
                    }
                  />
                ))}
            </List>
          </VStack>
        </Card>
      )}

      <Card padding={3}>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Heading level={3}>Termômetro dos temas estratégicos</Heading>
            <Text type="supporting">
              quantas pessoas têm evidência recente em cada tema que você cobra
            </Text>
          </HStack>
          {/* Barra em vez de lista de texto: cobertura é quantidade, e
              quantidade se lê de relance. A marca em 70% é a meta. */}
          <VStack gap={2}>
            {TEMAS_ESTRATEGICOS.map((t) => {
              const pct = Math.round((t.comEvidencia / t.total) * 100);
              return (
                <HStack key={t.tema} gap={2} vAlign="center" wrap="wrap">
                  <VStack width={190}><Text type="label">{t.tema}</Text></VStack>
                  <VStack width={420}>
                    <ProgressBar
                      label={`${t.tema}: ${t.comEvidencia} de ${t.total} pessoas com evidência recente`}
                      isLabelHidden
                      value={t.comEvidencia}
                      max={t.total}
                      variant={pct < 40 ? 'error' : pct < 70 ? 'warning' : 'success'}
                      marks={[{ value: Math.round(t.total * 0.7), label: 'meta 70%' }]}
                    />
                  </VStack>
                  <Text type="supporting" hasTabularNumbers>{t.comEvidencia}/{t.total}</Text>
                </HStack>
              );
            })}
          </VStack>
        </VStack>
      </Card>

      <Card padding={3}>
        <VStack gap={2}>
          <HStack gap={2} vAlign="center" wrap="wrap">
            <Heading level={3}>Alertas críticos</Heading>
            <Button size="sm" variant="ghost" label="Ver radar completo" onClick={() => ir('radar')} />
          </HStack>
          <List density="compact" hasDividers>
            {[...alertas1a1.filter((a) => a.severidade === 'critica'), ...criticos].map((a) => (
              <ListItem
                key={a.id}
                label={a.titulo}
                startContent={<StatusDot variant={SEV_DOT[a.severidade]} label={SEV_ROTULO[a.severidade]} />}
                /* Só a ação. O porquê fica no radar, não aqui. */
                description={
                  <HStack gap={1} wrap="wrap" vAlign="center">
                    <Token size="sm" color={SEV_COR[a.severidade]} label={SEV_ROTULO[a.severidade]} />
                    {a.pessoa && <Token size="sm" color="blue" label={a.pessoa.split(' ')[0]} />}
                    <Text type="supporting">→ {a.acao}</Text>
                  </HStack>
                }
              />
            ))}
          </List>
        </VStack>
      </Card>
    </Page>
  );
}
