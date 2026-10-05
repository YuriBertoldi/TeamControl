/**
 * Lançamentos — planilha e entrada manual.
 *
 * Skills, PDI e trilha existiam como tela e não tinham caminho de entrada
 * nenhum: as matrizes abriam vazias e não havia onde digitar. Aqui estão os
 * dois caminhos, e eles servem a momentos diferentes.
 *
 * **Planilha** para o volume: 22 pessoas × 20 skills são 440 células, e ninguém
 * preenche isso num formulário. Também é o único jeito de pedir autoavaliação
 * sem dar acesso ao sistema para o liderado.
 *
 * **Manual em lote** para o uso do dia a dia: você acabou de sair de uma 1:1 e
 * quer corrigir três níveis. Abrir o Excel para isso é atrito que faz a matriz
 * envelhecer.
 *
 * A importação **mostra antes de gravar**. Um arquivo que entra direto e grava
 * 40 de 50 linhas devolvendo "ok" é pior que um que falha: as 10 ausentes só
 * aparecem quando alguém procura por elas, meses depois.
 */

import { useEffect, useMemo, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { HStack } from '@astryxdesign/core/HStack';
import { Card } from '@astryxdesign/core/Card';
import { Text } from '@astryxdesign/core/Text';
import { Heading } from '@astryxdesign/core/Heading';
import { Button } from '@astryxdesign/core/Button';
import { Token } from '@astryxdesign/core/Token';
import { Banner } from '@astryxdesign/core/Banner';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { FileInput } from '@astryxdesign/core/FileInput';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Divider } from '@astryxdesign/core/Divider';
import { List, ListItem } from '@astryxdesign/core/List';
import { Download, Upload, Check } from 'lucide-react';

import { Page } from '../../app/ui';
import { PESSOAS, souMeus } from '../../data/mock';
import { carregarSkills, skillsDisponiveis } from '../../data/cadastro';
import { baixar, lerArquivo } from '../../data/planilha';
import {
  MODELOS, modeloDe, gerarModelo, gerarModeloTrilha, lerSkills, lerTrilha,
  type TipoModelo, type LinhaSkill, type LinhaTrilha,
} from '../../data/modelos';
import { api, type AvaliacaoSkillAPI, type TrilhaAPI } from '../../lib/api';

type Aviso = { tipo: 'success' | 'error' | 'warning'; titulo: string; texto: string };

export default function Lancamentos() {
  const [aba, setAba] = useState('planilha');
  const [tipo, setTipo] = useState<TipoModelo>('skills');
  const [soPessoa, setSoPessoa] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [trilha, setTrilha] = useState<TrilhaAPI | null>(null);

  // Prévia do que o arquivo traz, antes de qualquer gravação.
  const [previaSkills, setPreviaSkills] = useState<LinhaSkill[] | null>(null);
  const [previaTrilha, setPreviaTrilha] = useState<LinhaTrilha[] | null>(null);
  const [problemas, setProblemas] = useState<string[]>([]);
  const [ignoradas, setIgnoradas] = useState(0);
  const [escolhido, setEscolhido] = useState<File[]>([]);

  useEffect(() => { void api.trilha().then(setTrilha); }, []);

  const m = modeloDe(tipo)!;

  const limparPrevia = () => {
    setPreviaSkills(null); setPreviaTrilha(null); setProblemas([]); setIgnoradas(0);
    setEscolhido([]);
  };

  const baixarModelo = () => {
    if (tipo === 'trilha') {
      if (!trilha || trilha.pessoas.length === 0) {
        setAviso({ tipo: 'warning', titulo: 'Sem QAs no cadastro',
          texto: 'A trilha vale para quem está na família Testes / QA. Cadastre o time primeiro.' });
        return;
      }
      baixar(m.arquivo, gerarModeloTrilha(trilha.niveis, trilha.pessoas));
    } else {
      baixar(soPessoa ? m.arquivo.replace('.csv', `-${soPessoa}.csv`) : m.arquivo,
             gerarModelo(tipo, soPessoa || undefined));
    }
    setAviso({ tipo: 'success', titulo: 'Modelo gerado',
      texto: `"${m.arquivo}" foi para a sua pasta de downloads, já com as linhas preenchidas. ` +
             'Abra no Excel, preencha e volte aqui para importar.' });
  };

  const conferir = async (arquivos: File[]) => {
    const f = arquivos[0];
    if (!f) return;
    limparPrevia();
    setOcupado(true);
    try {
      const texto = await lerArquivo(f);
      if (tipo === 'trilha') {
        const r = lerTrilha(texto);
        setPreviaTrilha(r.itens); setProblemas(r.problemas); setIgnoradas(r.ignoradas);
      } else if (tipo === 'skills' || tipo === 'autoavaliacao') {
        const r = lerSkills(texto, tipo === 'skills' ? 'coordenador' : 'autoavaliacao');
        setPreviaSkills(r.itens); setProblemas(r.problemas); setIgnoradas(r.ignoradas);
      } else {
        setAviso({ tipo: 'warning', titulo: 'Ainda não leio este modelo',
          texto: `O modelo de ${m.nome} já é gerado, mas a leitura de volta ainda não foi feita.` });
      }
    } catch (e) {
      setAviso({ tipo: 'error', titulo: 'Não consegui ler o arquivo', texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  };

  const gravar = async () => {
    setOcupado(true);
    setAviso(null);
    try {
      if (previaSkills) {
        const r = await api.lancarSkills(previaSkills as AvaliacaoSkillAPI[]);
        const recusas = r.recusas ?? [];
        setAviso({ tipo: recusas.length ? 'warning' : 'success',
          titulo: `${r.gravadas} avaliações gravadas`,
          texto: recusas.length ? `${recusas.length} recusadas: ${recusas.slice(0, 3).join(' · ')}`
                                : 'A matriz de skills já reflete isto.' });
      } else if (previaTrilha) {
        let ok = 0;
        const erros: string[] = [];
        for (const c of previaTrilha) {
          try { await api.marcarCriterio(c); ok++; }
          catch (e) { erros.push(`critério ${c.criterioId}: ${(e as Error).message}`); }
        }
        setTrilha(await api.trilha());
        setAviso({ tipo: erros.length ? 'warning' : 'success',
          titulo: `${ok} critérios marcados`,
          texto: erros.length ? erros.slice(0, 3).join(' · ') : 'A trilha já reflete isto.' });
      }
      limparPrevia();
    } catch (e) {
      setAviso({ tipo: 'error', titulo: 'Não consegui gravar', texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  };

  const total = (previaSkills?.length ?? 0) + (previaTrilha?.length ?? 0);

  return (
    <Page titulo="Lançamentos"
          subtitulo="Planilha para volume, formulário para o dia a dia."
          largura={1100}>
      {aviso && (
        <Banner status={aviso.tipo} title={aviso.titulo} description={aviso.texto} />
      )}

      <TabList value={aba} onChange={setAba} hasDivider>
        <Tab value="planilha" label="Por planilha" />
        <Tab value="manual" label="Lançamento manual" />
      </TabList>

      {aba === 'planilha' ? (
        <VStack gap={3}>
          <Card padding={4}>
            <VStack gap={2}>
              <Heading level={3}>1. Escolha o que lançar</Heading>
              <HStack gap={2} vAlign="end" wrap="wrap">
                <Selector label="Modelo" value={tipo}
                          onChange={(v) => { setTipo(v as TipoModelo); limparPrevia(); }}
                          options={MODELOS.map((x) => ({ value: x.tipo, label: x.nome,
                                                         description: x.descricao }))} />
                {(tipo === 'skills' || tipo === 'autoavaliacao' || tipo === 'dna') && (
                  <Selector label="Só uma pessoa" value={soPessoa} hasClear
                            onChange={(v) => setSoPessoa(v ?? '')}
                            options={[{ value: '', label: 'Time inteiro' },
                              ...souMeus().map((p) => ({ value: p.slug, label: p.nome }))]} />
                )}
              </HStack>
              <Text type="supporting">{m.descricao}</Text>
              {tipo === 'autoavaliacao' && (
                <Banner status="info" title="Gere um arquivo por pessoa"
                        description="A planilha do time inteiro exporia a leitura que você fez
                                     dos colegas dela. Use o filtro acima." />
              )}
            </VStack>
          </Card>

          <Card padding={4}>
            <VStack gap={2}>
              <Heading level={3}>2. Baixe o modelo já preenchido</Heading>
              <Text type="supporting">
                Colunas: {m.colunas.join(' · ')}
              </Text>
              <Text type="supporting">{m.comoUsar}</Text>
              <HStack gap={1}>
                <Button icon={<Download size={14} />} label="Baixar modelo"
                        onClick={baixarModelo} isDisabled={ocupado} />
              </HStack>
              <Text type="supporting">
                É CSV, não XLSX: o Excel abre e salva em um clique, e o arquivo continua
                legível em qualquer editor se a importação der errado. Ao salvar de volta,
                escolha "CSV UTF-8".
              </Text>
            </VStack>
          </Card>

          <Card padding={4}>
            <VStack gap={2}>
              <Heading level={3}>3. Devolva preenchido</Heading>
              <FileInput label="Arquivo preenchido" accept=".csv,text/csv"
                         value={escolhido}
                         onChange={(f) => {
                           const lista = Array.isArray(f) ? f : f ? [f] : [];
                           setEscolhido(lista);
                           void conferir(lista);
                         }} />

              {problemas.length > 0 && (
                <Banner status="warning"
                        title={`${problemas.length} linha(s) não entraram`}
                        description="Cada uma com o número da linha, para você achar no Excel." />
              )}
              {problemas.length > 0 && (
                <List>
                  {problemas.slice(0, 12).map((p) => (
                    <ListItem key={p} label={p} />
                  ))}
                </List>
              )}

              {total > 0 && (
                <>
                  <Divider />
                  <HStack gap={2} vAlign="center" wrap="wrap">
                    <Token size="sm" color="green" label={`${total} prontas para gravar`} />
                    {ignoradas > 0 && (
                      <Text type="supporting">
                        {ignoradas} linhas em branco ignoradas — normal, o modelo vem com todas
                        as combinações.
                      </Text>
                    )}
                  </HStack>
                  {previaSkills && <PreviaSkills itens={previaSkills} />}
                  {previaTrilha && (
                    <Text type="body">
                      {previaTrilha.length} critérios de trilha, todos com evidência.
                    </Text>
                  )}
                  <HStack gap={1}>
                    <Button icon={<Upload size={14} />} variant="primary"
                            label={`Gravar ${total}`} onClick={() => { void gravar(); }}
                            isDisabled={ocupado} />
                    <Button variant="ghost" label="Descartar" onClick={limparPrevia}
                            isDisabled={ocupado} />
                  </HStack>
                </>
              )}
            </VStack>
          </Card>
        </VStack>
      ) : (
        <ManualSkills ocupado={ocupado} setOcupado={setOcupado} setAviso={setAviso} />
      )}
    </Page>
  );
}

/** Resumo do que vai entrar, por pessoa — para conferir antes de gravar. */
function PreviaSkills({ itens }: { itens: LinhaSkill[] }) {
  const porPessoa = useMemo(() => {
    const m = new Map<string, number>();
    itens.forEach((i) => m.set(i.pessoa, (m.get(i.pessoa) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [itens]);

  return (
    <List>
      {porPessoa.map(([slug, n]) => (
        <ListItem
          key={slug}
          label={PESSOAS.find((p) => p.slug === slug)?.nome ?? slug}
          endContent={<Token size="sm" color="blue" label={`${n} skills`} />} />
      ))}
    </List>
  );
}

/**
 * Lançamento manual: uma pessoa, todas as skills da família dela.
 *
 * O caso de uso é sair de uma 1:1 e corrigir três níveis. Por isso é por
 * pessoa e não matriz inteira — matriz de 440 células numa tela é tão
 * impraticável quanto no Excel, e aqui não há a vantagem do teclado.
 */
function ManualSkills({ ocupado, setOcupado, setAviso }: {
  ocupado: boolean;
  setOcupado: (b: boolean) => void;
  setAviso: (a: Aviso | null) => void;
}) {
  const [slug, setSlug] = useState(souMeus()[0]?.slug ?? '');
  const [origem, setOrigem] = useState<'coordenador' | 'autoavaliacao'>('coordenador');
  const [valores, setValores] = useState<Record<string, string>>({});
  const [interesses, setInteresses] = useState<Record<string, string>>({});
  const [atuais, setAtuais] = useState<AvaliacaoSkillAPI[]>([]);

  const pessoa = PESSOAS.find((p) => p.slug === slug);

  useEffect(() => {
    void api.skills().then((l) => setAtuais(l ?? []));
  }, []);

  useEffect(() => { setValores({}); setInteresses({}); }, [slug, origem]);

  const skills = pessoa
    ? (skillsDisponiveis(pessoa.familia).length ? skillsDisponiveis(pessoa.familia) : carregarSkills())
    : [];

  const atualDe = (codigo: string) =>
    atuais.find((a) => a.pessoa === slug && a.skill === codigo && a.origem === origem);

  const preenchidas = Object.entries(valores).filter(([, v]) => v.trim() !== '');

  const gravar = async () => {
    setOcupado(true);
    setAviso(null);
    try {
      const lote: AvaliacaoSkillAPI[] = preenchidas.map(([codigo, v]) => ({
        pessoa: slug, skill: codigo,
        skillNome: skills.find((s) => s.codigo === codigo)?.nome ?? codigo,
        nivel: Number(v),
        interesse: interesses[codigo] ? Number(interesses[codigo]) : undefined,
        origem,
      }));
      const r = await api.lancarSkills(lote);
      setAtuais((await api.skills()) ?? []);
      setValores({}); setInteresses({});
      setAviso({ tipo: (r.recusas ?? []).length ? 'warning' : 'success',
        titulo: `${r.gravadas} avaliações gravadas`,
        texto: (r.recusas ?? []).slice(0, 3).join(' · ') ||
               'Lançar o mesmo nível de novo não é redundante: registra que você conferiu hoje.' });
    } catch (e) {
      setAviso({ tipo: 'error', titulo: 'Não consegui gravar', texto: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  };

  return (
    <VStack gap={3}>
      <Card padding={4}>
        <HStack gap={2} vAlign="end" wrap="wrap">
          <Selector label="Pessoa" value={slug} onChange={(v) => v && setSlug(v)} hasSearch
                    options={souMeus().map((p) => ({ value: p.slug, label: p.nome,
                                                     description: p.cargo }))} />
          <Selector label="Quem está avaliando" value={origem}
                    onChange={(v) => v && setOrigem(v as 'coordenador' | 'autoavaliacao')}
                    options={[
                      { value: 'coordenador', label: 'Eu (líder)' },
                      { value: 'autoavaliacao', label: 'A própria pessoa',
                        description: 'Conduzido na 1:1, com ela ao lado' },
                    ]} />
        </HStack>
      </Card>

      <Card padding={4}>
        <VStack gap={2}>
          <Text type="supporting">
            Escala 0–4 · 0 sem contato · 1 conhece · 2 executa · 3 domínio · 4 referência.
            Nível 3 exige ao menos uma evidência confirmada; nível 4 exige evidência de
            replicação — ensinar, não só fazer bem.
          </Text>
          <List>
            {skills.map((s) => {
              const a = atualDe(s.codigo);
              return (
                <ListItem
                  key={s.codigo}
                  label={s.nome}
                  description={
                    <HStack gap={1} wrap="wrap" vAlign="center">
                      <Text type="supporting">{s.categoria}</Text>
                      {s.estrategica && <Token size="sm" color="purple" label="estratégica" />}
                      {/* O nível de hoje fica à vista: sem ele, quem lança não
                          sabe se está confirmando ou mudando a leitura. */}
                      {a && <Token size="sm" color="gray"
                                   label={`hoje ${a.nivel}${a.avaliadoEm ? ` · ${a.avaliadoEm}` : ''}`} />}
                    </HStack>
                  }
                  endContent={
                    <HStack gap={1} vAlign="end" wrap="wrap">
                      <TextInput size="sm" label="Nível" placeholder={a ? String(a.nivel) : '0–4'}
                                 value={valores[s.codigo] ?? ''}
                                 onChange={(v) => setValores({ ...valores, [s.codigo]: v })} />
                      <TextInput size="sm" label="Interesse" placeholder="0–3"
                                 value={interesses[s.codigo] ?? ''}
                                 onChange={(v) => setInteresses({ ...interesses, [s.codigo]: v })} />
                    </HStack>
                  } />
              );
            })}
          </List>
          <Divider />
          <HStack gap={1} vAlign="center" wrap="wrap">
            <Button icon={<Check size={14} />} variant="primary"
                    label={`Gravar ${preenchidas.length} skill(s)`}
                    isDisabled={ocupado || preenchidas.length === 0}
                    onClick={() => { void gravar(); }} />
            <Text type="supporting">
              Em branco não mexe no que já está lá.
            </Text>
          </HStack>
        </VStack>
      </Card>
    </VStack>
  );
}
