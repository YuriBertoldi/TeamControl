/**
 * Ciclos de AVD — cadastro, perguntas abertas e insumo para a IA.
 *
 * Três coisas numa tela só porque são o mesmo movimento: você define o ciclo,
 * registra as perguntas que a portal de avaliação vai fazer, e gera o pacote de dados
 * para respondê-las com lastro.
 *
 * O que esta tela deliberadamente NÃO faz: propor a nota do driver, o
 * quadrante ou a Performance. A IA redige a partir da nota que você digitou —
 * nota → texto, nunca texto → nota. Na mesa você precisa acreditar no que
 * defende, e acreditar exige ter julgado.
 */

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Token } from '@astryxdesign/core/Token';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Collapsible } from '@astryxdesign/core/Collapsible';
import { Plus, RotateCcw, Sparkles, Copy, Trash2, Lock, Unlock } from 'lucide-react';

import { Page, Stats } from '../app/ui';
import { souMeus, dataBR } from '../data/mock';
import {
  carregarCiclos, salvarCiclos, restaurarCiclos, cicloNovo, cicloVigente,
  encerrarCiclo, reabrirCiclo, somenteLeitura,
  STATUS_CICLO, ROTULO_FONTE,
  type Ciclo, type PerguntaAberta, type FonteInsumo, type StatusCiclo,
} from '../data/ciclos';
import { montarInsumo, lastroDe } from '../data/insumo';

const FONTES = Object.keys(ROTULO_FONTE) as FonteInsumo[];

export default function Ciclos() {
  const [lista, setLista] = useState<Ciclo[]>(carregarCiclos);
  const [selecionado, setSelecionado] = useState(() => cicloVigente().id);
  const [aba, setAba] = useState('ciclo');

  const gravar = (nova: Ciclo[]) => { setLista(nova); salvarCiclos(nova); };
  const ciclo = lista.find((c) => c.id === selecionado) ?? lista[0];
  const alterar = (patch: Partial<Ciclo>) =>
    gravar(lista.map((c) => (c.id === ciclo.id ? { ...c, ...patch } : c)));

  const criar = () => {
    const novo = cicloNovo('Novo ciclo', ciclo);
    gravar([...lista, novo]);
    setSelecionado(novo.id);
  };

  const st = STATUS_CICLO.find((s) => s.valor === ciclo.status)!;
  const elegiveis = souMeus().filter((p) => p.elegivel);
  const fechado = somenteLeitura(ciclo);

  /**
   * Encerrar é ato consciente, por isso o duplo clique.
   *
   * Não é destrutivo — o ciclo continua inteiro e vira histórico —, mas é o
   * que congela as notas que você defendeu na mesa. Fazer isso por engano no
   * meio da calibragem custa caro, e um `confirm()` do navegador travaria a
   * automação da tela.
   */
  const [confirmando, setConfirmando] = useState(false);

  return (
    <Page
      titulo="Ciclos de AVD"
      subtitulo="Escala, faixas, drivers e perguntas são dados do ciclo — não constantes no código."
      largura={1240}
      acoes={
        <HStack gap={1} wrap="wrap">
          {fechado ? (
            <Button icon={<Unlock size={14} />} variant="ghost" label="Reabrir ciclo"
                    onClick={() => gravar(reabrirCiclo(ciclo.id, lista))} />
          ) : confirmando ? (
            <>
              <Button icon={<Lock size={14} />} variant="primary"
                      label="Confirmar encerramento"
                      onClick={() => { gravar(encerrarCiclo(ciclo.id, lista)); setConfirmando(false); }} />
              <Button variant="ghost" label="Cancelar" onClick={() => setConfirmando(false)} />
            </>
          ) : (
            <Button icon={<Lock size={14} />} variant="secondary" label="Encerrar ciclo"
                    onClick={() => setConfirmando(true)} />
          )}
          <Button icon={<Plus size={14} />} label="Novo ciclo" onClick={criar} />
        </HStack>
      }
    >
      <HStack gap={2} vAlign="end" wrap="wrap">
        <Selector
          label="Ciclo" value={ciclo.id} onChange={(v) => v && setSelecionado(v)}
          options={lista.map((c) => ({
            value: c.id, label: c.nome,
            description: `${STATUS_CICLO.find((s) => s.valor === c.status)!.rotulo} · ${
              c.perguntas.length} perguntas`,
          }))}
        />
        <Token size="sm" color={st.cor} label={st.rotulo} />
        <Text type="supporting">{st.descricao}</Text>
      </HStack>

      {confirmando && (
        <Banner
          status="warning"
          title={`Encerrar ${ciclo.nome}?`}
          description="O ciclo continua inteiro no sistema — notas, justificativas e defesas — mas passa a ser somente leitura em todas as telas do módulo. É isso que deixa comparar com os ciclos seguintes: o que você defendeu na mesa fica exatamente como estava. Dá para reabrir depois, com registro."
        />
      )}

      {fechado && (
        <Banner
          status="info"
          title={`Ciclo encerrado${ciclo.encerradoEm ? ` em ${dataBR(ciclo.encerradoEm)}` : ''}`}
          description="Somente histórico. Os campos abaixo estão bloqueados e as telas de AVD, Calibragem, Radar e Relatórios mostram este ciclo em leitura."
        />
      )}

      {!fechado && ciclo.status === 'calibragem' && (
        <Banner
          status="warning"
          title="Calibragem em andamento — restrição de conversa vigente"
          description="Enquanto este ciclo estiver em calibragem, nenhuma 1:1 pode citar mérito, promoção, aumento ou próximo nível. A tela de preparação já aplica isso em 'O que não falar'."
        />
      )}

      <Stats itens={[
        { valor: elegiveis.length, rotulo: 'elegíveis ao ciclo' },
        { valor: souMeus().length - elegiveis.length, rotulo: 'fora do ciclo' },
        { valor: ciclo.driversComportamento.length + ciclo.driversDesempenho.length,
          rotulo: 'drivers' },
        { valor: ciclo.perguntas.length, rotulo: 'perguntas abertas',
          cor: ciclo.perguntas.length ? undefined : 'orange' },
      ]} />

      <TabList value={aba} onChange={setAba} hasDivider>
        <Tab value="ciclo" label="Definição do ciclo" />
        <Tab value="perguntas" label={`Perguntas abertas (${ciclo.perguntas.length})`} />
        <Tab value="insumo" label="Gerar insumo para IA" />
      </TabList>

      {aba === 'ciclo' && <Definicao ciclo={ciclo} alterar={fechado ? () => {} : alterar}
                                     restaurar={() => gravar(restaurarCiclos())} />}
      {aba === 'perguntas' && <Perguntas ciclo={ciclo} alterar={fechado ? () => {} : alterar} />}
      {aba === 'insumo' && <GerarInsumo ciclo={ciclo} />}
    </Page>
  );
}

/* ---------- definição ---------- */

function Definicao({ ciclo, alterar, restaurar }: {
  ciclo: Ciclo; alterar: (p: Partial<Ciclo>) => void; restaurar: () => void;
}) {
  return (
    <VStack gap={3}>
      <Card padding={3}>
        <VStack gap={2}>
          <Heading level={3}>Janela e elegibilidade</Heading>
          <HStack gap={2} wrap="wrap" vAlign="end">
            <TextInput label="Nome" value={ciclo.nome} onChange={(v) => alterar({ nome: v })} />
            <Selector label="Status" value={ciclo.status}
                      onChange={(v) => alterar({ status: (v ?? 'planejado') as StatusCiclo })}
                      options={STATUS_CICLO.map((s) => ({
                        value: s.valor, label: s.rotulo, description: s.descricao }))} />
          </HStack>
          <HStack gap={2} wrap="wrap" vAlign="end">
            <TextInput label="Início (AAAA-MM-DD)" value={ciclo.inicio}
                       onChange={(v) => alterar({ inicio: v })} />
            <TextInput label="Fim (AAAA-MM-DD)" value={ciclo.fim}
                       onChange={(v) => alterar({ fim: v })} />
            <TextInput label="Data de corte" value={ciclo.dataCorte}
                       onChange={(v) => alterar({ dataCorte: v })} />
            <NumberInput label="Meses mínimos de casa" value={ciclo.mesesMinimos}
                         onChange={(v) => alterar({ mesesMinimos: v })} min={0} max={24} />
          </HStack>
          <Text type="supporting">
            A elegibilidade é calculada na data de corte ({dataBR(ciclo.dataCorte)}),
            não congelada numa coluna — quem completa {ciclo.mesesMinimos} meses depois
            entra sozinho.
          </Text>
        </VStack>
      </Card>

      <Card padding={3}>
        <VStack gap={2}>
          <Heading level={3}>Escala e faixas</Heading>
          <Banner
            status="info"
            title="Escala é dado do ciclo, e por isso a comparação entre ciclos é honesta"
            description="Uma nota 3,5 não quer dizer o mesmo em dois ciclos se a escala ou as faixas mudaram. Guardando as duas junto com as notas, a trajetória continua legível anos depois."
          />
          <HStack gap={2} wrap="wrap" vAlign="end">
            <NumberInput label="Mínimo" value={ciclo.escalaMin}
                         onChange={(v) => alterar({ escalaMin: v })} min={0} max={10} />
            <NumberInput label="Máximo" value={ciclo.escalaMax}
                         onChange={(v) => alterar({ escalaMax: v })} min={1} max={10} />
          </HStack>
          <TextInput label="Rótulos da escala (separados por vírgula)"
                     value={ciclo.rotulosEscala.join(', ')}
                     onChange={(v) => alterar({
                       rotulosEscala: v.split(',').map((s) => s.trim()).filter(Boolean) })} />
          <HStack gap={1} wrap="wrap" vAlign="center">
            <Text type="label">Faixas</Text>
            {ciclo.faixas.map((f) => (
              <Token key={f.rotulo} size="sm" color={f.cor}
                     label={`${f.rotulo} ${f.min.toFixed(1)}–${f.max.toFixed(1)}`} />
            ))}
          </HStack>
        </VStack>
      </Card>

      <Card padding={3}>
        <VStack gap={2}>
          <Heading level={3}>Drivers</Heading>
          <TextArea label="Comportamento (um por linha)" rows={8}
                    value={ciclo.driversComportamento.join('\n')}
                    onChange={(v) => alterar({
                      driversComportamento: v.split('\n').map((s) => s.trim()).filter(Boolean) })} />
          <TextArea label="Desempenho (um por linha)" rows={6}
                    value={ciclo.driversDesempenho.join('\n')}
                    onChange={(v) => alterar({
                      driversDesempenho: v.split('\n').map((s) => s.trim()).filter(Boolean) })} />
        </VStack>
      </Card>

      <Button icon={<RotateCcw size={14} />} variant="ghost"
              label="Restaurar ciclos padrão" onClick={restaurar} />
    </VStack>
  );
}

/* ---------- perguntas ---------- */

function Perguntas({ ciclo, alterar }: {
  ciclo: Ciclo; alterar: (p: Partial<Ciclo>) => void;
}) {
  const [texto, setTexto] = useState('');

  const adicionar = () => {
    if (!texto.trim()) return;
    const nova: PerguntaAberta = {
      id: `p${Date.now()}`, texto: texto.trim(), alvo: 'lider',
      fontes: ['evidencias', 'registros_1a1'],
    };
    alterar({ perguntas: [...ciclo.perguntas, nova] });
    setTexto('');
  };

  const mudar = (id: string, patch: Partial<PerguntaAberta>) =>
    alterar({ perguntas: ciclo.perguntas.map((q) => (q.id === id ? { ...q, ...patch } : q)) });

  const remover = (id: string) =>
    alterar({ perguntas: ciclo.perguntas.filter((q) => q.id !== id) });

  return (
    <VStack gap={3}>
      <Banner
        status="info"
        title="Cole a pergunta exatamente como ela aparece na portal de avaliação"
        description="O texto literal importa: é ele que vai no prompt, e é contra ele que a resposta é conferida. Parafrasear aqui produz uma resposta que não cabe no campo lá."
      />

      <Card padding={3}>
        <VStack gap={2}>
          <Heading level={3}>Adicionar pergunta</Heading>
          <TextArea label="Texto da pergunta" rows={3} value={texto} onChange={setTexto}
                    placeholder="ex.: Quais foram os principais pontos fortes demonstrados no período?" />
          <HStack gap={1}>
            <Button icon={<Plus size={14} />} label="Adicionar" variant="primary"
                    onClick={adicionar} isDisabled={!texto.trim()} />
          </HStack>
        </VStack>
      </Card>

      {ciclo.perguntas.length === 0 && (
        <Card padding={3}>
          <Text type="supporting">
            Nenhuma pergunta cadastrada neste ciclo. Sem elas, a aba de insumo não
            tem o que responder.
          </Text>
        </Card>
      )}

      {ciclo.perguntas.map((q, i) => (
        <Card key={q.id} padding={3}>
          <VStack gap={2}>
            <HStack gap={2} vAlign="center" wrap="wrap" hAlign="between">
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Heading level={3}>Pergunta {i + 1}</Heading>
                <Token size="sm" color={q.alvo === 'lider' ? 'blue' : 'purple'}
                       label={q.alvo === 'lider' ? 'respondida por você' : 'autoavaliação'} />
              </HStack>
              <Button icon={<Trash2 size={14} />} size="sm" variant="ghost"
                      label="Remover" onClick={() => remover(q.id)} />
            </HStack>

            <TextArea label="Texto" rows={2} value={q.texto}
                      onChange={(v) => mudar(q.id, { texto: v })} />

            <HStack gap={2} wrap="wrap" vAlign="end">
              <Selector label="Quem responde" value={q.alvo}
                        onChange={(v) => mudar(q.id, { alvo: (v ?? 'lider') as 'lider' | 'autoavaliacao' })}
                        options={[
                          { value: 'lider', label: 'Você, sobre o liderado' },
                          { value: 'autoavaliacao', label: 'O liderado, sobre si' },
                        ]} />
              <NumberInput label="Limite de caracteres" value={q.limite ?? 0}
                           onChange={(v) => mudar(q.id, { limite: v || undefined })}
                           min={0} max={10000} />
            </HStack>

            <Collapsible
              defaultIsOpen
              trigger={<Text type="label">
                De onde puxar o insumo ({q.fontes.length} fontes)
              </Text>}
            >
              <HStack gap={1} wrap="wrap" paddingBlockStart={1}>
                {FONTES.map((f) => {
                  const ativa = q.fontes.includes(f);
                  return (
                    <Button
                      key={f} size="sm"
                      variant={ativa ? 'primary' : 'ghost'}
                      label={ROTULO_FONTE[f]}
                      onClick={() => mudar(q.id, {
                        fontes: ativa ? q.fontes.filter((x) => x !== f) : [...q.fontes, f],
                      })}
                    />
                  );
                })}
              </HStack>
            </Collapsible>
          </VStack>
        </Card>
      ))}
    </VStack>
  );
}

/* ---------- insumo ---------- */

function GerarInsumo({ ciclo }: { ciclo: Ciclo }) {
  const elegiveis = souMeus()
    .filter((p) => p.elegivel)
    // Quem tem menos lastro primeiro: é onde a justificativa vai doer.
    .sort((a, b) => lastroDe(a) - lastroDe(b));

  const [slug, setSlug] = useState(elegiveis[0]?.slug ?? '');
  const [perguntaId, setPerguntaId] = useState(ciclo.perguntas[0]?.id ?? '');
  const [copiado, setCopiado] = useState(false);

  const pergunta = ciclo.perguntas.find((q) => q.id === perguntaId);

  if (ciclo.perguntas.length === 0) {
    return (
      <Banner
        status="warning"
        title="Nenhuma pergunta cadastrada neste ciclo"
        description="Cadastre as perguntas na aba anterior, copiando o texto da portal de avaliação. O insumo é montado para responder uma pergunta específica, não em geral."
      />
    );
  }

  const insumo = pergunta ? montarInsumo(slug, pergunta, ciclo) : null;

  const copiar = () => {
    if (!insumo) return;
    void navigator.clipboard.writeText(insumo.prompt);
    setCopiado(true);
    window.setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <VStack gap={3}>
      <Banner
        status="info"
        title="O sistema junta a evidência; o julgamento continua seu"
        description="O pacote não propõe nota, quadrante nem Performance — só reúne o que está registrado, com ref_code em cada item, e exige citação. Lance a nota primeiro e use isto para redigir a justificativa."
      />

      <Card padding={3}>
        <VStack gap={2}>
          <HStack gap={2} wrap="wrap" vAlign="end">
            <Selector label="Liderado" value={slug} hasSearch
                      onChange={(v) => v && setSlug(v)}
                      options={elegiveis.map((p) => ({
                        value: p.slug, label: p.nome,
                        description: `${p.cargo} · ${lastroDe(p)} evidências no período`,
                      }))} />
            <Selector label="Pergunta" value={perguntaId}
                      onChange={(v) => v && setPerguntaId(v)}
                      options={ciclo.perguntas.map((q, i) => ({
                        value: q.id, label: `Pergunta ${i + 1}`, description: q.texto,
                      }))} />
            <Button icon={<Copy size={14} />} variant="primary"
                    label={copiado ? 'Copiado' : 'Copiar prompt'} onClick={copiar} />
          </HStack>
          <Text type="supporting">
            Ordenado por quem tem menos lastro: é onde a justificativa vai faltar
            argumento na mesa.
          </Text>
        </VStack>
      </Card>

      {insumo && insumo.avisos.length > 0 && (
        <Banner
          status="warning"
          title={`${insumo.avisos.length} ponto(s) de atenção antes de gerar`}
          description={insumo.avisos.join(' · ')}
        />
      )}

      {insumo && (
        <Card padding={0}>
          <List density="compact" hasDividers>
            {Object.entries(insumo.contagem).map(([fonte, n]) => (
              <ListItem
                key={fonte}
                label={fonte}
                startContent={<StatusDot variant={n > 0 ? 'success' : 'warning'}
                                         label={n > 0 ? 'Com dado' : 'Vazio'} />}
                endContent={<Text type="supporting" hasTabularNumbers>{n}</Text>}
              />
            ))}
            {insumo.omitidos.map((o) => (
              <ListItem
                key={o.motivo}
                label="Omitido por confidencialidade"
                startContent={<StatusDot variant="neutral" label="Filtrado" />}
                description={<Text type="supporting">{o.motivo}</Text>}
                endContent={<Text type="supporting" hasTabularNumbers>{o.quantidade}</Text>}
              />
            ))}
          </List>
        </Card>
      )}

      {insumo && (
        <Card padding={3}>
          <VStack gap={2}>
            <HStack gap={2} vAlign="center" wrap="wrap" hAlign="between">
              <HStack gap={2} vAlign="center">
                <Sparkles size={16} />
                <Heading level={3}>Prompt gerado</Heading>
              </HStack>
              <Text type="supporting">{insumo.prompt.length} caracteres</Text>
            </HStack>
            <Divider />
            <TextArea
              label="Prompt para colar no Claude Code"
              isLabelHidden
              rows={22}
              value={insumo.prompt}
              isReadOnly
            />
          </VStack>
        </Card>
      )}
    </VStack>
  );
}
