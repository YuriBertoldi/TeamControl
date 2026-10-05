/**
 * TeamControl — dados mocados do protótipo (Fase 0).
 *
 * REGRA: dados REAIS, extraídos de C:\Users\coordenacao\Desktop\registros-demo
 * (registros-1-1/2026-09-22_diego-nunes.md, AVD-2026/Dossies/00-INDICE.md,
 * AVD-2026/Rascunhos/00-LEIA-ME.md). Nada de placeholder — estas telas só se
 * provam contra a bagunça real.
 *
 * A forma de cada tipo espelha o schema planejado: campo que a tela usar e não
 * existir aqui é campo que falta na migration.
 */

import { carregarPessoas, carregarTribos } from './cadastro';

/**
 * A data de hoje, em ISO local.
 *
 * Era uma constante fixa, de quando a tela ainda era protótipo. Com dado real
 * isso vira defeito que piora sozinho: "última 1:1 há 9 dias" quando são 13, e
 * a diferença cresce um dia por dia. Pior, é silencioso — o número continua
 * parecendo certo, e quem decide a quem ligar primeiro decide pelo número.
 *
 * Montada a partir dos componentes LOCAIS, não de `toISOString()`: este é um
 * sistema de 1:1 operado no Brasil (UTC-3), e o ISO em UTC vira o dia seguinte
 * às 21h — a cadência de todo mundo pularia um dia ao fim da tarde.
 */
export const HOJE = (() => {
  const d = new Date();
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`;
})();

export type Confidencialidade = 1 | 2 | 3 | 4;
export type Prioridade = 'alta' | 'media' | 'baixa' | 'escuta';

export type OrigemAssunto =
  | 'regra_compromisso'
  | 'regra_recorrencia'
  | 'regra_bus_factor'
  | 'regra_ausencia'
  | 'ia_longitudinal'
  | 'trava_equilibrio';

/** Família do cargo — define a cor da pessoa no sistema inteiro. */
export type Familia = 'Desenvolvimento' | 'Testes / QA' | 'Produto' | 'Liderança';

/** Nível dentro da família — define a intensidade. */
export type Nivel = 'Júnior' | 'Pleno' | 'Sênior' | 'Especialista' | 'Tech Lead';

export interface Pessoa {
  slug: string;
  nome: string;
  curto: string;
  /** id da tribo. É string e não união fechada porque tribo é cadastro. */
  time: string;
  familia: Familia;
  cargo: string;
  techLead: boolean;
  admissao: string;
  /** 'fora_gestao' preserva o histórico de quem saiu da sua gestão. */
  status: 'ativo' | 'afastado' | 'desligado' | 'fora_gestao';
  /**
   * Afastamento legal: o motivo é dado sensível (nível restrito_saude) e o
   * retorno previsto é o que tira a pessoa do cálculo de cadência sem
   * transformá-la em alerta vermelho todo dia.
   */
  motivoAfastamento?: string;
  retornoPrevisto?: string;
  /**
   * Remuneração — confidencialidade 3 (privado do coordenador).
   *
   * Nunca sai em relatório, export ou pacote para IA: numa mesa de calibragem
   * salário não é argumento de desempenho, e nos próprios registros de 1:1 o
   * tema já aparece sempre como "mantido apenas no privado". O sistema só
   * reproduz a regra que você já pratica.
   *
   * O dado de gestão que importa não é o valor isolado e sim há quanto tempo
   * ele não muda — por isso a data do último reajuste anda junto.
   */
  salario?: number;
  ultimoReajuste?: string;
  /** Faixa/nível salarial da cadeira, quando existir. */
  faixaSalarial?: string;
  /** Só para Testes/QA: a qual coordenação a pessoa responde. */
  qaDe?: 'dev' | 'produto';
  elegivel: boolean;
  motivoInelegivel?: string;
  trajetoria: ('S' | 'E' | 'PM' | 'af')[];
  quadrante: string | null;
  ultima1a1: string;
  cadenciaDias: number | null;
}

/** Nível derivado: Tech Lead vence a senioridade do cargo. */
export function nivelDe(p: Pessoa): Nivel {
  if (p.techLead) return 'Tech Lead';
  if (p.cargo.includes('Júnior')) return 'Júnior';
  if (p.cargo.includes('Sênior')) return 'Sênior';
  if (p.cargo.includes('Especialista')) return 'Especialista';
  return 'Pleno';
}

/** Até 120 dias de casa a pessoa é "nova" — muda como você conduz a 1:1. */
export const ehNovo = (p: Pessoa, hoje = HOJE) =>
  diasEntre(p.admissao, hoje) <= 120;

export interface Compromisso {
  id: number;
  pessoa: string;
  responsavel: 'coordenador' | 'liderado' | 'terceiro';
  nomeResp: string;
  descricao: string;
  prazoTexto: string;
  prazoDate: string | null;
  status: 'aberto' | 'em_andamento' | 'concluido';
  origemMeeting: string;
  herdado: number;
  prazoVago?: boolean;
  notaHerdado?: string;
}

export interface Assunto {
  id: string;
  prioridade: Prioridade;
  minutos: number;
  categoria: string;
  origem: OrigemAssunto;
  titulo: string;
  porQueAgora: string;
  refs: string[];
  pergunta: string;
  porQueAssim: string;
  toca: string[];
  conf?: Confidencialidade;
  avisoConf?: string;
  herdado?: boolean;
}

export interface Time { nome: string; portalId: string; produto: string }

/**
 * TIMES é derivado das tribos cadastradas, não constante.
 *
 * Era um objeto literal com `pf` e `qd` fixos; virou leitura do cadastro
 * porque criar uma tribo nova não pode exigir recompilar. O acesso é sempre
 * por `timeDe()`: id desconhecido devolve um rótulo honesto em vez de quebrar
 * a tela com `undefined.nome`.
 */
export const TIMES: Record<string, Time> = Object.fromEntries(
  carregarTribos().map((t) => [
    t.id, { nome: t.nome, portalId: t.portalId, produto: t.produto },
  ]));

export const timeDe = (id: string): Time =>
  TIMES[id] ?? { nome: 'Sem tribo', portalId: '—', produto: '—' };


/**
 * As pessoas sob a sua liderança. Vazio até você cadastrar a primeira.
 * A lista é cadastrável na tela de Pessoas — isto é só o estado inicial.
 */
export const PESSOAS: Pessoa[] = carregarPessoas();

/**
 * Pessoa pelo slug, ou `undefined`.
 *
 * Tinha um `!` no fim, que afirmava ao compilador que a pessoa sempre existe.
 * Não existe: slug de uma base antiga, pessoa removida do cadastro, rota
 * digitada à mão. O `!` não evitou nada disso — só escondeu, e a tela quebrou
 * em branco. Devolver `undefined` faz o compilador cobrar o caso em cada
 * chamada, que é onde a decisão certa muda conforme a tela.
 */
export const porSlug = (s: string) => PESSOAS.find((p) => p.slug === s);

/** Só quem está sob a sua gestão hoje — exclui desligado e fora_gestao. */
export const souMeus = () => PESSOAS.filter((p) => p.status === 'ativo' || p.status === 'afastado');

/**
 * Compromissos assumidos nas conversas.
 *
 * Vazio: o sistema sobe sem dado nenhum. Isto se popula pela importação dos
 * registros ou pela curadoria do pós-1:1, que é onde o prazo textual
 * ("próximas semanas") vira data computável.
 */
export const COMPROMISSOS: Compromisso[] = [];

export const PROXIMA_CONVERSA: Record<string, { dataOrigem: string; itens: string[] }> = {};

export const TEMAS: Record<string, {
  recorrentes: { tema: string; ocorrencias: number; janela: number; nota: string; refs: string[] }[];
  ausentes: { tema: string; conversasSem: number; ultimo: string | null; nota?: string }[];
}> = {};

export const SKILLS_GAP: Record<string, {
  skill: string; lider: number; auto: number; alvo: number;
  novo?: boolean; gapConversado?: boolean; busFactor?: number;
}[]> = {};

export const NOVIDADES: Record<string, {
  tipo: 'cruzado' | 'entrega' | 'alerta'; data: string; conf: Confidencialidade;
  texto: string; origem?: string; ref?: string;
}[]> = {};

export const DNA: Record<string, {
  ancoraPrimaria: string; ancoraSecundaria: string; ancoraRejeitada: string;
  aspiracao: string; prefFeedback: string; prefReconhecimento: string;
  atualizadoEm: string;
  motivadoresTop3: { nome: string; atendimento: 'atendido' | 'parcial' | 'nao' }[];
  sinaisNaoCurados: { texto: string; data: string; ref: string }[];
}> = {};

export const NAO_FALAR: Record<string, {
  cicloVigente: string;
  itens: { texto: string; conf: Confidencialidade; motivo: string }[];
  omitidosNivel4: number;
}> = {};

export const PAUTA: Record<string, Assunto[]> = {};

/* ---------- helpers ---------- */

export function diasEntre(a: string, b: string): number {
  return Math.round((+new Date(b) - +new Date(a)) / 86400000);
}

/**
 * Dias desde uma data, ou `null` quando não há data registrada.
 *
 * Existe porque "não tem data" é um estado real e frequente: pessoa recém
 * trazida para a coordenação ainda sem admissão preenchida, liderado que
 * nunca teve 1:1 registrada. Jogando isso em `diasEntre` sai `NaN`, que a
 * tela imprimia como **"NaNd"** e "NaN anos de casa".
 *
 * Pior que o texto feio: `NaN > limite` é `false`, então quem nunca teve 1:1
 * aparecia como **"Em dia"** — exatamente o contrário do que o coordenador
 * precisa ver. Devolver `null` obriga quem chama a decidir o que fazer, e o
 * compilador cobra.
 */
export function diasDesde(data: string, hoje = HOJE): number | null {
  if (!data) return null;
  const n = diasEntre(data, hoje);
  return Number.isFinite(n) ? n : null;
}

/** Como "sem registro" aparece na tela. Um traço, nunca um número inventado. */
export const SEM_REGISTRO = '—';

/** Valor em reais. Usado só em superfícies de confidencialidade 3. */
export const moeda = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL',
                              minimumFractionDigits: 0, maximumFractionDigits: 0 });

/** Meses inteiros entre duas datas — a leitura certa para tempo de reajuste. */
export function mesesEntre(de: string, ate = HOJE): number {
  const [a1, m1, d1] = de.split('-').map(Number);
  const [a2, m2, d2] = ate.split('-').map(Number);
  return (a2 - a1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
}

export function dataBR(iso: string | null): string {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
}

const ORDEM: Record<Prioridade, number> = { alta: 0, media: 1, baixa: 2, escuta: 3 };

export interface PautaMontada {
  dentro: Assunto[];
  fora: Assunto[];
  usado: number;
  orcamento: number;
  injetados: string[];
  faltouEscuta: boolean;
  faltouDev: boolean;
  minimoSugerido: number;
}

/**
 * Monta a pauta que CABE no orçamento.
 *
 * Regra decidida na Fase 0: a prioridade é estrita — item ALTA nunca é
 * deslocado pela trava de equilíbrio. A trava RESERVA o espaço da escuta e do
 * item de desenvolvimento antes de preencher com MÉDIA/BAIXA, para que um item
 * de baixa prioridade não espreme a escuta para fora. Se nem assim couber, não
 * corta nada: avisa e sugere aumentar a duração.
 */
export function montarPauta(slug: string, minutos: number, descartados: Set<string>): PautaMontada {
  const todos = (PAUTA[slug] ?? []).filter((a) => !descartados.has(a.id));
  const escutas = todos.filter((a) => a.prioridade === 'escuta');
  const resto = todos
    .filter((a) => a.prioridade !== 'escuta')
    .sort((x, y) => ORDEM[x.prioridade] - ORDEM[y.prioridade]);

  const dentro: Assunto[] = [];
  const injetados: string[] = [];
  let usado = 0;

  // 1. Todo item ALTA entra, sempre, antes de qualquer garantia.
  for (const a of resto.filter((x) => x.prioridade === 'alta')) {
    if (usado + a.minutos <= minutos) { dentro.push(a); usado += a.minutos; }
  }

  // 2. Reserva o espaço das garantias antes de preencher com MÉDIA/BAIXA.
  const dev = resto.find((a) => a.categoria === 'Desenvolvimento' && !dentro.includes(a));
  const custoEscuta = escutas.reduce((s, a) => s + a.minutos, 0);
  const custoDev = dev ? dev.minutos : 0;
  const cabeEscuta = usado + custoEscuta <= minutos;
  const cabeDev = usado + (cabeEscuta ? custoEscuta : 0) + custoDev <= minutos;
  const reservado = (cabeEscuta ? custoEscuta : 0) + (cabeDev ? custoDev : 0);

  // 3. Preenche o que sobra.
  for (const a of resto) {
    if (dentro.includes(a) || a === dev) continue;
    if (usado + a.minutos <= minutos - reservado) { dentro.push(a); usado += a.minutos; }
  }

  // 4. Aplica as garantias no espaço reservado.
  if (dev && cabeDev) { dentro.push(dev); injetados.push(dev.id); usado += dev.minutos; }
  if (cabeEscuta) { for (const e of escutas) { dentro.push(e); injetados.push(e.id); usado += e.minutos; } }

  dentro.sort((x, y) => ORDEM[x.prioridade] - ORDEM[y.prioridade]);

  return {
    dentro,
    /**
     * Sai de `todos`, não de `resto`.
     *
     * `resto` exclui as escutas, então uma escuta que não coubesse sumia da
     * tela inteira: nem na pauta, nem em "ficou de fora". O item que mais
     * precisa aparecer quando falta tempo era justamente o que desaparecia
     * em silêncio.
     */
    fora: todos.filter((a) => !dentro.includes(a)),
    usado,
    orcamento: minutos,
    injetados,
    faltouEscuta: !cabeEscuta && escutas.length > 0,
    faltouDev: !cabeDev && !!dev,
    minimoSugerido: usado + (cabeEscuta ? 0 : custoEscuta) + (cabeDev ? 0 : custoDev),
  };
}
