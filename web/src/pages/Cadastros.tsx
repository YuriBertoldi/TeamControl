/**
 * Cadastros — pessoas, tribos e cargos.
 *
 * Nenhuma operação apaga alguém. Sair da gestão, afastar ou desligar são
 * mudanças de STATUS, porque 1:1s, evidências e histórico de AVD continuam
 * valendo depois — é o lastro que sustenta a calibragem do ciclo.
 *
 * Cargo é cadastro e não texto livre: é ele que define a família (e com ela a
 * cor) e o conjunto de skills esperadas da cadeira.
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
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Plus, RotateCcw, UserPlus } from 'lucide-react';

import { Page, Filtros, Stats, corDaCadeira, rotuloCargo } from '../app/ui';
import { ListaDetalhe, Detalhe, Bloco, type LinhaEnxuta } from '../app/ListaDetalhe';
import { nivelDe, type Pessoa, type Familia } from '../data/mock';
import { NIVEL_ROTULO } from '../data/mockCiclo';
import {
  carregarPessoas, salvarPessoas, restaurarPessoas, pessoaNova,
  carregarTribos, salvarTribos, restaurarTribos,
  carregarCargos, salvarCargos, restaurarCargos, cargoNovo, STATUS_PESSOA, type Cargo,
  carregarSkills, skillValePara,
} from '../data/cadastro';
import type { Tribo } from '../data/squads';
import CadastroSkills from './cadastro/Skills';

const FAMILIAS: Familia[] = ['Desenvolvimento', 'Testes / QA', 'Produto', 'Liderança'];
/** Cor da família — a mesma do resto do sistema, para a leitura não trocar de código. */
const COR_FAMILIA: Record<Familia, 'teal' | 'green' | 'blue' | 'purple'> = {
  'Desenvolvimento': 'teal',
  'Testes / QA': 'green',
  'Produto': 'blue',
  'Liderança': 'purple',
};

const CORES = ['teal', 'blue', 'green', 'orange', 'purple', 'cyan', 'red'] as const;

const DOT_STATUS = {
  ativo: 'success', afastado: 'warning', fora_gestao: 'neutral', desligado: 'neutral',
} as const;
const COR_STATUS = {
  ativo: 'green', afastado: 'orange', fora_gestao: 'gray', desligado: 'gray',
} as const;

interface LinhaPessoa extends LinhaEnxuta { p: Pessoa }

export default function Cadastros() {
  const [aba, setAba] = useState('pessoas');
  return (
    <Page
      titulo="Cadastros"
      subtitulo="Pessoas, tribos, cargos e skills. Nada é apagado — tudo é mudança de status."
      largura={1240}
    >
      <TabList value={aba} onChange={setAba} hasDivider>
        <Tab value="pessoas" label="Pessoas" />
        <Tab value="tribos" label="Tribos" />
        <Tab value="cargos" label="Cargos" />
        <Tab value="skills" label="Skills" />
      </TabList>

      {aba === 'pessoas' && <CadastroPessoas />}
      {aba === 'tribos' && <CadastroTribos />}
      {aba === 'cargos' && <CadastroCargos />}
      {aba === 'skills' && <CadastroSkills />}
    </Page>
  );
}

/* ---------- pessoas ---------- */

function CadastroPessoas() {
  const [lista, setLista] = useState<Pessoa[]>(carregarPessoas);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [busca, setBusca] = useState('');
  const [nomeNovo, setNomeNovo] = useState('');
  const cargos = carregarCargos();

  const gravar = (nova: Pessoa[]) => { setLista(nova); salvarPessoas(nova); };
  const alterar = (slug: string, patch: Partial<Pessoa>) =>
    gravar(lista.map((p) => (p.slug === slug ? { ...p, ...patch } : p)));

  const criar = () => {
    if (!nomeNovo.trim()) return;
    gravar([...lista, pessoaNova(nomeNovo.trim(), lista.map((p) => p.slug))]);
    setNomeNovo('');
  };

  const visiveis = lista.filter((p) =>
    (!filtroStatus || p.status === filtroStatus) &&
    (!busca || p.nome.toLowerCase().includes(busca.toLowerCase())));

  const linhas: LinhaPessoa[] = visiveis.map((p) => ({
    id: p.slug,
    titulo: p.nome,
    dot: DOT_STATUS[p.status],
    dotLabel: STATUS_PESSOA.find((s) => s.valor === p.status)?.rotulo ?? p.status,
    marcadores: [
      { texto: rotuloCargo(p), cor: corDaCadeira(p.familia, nivelDe(p)) },
      { texto: STATUS_PESSOA.find((s) => s.valor === p.status)!.rotulo, cor: COR_STATUS[p.status] },
    ],
    p,
  }));

  const conta = (s: string) => lista.filter((p) => p.status === s).length;

  return (
    <VStack gap={3}>
      <Stats itens={[
        { valor: conta('ativo'), rotulo: 'ativos' },
        { valor: conta('afastado'), rotulo: 'afastados', cor: conta('afastado') ? 'orange' : undefined },
        { valor: conta('fora_gestao'), rotulo: 'fora da gestão' },
        { valor: conta('desligado'), rotulo: 'desligados' },
      ]} />

      <Card padding={4}>
        <VStack gap={2}>
          <Heading level={3}>Adicionar liderado</Heading>
          <HStack gap={2} wrap="wrap" vAlign="end">
            <TextInput label="Nome completo" value={nomeNovo} onChange={setNomeNovo}
                       placeholder="ex.: Mariana Prado" onEnter={criar} />
            <Button icon={<UserPlus size={14} />} label="Adicionar" variant="primary"
                    onClick={criar} isDisabled={!nomeNovo.trim()} />
          </HStack>
          <Text type="supporting">
            Entra como ativo e inelegível ao ciclo (menos de 6 meses). Ajuste cargo, squad e
            admissão no detalhe.
          </Text>
        </VStack>
      </Card>

      <Filtros resultado={`${visiveis.length} de ${lista.length}`}>
        <TextInput label="Buscar" size="sm" placeholder="nome do liderado"
                   value={busca} onChange={setBusca} />
        <Selector label="Status" size="sm" variant="ghost" placeholder="Todos os status"
                  value={filtroStatus} onChange={(v) => setFiltroStatus(v ?? '')} hasClear
                  options={STATUS_PESSOA.map((s) => ({
                    value: s.valor, label: `${s.rotulo} (${conta(s.valor)})`, description: s.descricao,
                  }))} />
        <Button icon={<RotateCcw size={14} />} size="sm" variant="ghost" label="Restaurar padrão"
                onClick={() => gravar(restaurarPessoas())} />
      </Filtros>

      <Card padding={0}>
        <ListaDetalhe
          itens={linhas}
          larguraPainel={460}
          vazio="Nenhuma pessoa com esses filtros."
          detalhe={(l) => (
            <EditorPessoa p={l.p} cargos={cargos} alterar={alterar} />
          )}
        />
      </Card>
    </VStack>
  );
}

function EditorPessoa({ p, cargos, alterar }: {
  p: Pessoa; cargos: Cargo[];
  alterar: (slug: string, patch: Partial<Pessoa>) => void;
}) {
  const set = (patch: Partial<Pessoa>) => alterar(p.slug, patch);

  return (
    <Detalhe
      titulo={p.nome}
      marcadores={
        <>
          <Token size="sm" color={corDaCadeira(p.familia, nivelDe(p))} label={rotuloCargo(p)} />
          <Token size="sm" color={COR_STATUS[p.status]}
                 label={STATUS_PESSOA.find((s) => s.valor === p.status)!.rotulo} />
        </>
      }
    >
      <VStack gap={2}>
        <TextInput label="Nome completo" value={p.nome} onChange={(v) => set({ nome: v })} />
        <TextInput label="Como você chama" value={p.curto} onChange={(v) => set({ curto: v })} />

        <Selector
          label="Cargo" value={p.cargo} hasSearch
          onChange={(v) => {
            const c = cargos.find((x) => x.nome === v);
            // O cargo é quem define a família — e a família define a cor.
            set(c ? { cargo: c.nome, familia: c.familia } : { cargo: v ?? p.cargo });
          }}
          options={cargos.map((c) => ({ value: c.nome, label: c.nome, description: c.familia }))}
        />

        <Selector label="Família" value={p.familia}
                  onChange={(v) => set({ familia: (v ?? p.familia) as Familia })}
                  options={FAMILIAS.map((f) => ({ value: f, label: f }))} />

        {p.familia === 'Testes / QA' && (
          <Selector label="Responde à coordenação de" value={p.qaDe ?? 'dev'}
                    onChange={(v) => set({ qaDe: (v ?? 'dev') as 'dev' | 'produto' })}
                    options={[
                      { value: 'dev', label: 'Desenvolvimento (sua)' },
                      { value: 'produto', label: 'Produto (outra coordenação)' },
                    ]} />
        )}

        <Switch label="É Tech Lead" value={p.techLead} onChange={(v) => set({ techLead: v })} />

        <TextInput label="Admissão (AAAA-MM-DD)" value={p.admissao}
                   onChange={(v) => set({ admissao: v })} />
        <NumberInput label="Cadência de 1:1 (dias)" value={p.cadenciaDias ?? 60}
                     onChange={(v) => set({ cadenciaDias: v })} min={7} max={180} />

        <Divider />

        <Bloco rotulo="Situação">
          <VStack gap={1}>
            <Selector
              label="Status" value={p.status}
              onChange={(v) => set({ status: (v ?? 'ativo') as Pessoa['status'] })}
              options={STATUS_PESSOA.map((s) => ({
                value: s.valor, label: s.rotulo, description: s.descricao,
              }))}
            />
            <Text type="supporting">
              {STATUS_PESSOA.find((s) => s.valor === p.status)!.descricao}
            </Text>
          </VStack>
        </Bloco>

        {p.status === 'afastado' && (
          <>
            <TextInput label="Motivo do afastamento" value={p.motivoAfastamento ?? ''}
                       onChange={(v) => set({ motivoAfastamento: v })}
                       placeholder="ex.: licença médica" />
            <TextInput label="Retorno previsto (AAAA-MM-DD)" value={p.retornoPrevisto ?? ''}
                       onChange={(v) => set({ retornoPrevisto: v })} />
            <Banner
              status="info"
              title="Afastamento legal não penaliza a avaliação"
              description="O período de afastamento sai do cálculo: a AVD considera o tempo de atuação efetiva. O motivo é dado sensível e só aparece para você."
            />
          </>
        )}

        <Divider />

        <Bloco rotulo="Remuneração · confidencialidade 3">
          <Text type="supporting">
            Não sai em relatório, export nem pacote para IA. Nem para o RH. Nos
            seus próprios registros de 1:1 o tema já aparece sempre como
            "mantido apenas no privado" — aqui é a mesma regra, no código.
          </Text>
        </Bloco>
        <HStack gap={2} wrap="wrap" vAlign="end">
          <NumberInput label="Salário (R$)" value={p.salario ?? 0}
                       onChange={(v) => set({ salario: v || undefined })}
                       min={0} max={100000} />
          <TextInput label="Faixa / nível salarial" value={p.faixaSalarial ?? ''}
                     onChange={(v) => set({ faixaSalarial: v || undefined })}
                     placeholder="ex.: Pleno II" />
          <TextInput label="Último reajuste (AAAA-MM-DD)" value={p.ultimoReajuste ?? ''}
                     onChange={(v) => set({ ultimoReajuste: v || undefined })} />
        </HStack>
        <Text type="supporting">
          O dado de gestão que importa não é o valor isolado e sim há quanto
          tempo ele não muda — acima de 12 meses o perfil levanta alerta.
        </Text>

        {(p.status === 'fora_gestao' || p.status === 'desligado') && (
          <Banner
            status="info"
            title="Histórico preservado"
            description="A pessoa sai das visões ativas, mas 1:1s, evidências e avaliações continuam no banco — é o lastro que sustenta a calibragem do ciclo em andamento."
          />
        )}
      </VStack>
    </Detalhe>
  );
}

/* ---------- tribos ---------- */

function CadastroTribos() {
  const [lista, setLista] = useState<Tribo[]>(carregarTribos);
  const [nome, setNome] = useState('');

  const gravar = (nova: Tribo[]) => { setLista(nova); salvarTribos(nova); };
  const alterar = (id: string, patch: Partial<Tribo>) =>
    gravar(lista.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const criar = () => {
    if (!nome.trim()) return;
    gravar([...lista, {
      id: `tribo-${Date.now()}`, nome: nome.trim(), cor: 'blue', produto: '',
      portalId: '', coordenacao: ['Coordenação'], gerencia: [],
    }]);
    setNome('');
  };

  return (
    <VStack gap={3}>
      <Card padding={4}>
        <VStack gap={2}>
          <Heading level={3}>Adicionar tribo</Heading>
          <HStack gap={2} wrap="wrap" vAlign="end">
            <TextInput label="Nome da tribo" value={nome} onChange={setNome}
                       placeholder="ex.: Conta Corrente" onEnter={criar} />
            <Button icon={<Plus size={14} />} label="Adicionar" variant="primary"
                    onClick={criar} isDisabled={!nome.trim()} />
          </HStack>
        </VStack>
      </Card>

      {lista.map((t) => (
        <Card key={t.id} padding={4}>
          <VStack gap={2}>
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Heading level={3}>{t.nome}</Heading>
              <Token size="sm" color={t.cor} label={t.cor} />
            </HStack>
            <HStack gap={2} wrap="wrap" vAlign="end">
              <TextInput label="Nome" value={t.nome} onChange={(v) => alterar(t.id, { nome: v })} />
              <TextInput label="Produto" value={t.produto}
                         onChange={(v) => alterar(t.id, { produto: v })} />
              <TextInput label="ID na portal de avaliação" value={t.portalId ?? ''}
                         onChange={(v) => alterar(t.id, { portalId: v })} />
              <Selector label="Cor" value={t.cor}
                        onChange={(v) => alterar(t.id, { cor: (v ?? 'blue') as Tribo['cor'] })}
                        options={CORES.map((c) => ({ value: c, label: c }))} />
            </HStack>
            <TextInput label="Coordenação (separada por vírgula)"
                       value={t.coordenacao.join(', ')}
                       onChange={(v) => alterar(t.id, {
                         coordenacao: v.split(',').map((s) => s.trim()).filter(Boolean),
                       })} />
          </VStack>
        </Card>
      ))}

      <Button icon={<RotateCcw size={14} />} variant="ghost" label="Restaurar tribos padrão"
              onClick={() => gravar(restaurarTribos())} />
    </VStack>
  );
}

/* ---------- cargos ---------- */

function CadastroCargos() {
  const [lista, setLista] = useState<Cargo[]>(carregarCargos);
  const [nome, setNome] = useState('');
  const [familia, setFamilia] = useState<Familia>('Desenvolvimento');

  const gravar = (nova: Cargo[]) => { setLista(nova); salvarCargos(nova); };
  const alterar = (id: string, patch: Partial<Cargo>) =>
    gravar(lista.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const criar = () => {
    if (!nome.trim()) return;
    gravar([...lista, cargoNovo(nome.trim(), familia)]);
    setNome('');
  };

  return (
    <VStack gap={3}>
      <Banner
        status="info"
        title="O cargo define a família e as skills esperadas da cadeira"
        description="Dev não é avaliado em Robot Framework; QA não é avaliado em Delphi/VCL. A matriz de skills mostra só o que o cargo da pessoa exige, e o gap é contra o esperado da cadeira."
      />

      <Card padding={4}>
        <VStack gap={2}>
          <Heading level={3}>Adicionar cargo</Heading>
          <HStack gap={2} wrap="wrap" vAlign="end">
            <TextInput label="Nome do cargo" value={nome} onChange={setNome}
                       placeholder="ex.: Analista de Testes Sênior" onEnter={criar} />
            <Selector label="Família" value={familia}
                      onChange={(v) => setFamilia((v ?? 'Desenvolvimento') as Familia)}
                      options={FAMILIAS.map((f) => ({ value: f, label: f }))} />
            <Button icon={<Plus size={14} />} label="Adicionar" variant="primary"
                    onClick={criar} isDisabled={!nome.trim()} />
          </HStack>
        </VStack>
      </Card>

      <Card padding={0}>
        <ListaDetalhe
          larguraPainel={460}
          vazio="Nenhum cargo cadastrado."
          itens={lista.map((c) => ({
            id: c.id,
            titulo: c.nome,
            dot: 'accent' as const,
            dotLabel: c.familia,
            marcadores: [
              { texto: c.familia, cor: COR_FAMILIA[c.familia] },
              ...(c.skills.length === 0
                ? [{ texto: 'sem skills', cor: 'orange' as const }]
                : []),
            ],
            valor: `${c.skills.length} skills`,
            c,
          }))}
          detalhe={(l) => <EditorCargo c={l.c} alterar={alterar} />}
        />
      </Card>

      <Button icon={<RotateCcw size={14} />} variant="ghost" label="Restaurar cargos padrão"
              onClick={() => gravar(restaurarCargos())} />
    </VStack>
  );
}

/**
 * Editor das skills da cadeira.
 *
 * A lista inteira do catálogo aparece, com as da cadeira destacadas: vincular
 * é escolher dentro do que existe, não digitar nome novo. Skill solta por
 * cargo faria a matriz ter 50 colunas que ninguém reconhece.
 */
function EditorCargo({ c, alterar }: {
  c: Cargo; alterar: (id: string, patch: Partial<Cargo>) => void;
}) {
  const nivelDaSkill = (codigo: string) =>
    c.skills.find((s) => s.codigo === codigo)?.nivelEsperado;

  const vincular = (codigo: string, nivel: number | undefined) =>
    alterar(c.id, {
      skills: nivel === undefined
        ? c.skills.filter((s) => s.codigo !== codigo)
        : [...c.skills.filter((s) => s.codigo !== codigo), { codigo, nivelEsperado: nivel }],
    });

  // Só o que se aplica à família da cadeira. Oferecer Robot Framework para um
  // cargo de Produto não é só ruído na tela: vira linha na matriz que nunca vai
  // ser preenchida, e gap falso contamina a leitura de cobertura.
  //
  // O que já está vinculado continua aparecendo mesmo se a restrição mudou
  // depois — senão a skill some da tela e não dá para desvincular.
  const doCatalogo = carregarSkills();
  const aplicaveis = doCatalogo.filter((s) => skillValePara(s, c.familia));
  const herdadas = doCatalogo.filter(
    (s) => !skillValePara(s, c.familia) && c.skills.some((x) => x.codigo === s.codigo));
  const lista = [...aplicaveis, ...herdadas];
  const categorias = [...new Set(lista.map((s) => s.categoria))];

  return (
    <Detalhe
      titulo={c.nome}
      marcadores={<Token size="sm" color={COR_FAMILIA[c.familia]} label={c.familia} />}
    >
      <VStack gap={2}>
        <TextInput label="Nome do cargo" value={c.nome}
                   onChange={(v) => alterar(c.id, { nome: v })} />
        <Selector label="Família" value={c.familia}
                  onChange={(v) => alterar(c.id, { familia: (v ?? c.familia) as Familia })}
                  options={FAMILIAS.map((f) => ({ value: f, label: f }))} />

        <Divider />

        <Bloco rotulo={`Skills da cadeira (${c.skills.length} de ${lista.length} aplicáveis a ${c.familia})`}>
          <Text type="supporting">
            O nível é o mínimo esperado de quem ocupa a cadeira. Quem fica abaixo
            aparece em Matriz de skills › Cobertura da cadeira.
          </Text>
        </Bloco>

        {categorias.map((cat) => (
          <VStack key={cat} gap={1}>
            <Text type="label">{cat}</Text>
            <List density="compact" hasDividers>
              {lista.filter((s) => s.categoria === cat).map((s) => {
                const n = nivelDaSkill(s.codigo);
                return (
                  <ListItem
                    key={s.codigo}
                    label={s.nome}
                    startContent={<StatusDot
                      variant={n === undefined ? 'neutral' : 'success'}
                      label={n === undefined ? 'Não exigida' : `Exigida, nível ${n}`} />}
                    endContent={
                      <Selector
                        label={`Nível esperado em ${s.nome}`} isLabelHidden
                        size="sm" variant="ghost" hasClear
                        placeholder="não exige"
                        value={n === undefined ? '' : String(n)}
                        onChange={(v) => vincular(s.codigo, v ? Number(v) : undefined)}
                        options={[1, 2, 3, 4].map((x) => ({
                          value: String(x), label: `≥ ${x} ${NIVEL_ROTULO[x]}`,
                        }))}
                      />
                    }
                  />
                );
              })}
            </List>
          </VStack>
        ))}
      </VStack>
    </Detalhe>
  );
}
