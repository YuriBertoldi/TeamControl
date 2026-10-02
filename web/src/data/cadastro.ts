/**
 * Cadastro: pessoas e tribos editáveis.
 *
 * Pessoas e tribos eram constantes no código — dava para ler, não para
 * manter. Aqui elas viram estado persistido, com a mesma precedência da
 * configuração: o que você salva vence o seed.
 *
 * Nenhuma operação apaga alguém. Sair da gestão, afastar ou desligar são
 * mudanças de STATUS, porque 1:1s, evidências e histórico de AVD continuam
 * valendo depois — é o lastro que sustenta a calibragem do ciclo.
 */

import type { Pessoa, Familia } from './mock';
import { PESSOAS_SEED } from './pessoas';
import { TRIBOS_SEED, type Tribo } from './squads';
import { lerJSON, escreverJSON, remover } from './armazenamento';

const CHAVE_PESSOAS = 'pessoas';
const CHAVE_TRIBOS = 'tribos';

/* ---------- pessoas ---------- */

export function carregarPessoas(): Pessoa[] {
  return lerJSON<Pessoa[]>(CHAVE_PESSOAS, [...PESSOAS_SEED]);
}

export function salvarPessoas(lista: Pessoa[]): void {
  escreverJSON(CHAVE_PESSOAS, lista);
}

export function restaurarPessoas(): Pessoa[] {
  remover(CHAVE_PESSOAS);
  return [...PESSOAS_SEED];
}

/** Slug a partir do nome: estável, sem acento, sem colisão com o que já existe. */
export function slugDe(nome: string, existentes: string[]): string {
  const base = nome.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!existentes.includes(base)) return base;
  let n = 2;
  while (existentes.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function pessoaNova(nome: string, existentes: string[]): Pessoa {
  return {
    slug: slugDe(nome, existentes),
    nome,
    curto: nome.split(' ')[0],
    time: 'pf',
    familia: 'Desenvolvimento',
    cargo: 'Desenvolvedor Pleno',
    techLead: false,
    admissao: new Date().toISOString().slice(0, 10),
    status: 'ativo',
    elegivel: false,
    motivoInelegivel: 'Menos de 6 meses de casa',
    trajetoria: [],
    quadrante: null,
    ultima1a1: new Date().toISOString().slice(0, 10),
    cadenciaDias: 60,
  };
}

export const STATUS_PESSOA = [
  { valor: 'ativo', rotulo: 'Ativo',
    descricao: 'Sob sua gestão, aparece em todas as visões' },
  { valor: 'afastado', rotulo: 'Afastado',
    descricao: 'Licença médica ou outro afastamento legal — não penaliza a avaliação' },
  { valor: 'fora_gestao', rotulo: 'Fora da gestão',
    descricao: 'Mudou de liderança. Some das visões ativas, histórico preservado' },
  { valor: 'desligado', rotulo: 'Desligado',
    descricao: 'Saiu da empresa. Histórico preservado para o ciclo em andamento' },
] as const;

/* ---------- cargos ---------- */

/**
 * Cargo com as skills esperadas da cadeira.
 *
 * Sem isso a matriz avaliava todo mundo em tudo: QA aparecia com 0 em
 * Delphi/VCL e dev com 0 em Robot Framework, e os dois "gaps" eram ruído.
 * O gap que vale é contra o `nivelEsperado` do próprio cargo.
 */
export interface SkillDoCargo {
  codigo: string;
  /** 0–4, mesma escala Dreyfus adaptada da matriz. */
  nivelEsperado: number;
}

export interface Cargo {
  id: string;
  nome: string;
  familia: Familia;
  skills: SkillDoCargo[];
}

const CHAVE_CARGOS = 'cargos';

const s = (codigo: string, nivelEsperado: number): SkillDoCargo => ({ codigo, nivelEsperado });

/** Núcleo comum a qualquer cadeira de engenharia, independente da família. */
const BASE_ENG: SkillDoCargo[] = [s('dados.sql', 2), s('ia.claudecode', 2), s('eng.causaraiz', 2)];

const DEV: SkillDoCargo[] = [
  ...BASE_ENG, s('delphi.vcl', 3), s('delphi.btrieve', 2), s('dados.tuning', 2),
  s('go.idiomatico', 2), s('go.api', 2), s('plat.cicd', 2), s('eng.arquitetura', 2),
];

const QA: SkillDoCargo[] = [
  ...BASE_ENG, s('qa.cenarios', 3), s('qa.robot', 2), s('qa.python', 2),
  s('plat.cicd', 2), s('ia.skills', 1),
];

/**
 * Ajusta o esperado de todo o conjunto, preso entre 1 e 4.
 *
 * O piso em 1 não é detalhe: nível 0 é "sem contato", e exigir contato zero
 * não é expectativa nenhuma. Sem o piso, o júnior de QA ficava com alvo 0 em
 * Autoria de skills — e a matriz marcava como atingido quem nunca tinha
 * encostado no assunto.
 */
const senioriza = (base: SkillDoCargo[], delta: number, extras: SkillDoCargo[] = []) =>
  [...base.map((x) => s(x.codigo, Math.min(4, Math.max(1, x.nivelEsperado + delta)))), ...extras];

export const CARGOS_SEED: Cargo[] = [
  { id: 'dev-jr', nome: 'Desenvolvedor Júnior', familia: 'Desenvolvimento',
    skills: senioriza(DEV, -1) },
  { id: 'dev-pl', nome: 'Desenvolvedor Pleno', familia: 'Desenvolvimento', skills: DEV },
  { id: 'dev-pl-f', nome: 'Desenvolvedora Plena', familia: 'Desenvolvimento', skills: DEV },
  { id: 'dev-sr', nome: 'Desenvolvedor Sênior', familia: 'Desenvolvimento',
    skills: senioriza(DEV, 1, [s('lid.mentoria', 3), s('lid.estimativa', 3)]) },
  { id: 'qa-jr', nome: 'Analista de Testes Júnior', familia: 'Testes / QA',
    skills: senioriza(QA, -1) },
  { id: 'qa-pl', nome: 'Analista de Testes Pleno', familia: 'Testes / QA', skills: QA },
  { id: 'qa-esp', nome: 'Analista de Testes Especialista', familia: 'Testes / QA',
    skills: senioriza(QA, 1, [s('lid.mentoria', 3), s('eng.arquitetura', 2)]) },
  // Tech Lead é atributo da pessoa, não cargo — mas a cadeira cobra skills
  // próprias, e é onde a sucessão de TL é medida.
  { id: 'tech-lead', nome: 'Tech Lead', familia: 'Liderança',
    skills: [...senioriza(DEV, 1), s('lid.mentoria', 3), s('lid.estimativa', 3)] },
];

export function carregarCargos(): Cargo[] {
  return lerJSON<Cargo[]>(CHAVE_CARGOS, [...CARGOS_SEED]);
}

export function salvarCargos(lista: Cargo[]): void {
  escreverJSON(CHAVE_CARGOS, lista);
}

export function restaurarCargos(): Cargo[] {
  remover(CHAVE_CARGOS);
  return [...CARGOS_SEED];
}

export function cargoNovo(nome: string, familia: Familia): Cargo {
  const modelo = CARGOS_SEED.find((c) => c.familia === familia);
  return {
    id: slugDe(nome, CARGOS_SEED.map((c) => c.id)),
    nome,
    familia,
    // Nasce com o esperado da família: cargo sem skill nenhuma não avalia
    // ninguém, e preencher 12 linhas na mão é o que faz o cadastro morrer.
    skills: modelo ? [...modelo.skills] : [],
  };
}

/** Skills esperadas da cadeira da pessoa — o que a matriz deve mostrar. */
export function skillsDoCargo(cargo: string, techLead = false): SkillDoCargo[] {
  const lista = carregarCargos();
  if (techLead) {
    const tl = lista.find((c) => c.nome === 'Tech Lead');
    if (tl) return tl.skills;
  }
  return lista.find((c) => c.nome === cargo)?.skills ?? [];
}

/* ---------- tribos ---------- */

export function carregarTribos(): Tribo[] {
  return lerJSON<Tribo[]>(CHAVE_TRIBOS, [...TRIBOS_SEED]);
}

export function salvarTribos(lista: Tribo[]): void {
  escreverJSON(CHAVE_TRIBOS, lista);
}

export function restaurarTribos(): Tribo[] {
  remover(CHAVE_TRIBOS);
  return [...TRIBOS_SEED];
}
