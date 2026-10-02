/**
 * Ciclos de AVD — cadastro.
 *
 * A AVD não é anual nem tem drivers fixos: o ciclo 2026/2 tem 14 drivers e a
 * escala 1–4; o próximo semestre pode mudar os dois. Deixar isso em constante
 * significava reescrever código a cada ciclo e, pior, perder a comparação —
 * a nota 3,5 de um ciclo não quer dizer o mesmo que a de outro se a escala
 * mudou. Por isso escala, faixas e drivers são DADOS DO CICLO.
 *
 * As perguntas abertas também moram aqui. Elas chegam prontas da portal de avaliação e
 * variam a cada ciclo; o que o sistema faz é gerar o insumo para respondê-las
 * com evidência, nunca inventar a resposta.
 */

import type { Cor } from '../app/ui';
import { ler, lerJSON, escreverJSON, escrever, remover } from './armazenamento';

export type StatusCiclo = 'planejado' | 'coleta' | 'calibragem' | 'fechado';

export interface PerguntaAberta {
  id: string;
  /** O texto exatamente como está na portal de avaliação — é o que você vai responder lá. */
  texto: string;
  /** Quem responde: você sobre o liderado, ou o liderado sobre si. */
  alvo: 'lider' | 'autoavaliacao';
  /** Limite de caracteres do campo na portal de avaliação, quando houver. */
  limite?: number;
  /** De onde o sistema deve puxar insumo para propor a resposta. */
  fontes: FonteInsumo[];
}

export type FonteInsumo =
  | 'evidencias' | 'registros_1a1' | 'feedbacks' | 'compromissos'
  | 'skills' | 'trilha' | 'pdi' | 'trajetoria';

export const ROTULO_FONTE: Record<FonteInsumo, string> = {
  evidencias: 'Evidências rastreáveis',
  registros_1a1: 'Registros de 1:1',
  feedbacks: 'Banco de feedbacks',
  compromissos: 'Compromissos e encaminhamentos',
  skills: 'Matriz de skills',
  trilha: 'Trilha QA → Dev',
  pdi: 'PDI',
  trajetoria: 'Trajetória das avaliações mensais',
};

export interface Faixa { rotulo: string; min: number; max: number; cor: Cor }

export interface Ciclo {
  id: string;
  nome: string;
  status: StatusCiclo;
  /** Janela da avaliação. A data de corte é o que define elegibilidade. */
  inicio: string;
  fim: string;
  dataCorte: string;
  /** Meses mínimos de casa na data de corte para ser elegível. */
  mesesMinimos: number;
  escalaMin: number;
  escalaMax: number;
  /** Rótulo de cada degrau da escala, do mínimo ao máximo. */
  rotulosEscala: string[];
  faixas: Faixa[];
  driversComportamento: string[];
  driversDesempenho: string[];
  perguntas: PerguntaAberta[];
  /**
   * Quando o ciclo foi encerrado. Preenchido só no status `fechado`.
   *
   * Encerrar não apaga nem arquiva: o ciclo continua inteiro no sistema, com
   * notas, justificativas e defesas, e passa a ser somente leitura. É o que
   * sustenta a trajetória — comparar 2026 com 2027 exige que 2026 continue
   * exatamente como estava quando você o defendeu na mesa.
   */
  encerradoEm?: string;
}

const FAIXAS_PADRAO: Faixa[] = [
  { rotulo: 'Baixo', min: 1.0, max: 2.4, cor: 'red' },
  { rotulo: 'Médio', min: 2.5, max: 3.5, cor: 'orange' },
  { rotulo: 'Alto', min: 3.6, max: 4.0, cor: 'green' },
];

const COMPORTAMENTO = [
  'Entrega do extraordinário', 'Foco no cliente', 'Resultado', 'Respeito',
  'Trabalho em equipe', 'Mentalidade de crescimento', 'Autonomia com responsabilidade',
  'Ambiente seguro e transparente',
];

const DESEMPENHO = [
  'Domínio técnico aplicado', 'Qualidade e impacto da entrega', 'Contribuição técnica',
  'Gestão da execução', 'Diagnóstico e solução', 'Clareza e alinhamento',
];

export const CICLOS_SEED: Ciclo[] = [
  {
    id: 'ciclo-atual',
    nome: 'Ciclo atual',
    status: 'calibragem',
    inicio: '2026-07-01', fim: '2026-12-31', dataCorte: '2026-10-31',
    mesesMinimos: 6,
    escalaMin: 1, escalaMax: 4,
    rotulosEscala: ['Nunca', 'Raramente', 'Frequentemente', 'Sempre'],
    faixas: FAIXAS_PADRAO,
    driversComportamento: COMPORTAMENTO,
    driversDesempenho: DESEMPENHO,
    perguntas: [
      { id: 'p1', alvo: 'lider', limite: 2000,
        texto: 'Quais foram os principais pontos fortes demonstrados no período?',
        fontes: ['evidencias', 'feedbacks', 'trajetoria'] },
      { id: 'p2', alvo: 'lider', limite: 2000,
        texto: 'Quais são os pontos de desenvolvimento e como serão trabalhados?',
        fontes: ['evidencias', 'skills', 'pdi', 'registros_1a1'] },
    ],
  },
  {
    // O ciclo seguinte já existe como planejamento: é o que permite acumular
    // evidência com destino desde já, em vez de garimpar em cima da hora.
    id: 'ciclo-proximo',
    nome: 'Próximo ciclo',
    status: 'planejado',
    inicio: '2027-01-01', fim: '2027-06-30', dataCorte: '2027-04-30',
    mesesMinimos: 6,
    escalaMin: 1, escalaMax: 4,
    rotulosEscala: ['Nunca', 'Raramente', 'Frequentemente', 'Sempre'],
    faixas: FAIXAS_PADRAO,
    driversComportamento: COMPORTAMENTO,
    driversDesempenho: DESEMPENHO,
    perguntas: [],
  },
];

const CHAVE = 'ciclos';

export function carregarCiclos(): Ciclo[] {
  return lerJSON<Ciclo[]>(CHAVE, [...CICLOS_SEED]);
}

export function salvarCiclos(lista: Ciclo[]): void {
  escreverJSON(CHAVE, lista);
}

export function restaurarCiclos(): Ciclo[] {
  remover(CHAVE);
  return [...CICLOS_SEED];
}

/** O ciclo que está valendo agora — o que o módulo Ciclo deve abrir. */
export function cicloVigente(lista = carregarCiclos()): Ciclo {
  return lista.find((c) => c.status === 'coleta' || c.status === 'calibragem')
      ?? lista.find((c) => c.status === 'planejado')
      ?? lista[0];
}

/* ---------- ciclo selecionado, compartilhado pelo módulo ---------- */

const CHAVE_SEL = 'cicloSelecionado';

/**
 * Qual ciclo o módulo inteiro está olhando.
 *
 * Fica fora do React de propósito: AVD, Calibragem, Relatórios e Radar são
 * rotas separadas com `lazy`, e um estado local por tela significaria trocar o
 * ciclo quatro vezes — ou pior, olhar a calibragem de 2026 achando que é a de
 * 2027. Uma fonte só, e todas as telas concordam.
 */
export function cicloSelecionado(lista = carregarCiclos()): Ciclo {
  const id = ler(CHAVE_SEL);
  return lista.find((c) => c.id === id) ?? cicloVigente(lista);
}

export function selecionarCiclo(id: string): void {
  escrever(CHAVE_SEL, id);
}

/** Ciclo encerrado é histórico: nenhuma tela do módulo deve deixar editar. */
export const somenteLeitura = (c: Ciclo) => c.status === 'fechado';

export function encerrarCiclo(id: string, lista = carregarCiclos()): Ciclo[] {
  const nova = lista.map((c) => (c.id === id
    ? { ...c, status: 'fechado' as StatusCiclo, encerradoEm: new Date().toISOString().slice(0, 10) }
    : c));
  salvarCiclos(nova);
  return nova;
}

/**
 * Reabrir existe, mas é ação consciente e datada.
 *
 * Sem ela, um encerramento por engano no meio da calibragem travaria o ciclo
 * inteiro. Com ela solta e sem aviso, "encerrado" não significaria nada — por
 * isso a tela pede confirmação e registra que foi reaberto.
 */
export function reabrirCiclo(id: string, lista = carregarCiclos()): Ciclo[] {
  const nova = lista.map((c) => (c.id === id
    ? { ...c, status: 'calibragem' as StatusCiclo, encerradoEm: undefined }
    : c));
  salvarCiclos(nova);
  return nova;
}

export function cicloNovo(nome: string, modelo: Ciclo): Ciclo {
  const ano = new Date().getFullYear() + 1;
  return {
    ...modelo,
    id: `avd-${ano}-${Math.random().toString(36).slice(2, 6)}`,
    nome,
    status: 'planejado',
    inicio: `${ano}-01-01`, fim: `${ano}-06-30`, dataCorte: `${ano}-04-30`,
    // Perguntas NÃO são herdadas: elas mudam a cada ciclo e copiá-las daria
    // a falsa impressão de que já foram conferidas contra a portal de avaliação.
    perguntas: [],
  };
}

export const STATUS_CICLO: { valor: StatusCiclo; rotulo: string; descricao: string; cor: Cor }[] = [
  { valor: 'planejado', rotulo: 'Planejado', cor: 'gray',
    descricao: 'Janela definida, ainda sem avaliação lançada. Serve para acumular evidência com destino' },
  { valor: 'coleta', rotulo: 'Em coleta', cor: 'blue',
    descricao: 'Notas e justificativas sendo preenchidas' },
  { valor: 'calibragem', rotulo: 'Em calibragem', cor: 'orange',
    descricao: 'Mesa em andamento — nenhuma 1:1 pode citar mérito, promoção ou próximo nível' },
  { valor: 'fechado', rotulo: 'Fechado', cor: 'green',
    descricao: 'Ciclo encerrado. As notas viram histórico e entram na trajetória' },
];

/** Faixa em que a nota cai, segundo as faixas DO CICLO — não de uma constante. */
export function faixaDe(ciclo: Ciclo, nota: number): Faixa | undefined {
  return ciclo.faixas.find((f) => nota >= f.min && nota <= f.max);
}
