/**
 * Cadastro do catálogo de skills.
 *
 * A taxonomia era constante no código: dava para ler, não para manter — e ela
 * muda junto com a tecnologia do time. O que é editado aqui vale na matriz de
 * skills, no editor de cargo e no PDI.
 *
 * Três decisões que importam mais do que parecem:
 *
 *  - **O código é gerado, não digitado.** Ele é a chave que liga skill a
 *    cargo, a avaliação e a PDI. Deixar digitar produz, cedo ou tarde, dois
 *    códigos para a mesma skill — e aí a matriz quebra sem avisar ninguém.
 *  - **Skill exigida por algum cargo não é removida.** Apagar levaria junto a
 *    avaliação de todo mundo naquela competência, que é histórico de gente.
 *  - **Sem família marcada, vale para todas.** É como o núcleo comum deve se
 *    comportar; marcar é o que torna a skill específica de certas cadeiras.
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
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Banner } from '@astryxdesign/core/Banner';
import { Divider } from '@astryxdesign/core/Divider';
import { Plus, RotateCcw } from 'lucide-react';

import { Filtros, Stats } from '../../app/ui';
import { ListaDetalhe, Detalhe, Bloco, type LinhaEnxuta } from '../../app/ListaDetalhe';
import type { Familia } from '../../data/mock';
import {
  carregarSkills, salvarSkills, restaurarSkills, codigoSkill, skillValePara,
  carregarCargos, type Skill,
} from '../../data/cadastro';

const FAMILIAS: Familia[] = ['Desenvolvimento', 'Testes / QA', 'Produto', 'Liderança'];

interface LinhaSkill extends LinhaEnxuta { s: Skill }

export default function CadastroSkills() {
  const [lista, setLista] = useState<Skill[]>(carregarSkills);
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [nomeNovo, setNomeNovo] = useState('');
  const [catNova, setCatNova] = useState('');

  const cargos = carregarCargos();
  const gravar = (nova: Skill[]) => { setLista(nova); salvarSkills(nova); };
  const alterar = (codigo: string, patch: Partial<Skill>) =>
    gravar(lista.map((s) => (s.codigo === codigo ? { ...s, ...patch } : s)));

  /** Em quantos cargos a skill é exigida — é o que diz se dá para removê-la. */
  const usoEmCargos = (codigo: string) =>
    cargos.filter((c) => c.skills.some((s) => s.codigo === codigo)).length;

  const criar = () => {
    const nome = nomeNovo.trim();
    const cat = catNova.trim();
    if (!nome || !cat) return;
    gravar([...lista, {
      codigo: codigoSkill(cat, nome, lista.map((s) => s.codigo)),
      nome, categoria: cat,
    }]);
    setNomeNovo('');
  };

  const removerSkill = (codigo: string) => {
    if (usoEmCargos(codigo) > 0) return;
    gravar(lista.filter((s) => s.codigo !== codigo));
  };

  const categorias = [...new Set(lista.map((s) => s.categoria))].sort();
  const visiveis = lista.filter((s) =>
    (!categoria || s.categoria === categoria)
    && (!busca
      || s.nome.toLowerCase().includes(busca.toLowerCase())
      || s.codigo.includes(busca.toLowerCase())));

  const linhas: LinhaSkill[] = visiveis.map((s) => ({
    id: s.codigo,
    titulo: s.nome,
    dot: s.critica ? 'error' : s.estrategica ? 'warning' : 'neutral',
    dotLabel: s.critica ? 'Crítica — conta para bus factor'
      : s.estrategica ? 'Estratégica' : 'Padrão',
    marcadores: [
      { texto: s.categoria, cor: 'blue' as const },
      s.familias?.length
        ? { texto: s.familias.join(' · '), cor: 'purple' as const }
        : { texto: 'todas as cadeiras', cor: 'gray' as const },
    ],
    s,
  }));

  return (
    <VStack gap={3}>
      <Stats itens={[
        { valor: lista.length, rotulo: 'skills' },
        { valor: categorias.length, rotulo: 'categorias' },
        { valor: lista.filter((s) => s.estrategica).length, rotulo: 'estratégicas' },
        { valor: lista.filter((s) => s.critica).length, rotulo: 'críticas',
          cor: lista.some((s) => s.critica) ? 'orange' : undefined },
      ]} />

      <Card padding={4}>
        <VStack gap={2}>
          <Heading level={3}>Adicionar skill</Heading>
          <HStack gap={2} wrap="wrap" vAlign="end">
            <Selector label="Categoria" value={catNova} onChange={(v) => setCatNova(v ?? '')}
                      placeholder="escolha uma"
                      options={categorias.map((c) => ({ value: c, label: c }))} />
            <TextInput label="Nova categoria" value={catNova} onChange={setCatNova}
                       placeholder="ou digite uma nova" />
            <TextInput label="Nome da skill" value={nomeNovo} onChange={setNomeNovo}
                       placeholder="ex.: Playwright" onEnter={criar} />
            <Button icon={<Plus size={14} />} label="Adicionar" variant="primary"
                    onClick={criar} isDisabled={!nomeNovo.trim() || !catNova.trim()} />
          </HStack>
          <Text type="supporting">
            O código é gerado da categoria e do nome. A skill nasce valendo para todas as
            cadeiras — restrinja no detalhe se ela for de uma família só.
          </Text>
        </VStack>
      </Card>

      <Filtros resultado={`${visiveis.length} de ${lista.length}`}>
        <TextInput label="Buscar" size="sm" placeholder="nome ou código"
                   value={busca} onChange={setBusca} />
        <Selector label="Categoria" size="sm" variant="ghost" placeholder="Todas as categorias"
                  value={categoria} onChange={(v) => setCategoria(v ?? '')} hasClear
                  options={categorias.map((c) => ({
                    value: c,
                    label: `${c} (${lista.filter((s) => s.categoria === c).length})`,
                  }))} />
        <Button icon={<RotateCcw size={14} />} size="sm" variant="ghost" label="Restaurar padrão"
                onClick={() => gravar(restaurarSkills())} />
      </Filtros>

      <Card padding={0}>
        <ListaDetalhe
          itens={linhas}
          larguraPainel={460}
          vazio="Nenhuma skill com esses filtros."
          detalhe={(l) => (
            <EditorSkill s={l.s} categorias={categorias} emCargos={usoEmCargos(l.s.codigo)}
                         alterar={alterar} remover={removerSkill} />
          )}
        />
      </Card>
    </VStack>
  );
}

function EditorSkill({ s, categorias, emCargos, alterar, remover }: {
  s: Skill; categorias: string[]; emCargos: number;
  alterar: (codigo: string, patch: Partial<Skill>) => void;
  remover: (codigo: string) => void;
}) {
  const set = (patch: Partial<Skill>) => alterar(s.codigo, patch);

  const alternarFamilia = (f: Familia) => {
    const atuais = s.familias ?? [];
    const nova = atuais.includes(f) ? atuais.filter((x) => x !== f) : [...atuais, f];
    // Lista vazia e ausente significam a mesma coisa: vale para todas. Gravar
    // `[]` deixaria a skill invisível em qualquer cargo — não é o que
    // desmarcar a última família deveria fazer.
    set({ familias: nova.length ? nova : undefined });
  };

  return (
    <Detalhe
      titulo={s.nome}
      marcadores={
        <>
          <Token size="sm" color="blue" label={s.categoria} />
          <Token size="sm" color="gray" label={s.codigo} />
        </>
      }
    >
      <VStack gap={2}>
        <TextInput label="Nome" value={s.nome} onChange={(v) => set({ nome: v })} />
        <Selector label="Categoria" value={s.categoria}
                  onChange={(v) => set({ categoria: v ?? s.categoria })}
                  options={categorias.map((c) => ({ value: c, label: c }))} />
        <TextInput label="Descrição (opcional)" value={s.descricao ?? ''}
                   onChange={(v) => set({ descricao: v || undefined })}
                   placeholder="o que conta como domínio desta skill" />

        <Divider />

        <Bloco rotulo="Cadeiras em que se aplica">
          <Text type="supporting">
            Nenhuma marcada = vale para todas, que é o caso do núcleo comum. Marcar
            restringe: a skill só é oferecida ao montar cargos dessas famílias, e
            para de gerar linha morta na matriz das outras.
          </Text>
        </Bloco>
        <HStack gap={1} wrap="wrap">
          {FAMILIAS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={skillValePara(s, f) ? 'secondary' : 'ghost'}
              label={f}
              onClick={() => alternarFamilia(f)}
            />
          ))}
        </HStack>

        <Divider />

        <VStack gap={2}>
          <Switch label="Estratégica" value={!!s.estrategica}
                  onChange={(v) => set({ estrategica: v || undefined })} />
          <Text type="supporting">Entra no termômetro dos temas que você cobra.</Text>
          <Switch label="Crítica" value={!!s.critica}
                  onChange={(v) => set({ critica: v || undefined })} />
          <Text type="supporting">
            Conta para o bus factor: skill crítica com uma só pessoa em nível ≥ 3 vira alerta.
          </Text>
        </VStack>

        <Divider />

        {emCargos > 0 ? (
          <Banner
            status="info"
            title={`Exigida em ${emCargos} ${emCargos === 1 ? 'cargo' : 'cargos'}`}
            description="Não dá para remover enquanto algum cargo a exige — apagar levaria
                         junto a avaliação de todo mundo nesta competência. Tire dos cargos
                         antes, se for mesmo o caso."
          />
        ) : (
          <Button size="sm" variant="ghost" label="Remover do catálogo"
                  onClick={() => remover(s.codigo)} />
        )}
      </VStack>
    </Detalhe>
  );
}
