/**
 * Relatórios — catálogo, geração e histórico.
 *
 * O ponto não óbvio desta tela: a FINALIDADE não é só um filtro de
 * confidencialidade, é curadoria. O pack de calibragem tem teto 2 e ainda
 * assim exclui DNA motivacional — porque motivação não é argumento válido
 * numa mesa de calibragem de desempenho.
 */

import { useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Token } from '@astryxdesign/core/Token';
import { Button } from '@astryxdesign/core/Button';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Selector } from '@astryxdesign/core/Selector';
import { Banner } from '@astryxdesign/core/Banner';
import { List, ListItem } from '@astryxdesign/core/List';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Divider } from '@astryxdesign/core/Divider';
import { Braces, ExternalLink, Sparkles } from 'lucide-react';

import { Page, Filtros, Conf } from '../app/ui';
import { useCiclo, SeletorCiclo } from '../app/SeletorCiclo';
import { PESSOAS, dataBR } from '../data/mock';
import {
  MODELOS_RELATORIO, RELATORIOS_GERADOS, type Audiencia,
} from '../data/mockOps';

const AUD_ROTULO: Record<Audiencia, string> = {
  liderado: 'Liderado', rh: 'RH / gestor', coordenador: 'Só você',
};
const AUD_COR = { liderado: 'green', rh: 'blue', coordenador: 'orange' } as const;

/** O que cada finalidade exclui — regra de curadoria, não só de nível. */
const EXCLUI: Record<string, string> = {
  R2: 'DNA motivacional, risco de saída, saúde, registro privado e qualquer menção a mérito ou promoção',
  R3: 'avaliação de terceiros, comparações, registro privado e notas de risco',
  R7: 'registro privado, risco de retenção, DNA, contexto pessoal e nominação em risco individual',
};

export default function Relatorios() {
  // Relatório é sempre DE um ciclo: gerar o pulso sem saber qual é a janela
  // produz um texto que não se sustenta na mesa.
  const { ciclos, ciclo, trocar } = useCiclo();
  const [aba, setAba] = useState('catalogo');
  const [audiencia, setAudiencia] = useState('');
  const [modelo, setModelo] = useState('');
  const [pessoa, setPessoa] = useState('');

  const catalogo = useMemo(() => MODELOS_RELATORIO.filter(
    (m) => !audiencia || m.audiencia === audiencia), [audiencia]);

  const gerados = useMemo(() => RELATORIOS_GERADOS.filter((r) => {
    if (modelo && r.codigo !== modelo) return false;
    if (audiencia && r.audiencia !== audiencia) return false;
    return true;
  }), [modelo, audiencia]);

  const naoVerificados = RELATORIOS_GERADOS.filter((r) => !r.verificado);

  return (
    <Page
      titulo="Relatórios"
      subtitulo="Gerados a partir de context packs, com toda afirmação ancorada em evidência rastreável"
    >
      <SeletorCiclo ciclos={ciclos} ciclo={ciclo} trocar={trocar} />

      {naoVerificados.length > 0 && (
        <Banner
          status="warning"
          title={`${naoVerificados.length} relatório(s) em RASCUNHO — NÃO VERIFICADO`}
          description="Relatório de calibragem, RH ou devolutiva não pode ser exportado antes de você conferir cada citação."
          endContent={<Button size="sm" label="Ver gerados" onClick={() => setAba('gerados')} />}
        />
      )}

      <TabList value={aba} onChange={setAba} hasDivider>
        <Tab value="catalogo" label={`Catálogo (${MODELOS_RELATORIO.length})`} />
        <Tab value="gerados" label={`Gerados (${RELATORIOS_GERADOS.length})`} />
        <Tab value="gerar" label="Gerar novo" />
      </TabList>

      {aba === 'catalogo' && (
        <>
          <Filtros resultado={`${catalogo.length} de ${MODELOS_RELATORIO.length}`}>
            <Selector label="Audiência" size="sm" variant="ghost" placeholder="Todas as audiências"
                      value={audiencia} onChange={(v) => setAudiencia(v ?? '')} hasClear
                      options={(['liderado', 'rh', 'coordenador'] as Audiencia[])
                        .map((a) => ({ value: a, label: AUD_ROTULO[a] }))} />
            {audiencia && <Button size="sm" variant="ghost" label="Limpar"
                                  onClick={() => setAudiencia('')} />}
          </Filtros>

          <Card padding={0}>
            <List density="balanced" hasDividers>
              {catalogo.map((m) => (
                <ListItem
                  key={m.codigo}
                  label={`${m.codigo} · ${m.nome}`}
                  startContent={<StatusDot
                    variant={m.audiencia === 'coordenador' ? 'warning' : 'accent'}
                    label={AUD_ROTULO[m.audiencia]} />}
                  endContent={<Button size="sm" variant="ghost" label="Gerar"
                                      onClick={() => { setModelo(m.codigo); setAba('gerar'); }} />}
                  description={
                    <VStack gap={1}>
                      <Text type="supporting">{m.descricao}</Text>
                      <HStack gap={1} wrap="wrap" vAlign="center">
                        <Token size="sm" color={AUD_COR[m.audiencia]} label={AUD_ROTULO[m.audiencia]} />
                        <Conf nivel={m.confidMax} />
                        <Token size="sm" color="gray" label={m.periodicidade} />
                      </HStack>
                      {EXCLUI[m.codigo] && (
                        <Text type="supporting" color="accent">
                          Exclui sempre: {EXCLUI[m.codigo]}
                        </Text>
                      )}
                    </VStack>
                  }
                />
              ))}
            </List>
          </Card>
        </>
      )}

      {aba === 'gerados' && (
        <>
          <Filtros resultado={`${gerados.length} de ${RELATORIOS_GERADOS.length}`}>
            <Selector label="Modelo" size="sm" variant="ghost" placeholder="Todos os modelos"
                      value={modelo} onChange={(v) => setModelo(v ?? '')} hasClear
                      options={MODELOS_RELATORIO.map((m) => ({ value: m.codigo, label: `${m.codigo} · ${m.nome}` }))} />
            <Selector label="Audiência" size="sm" variant="ghost" placeholder="Todas as audiências"
                      value={audiencia} onChange={(v) => setAudiencia(v ?? '')} hasClear
                      options={(['liderado', 'rh', 'coordenador'] as Audiencia[])
                        .map((a) => ({ value: a, label: AUD_ROTULO[a] }))} />
            {(modelo || audiencia) && (
              <Button size="sm" variant="ghost" label="Limpar filtros"
                      onClick={() => { setModelo(''); setAudiencia(''); }} />
            )}
          </Filtros>

          <Card padding={0}>
            <List density="balanced" hasDividers>
              {gerados.map((r) => (
                <ListItem
                  key={r.id}
                  label={r.titulo}
                  startContent={<StatusDot variant={r.verificado ? 'success' : 'warning'}
                                           label={r.verificado ? 'Verificado' : 'Não verificado'} />}
                  endContent={
                    <HStack gap={1}>
                      <Button icon={<ExternalLink size={14} />} size="sm" variant="ghost" label="Abrir" />
                      <Button size="sm" variant={r.verificado ? 'ghost' : 'primary'}
                              label={r.verificado ? 'Exportar' : 'Verificar'} />
                    </HStack>
                  }
                  description={
                    <VStack gap={1}>
                      <HStack gap={1} wrap="wrap" vAlign="center">
                        <Token size="sm" color="gray" label={`${r.codigo} · v${r.versao}`} />
                        <Token size="sm" color={AUD_COR[r.audiencia]} label={AUD_ROTULO[r.audiencia]} />
                        <Conf nivel={r.confidMax} />
                        {!r.verificado && <Token size="sm" color="red" label="RASCUNHO — NÃO VERIFICADO" />}
                      </HStack>
                      <Text type="supporting">
                        gerado em {dataBR(r.geradoEm)} ·{' '}
                        {r.evidenciasVerificadas}/{r.evidencias} citações conferidas
                        {r.pessoa ? ` · ${r.pessoa}` : ' · time inteiro'}
                      </Text>
                    </VStack>
                  }
                />
              ))}
            </List>
          </Card>
        </>
      )}

      {aba === 'gerar' && (
        <Card padding={3}>
          <VStack gap={3}>
            <Heading level={3}>Gerar relatório</Heading>

            <HStack gap={2} wrap="wrap">
              <Selector label="Modelo" placeholder="Escolha o modelo"
                        value={modelo} onChange={(v) => setModelo(v ?? '')}
                        options={MODELOS_RELATORIO.map((m) => ({
                          value: m.codigo, label: `${m.codigo} · ${m.nome}`, description: m.descricao,
                        }))} hasSearch />
              <Selector label="Pessoa" placeholder="Time inteiro"
                        value={pessoa} onChange={(v) => setPessoa(v ?? '')} hasClear hasSearch
                        options={PESSOAS.filter((p) => p.status === 'ativo')
                          .map((p) => ({ value: p.slug, label: p.nome }))} />
            </HStack>

            {modelo && (() => {
              const m = MODELOS_RELATORIO.find((x) => x.codigo === modelo)!;
              return (
                <VStack gap={2}>
                  <Divider />
                  <Heading level={4}>Context pack que vai alimentar a geração</Heading>
                  <HStack gap={1} wrap="wrap" vAlign="center">
                    <Text type="label">Audiência</Text>
                    <Token size="sm" color={AUD_COR[m.audiencia]} label={AUD_ROTULO[m.audiencia]} />
                    <Text type="label">Teto</Text>
                    <Conf nivel={m.confidMax} />
                  </HStack>

                  <Banner
                    status="info"
                    title="O filtro roda no servidor, antes do modelo ver o dado"
                    description={EXCLUI[m.codigo]
                      ? `Esta finalidade exclui sempre: ${EXCLUI[m.codigo]}. Não é filtro de prompt — é a consulta que não traz.`
                      : 'Nenhum item acima do teto de confidencialidade entra no pack. Prompt não eleva teto.'}
                  />

                  <List density="compact" hasDividers>
                    <ListItem label="Evidências dentro do teto"
                              startContent={<StatusDot variant="success" label="Incluído" />}
                              endContent={<Text type="supporting">14 itens</Text>} />
                    <ListItem label="Contra-evidências (bloco obrigatório na calibragem)"
                              startContent={<StatusDot variant="success" label="Incluído" />}
                              endContent={<Text type="supporting">3 itens</Text>}
                              description={<Text type="supporting">
                                Separadas das positivas — é o que sustenta o “por que Médio e não Alto”.
                              </Text>} />
                    <ListItem label="Omitido por confidencialidade"
                              startContent={<StatusDot variant="warning" label="Omitido" />}
                              endContent={<Text type="supporting">7 itens</Text>}
                              description={<Text type="supporting">
                                Contagem e motivo, nunca o conteúdo — para o relatório não afirmar completude falsa.
                              </Text>} />
                  </List>

                  <Divider />
                  <Heading level={4}>Validação pós-geração</Heading>
                  <Text type="supporting">
                    Código determinístico, não a IA se auditando: todo ref_code precisa existir, pertencer
                    à pessoa e ao período, caber no teto; todo número do texto precisa estar no pack;
                    afirmação de padrão exige 2 fontes distintas. Falhou, o relatório é rejeitado com a linha apontada.
                  </Text>

                  <HStack gap={1} wrap="wrap">
                    <Button icon={<Sparkles size={14} />} label="Gerar relatório" variant="primary" />
                    <Button icon={<Braces size={14} />} label="Ver o pack em JSON" variant="ghost" />
                  </HStack>
                </VStack>
              );
            })()}
          </VStack>
        </Card>
      )}
    </Page>
  );
}
