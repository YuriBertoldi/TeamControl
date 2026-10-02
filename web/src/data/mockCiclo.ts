/**
 * Ciclo de desenvolvimento: skills, AVD, calibragem, PDI e trilha.
 *
 * Os CATÁLOGOS vêm preenchidos — a taxonomia de skills, os níveis da trilha
 * QA→Dev, os quadrantes do 9-box — porque são o conhecimento que faz o
 * sistema saber o que é uma matriz de competência. Já avaliação, defesa,
 * progresso e PDI nascem vazios: são dados de pessoas, e cada instalação
 * acumula os seus.
 *
 * Escala de skill: 0–4 Dreyfus adaptado.
 *   0 Sem contato · 1 Conhece · 2 Executa · 3 Domínio · 4 Referência
 * O nível 4 exige evidência de REPLICAÇÃO, não de virtuosismo — é o que ataca
 * o bus factor já na definição da escala.
 */

/* ---------- Skills ---------- */

export const NIVEL_ROTULO = ['Sem contato', 'Conhece', 'Executa', 'Domínio', 'Referência'] as const;
export const NIVEL_COR = ['gray', 'red', 'orange', 'blue', 'green'] as const;

export interface Skill {
  codigo: string;
  nome: string;
  categoria: string;
  estrategica?: boolean;
  critica?: boolean;
}

export const SKILLS: Skill[] = [
  { codigo: 'folha.calculo', nome: 'Cálculo da folha', categoria: 'Produto', critica: true },
  { codigo: 'fiscal.sped', nome: 'EFD ICMS/IPI', categoria: 'Produto', critica: true },
  { codigo: 'fiscal.esocial', nome: 'eSocial / NTs', categoria: 'Produto', critica: true },
  { codigo: 'delphi.vcl', nome: 'Object Pascal / VCL', categoria: 'Delphi' },
  { codigo: 'delphi.btrieve', nome: 'Estrangulamento Btrieve→PG', categoria: 'Delphi' },
  { codigo: 'dados.sql', nome: 'SQL PostgreSQL', categoria: 'Dados' },
  { codigo: 'dados.tuning', nome: 'Tuning e plano de execução', categoria: 'Dados' },
  { codigo: 'go.idiomatico', nome: 'Go idiomático', categoria: 'Go', estrategica: true },
  { codigo: 'go.api', nome: 'Go — APIs HTTP', categoria: 'Go', estrategica: true },
  { codigo: 'plat.docker', nome: 'Docker', categoria: 'Plataforma' },
  { codigo: 'plat.cicd', nome: 'CI/CD', categoria: 'Plataforma' },
  { codigo: 'qa.robot', nome: 'Robot Framework', categoria: 'Qualidade' },
  { codigo: 'qa.python', nome: 'Python para automação', categoria: 'Qualidade' },
  { codigo: 'qa.cenarios', nome: 'Modelagem de cenários', categoria: 'Qualidade' },
  { codigo: 'ia.claudecode', nome: 'Claude Code no dia a dia', categoria: 'IA', estrategica: true },
  { codigo: 'ia.skills', nome: 'Autoria de skills/agents', categoria: 'IA', estrategica: true },
  { codigo: 'eng.arquitetura', nome: 'Design e arquitetura', categoria: 'Engenharia' },
  { codigo: 'eng.causaraiz', nome: 'Diagnóstico de causa raiz', categoria: 'Engenharia' },
  { codigo: 'lid.mentoria', nome: 'Mentoria', categoria: 'Liderança' },
  { codigo: 'lid.estimativa', nome: 'Estimativa e dimensionamento', categoria: 'Liderança' },
];

/** nível do líder por pessoa/skill. Ausente = 0. */
export const NIVEIS: Record<string, Record<string, number>> = {};

/** Autoavaliação, só onde foi coletada — o gap é o dado mais útil da matriz. */
export const AUTO: Record<string, Record<string, number>> = {};

/* ---------- AVD ---------- */

export const DRIVERS_COMPORTAMENTO = [
  'Entrega do extraordinário', 'Foco no cliente', 'Resultado', 'Respeito',
  'Trabalho em equipe', 'Mentalidade de crescimento', 'Autonomia com responsabilidade',
  'Ambiente seguro e transparente',
];
export const DRIVERS_DESEMPENHO = [
  'Domínio técnico aplicado', 'Qualidade e impacto da entrega', 'Contribuição técnica',
  'Gestão da execução', 'Diagnóstico e solução', 'Clareza e alinhamento',
];

export interface AvaliacaoAVD {
  slug: string;
  /** Id do ciclo em que esta avaliação foi lançada. */
  ciclo: string;
  quadrante: string;
  comportamento: number[];
  desempenho: number[];
  /** Comentário por driver — índice alinhado aos arrays acima. */
  comentarios: Record<number, string>;
  /** Drivers ainda sem evidência vinculada (índice no eixo). */
  semEvidenciaComp: number[];
  semEvidenciaDesemp: number[];
  auto?: { comportamento: number; desempenho: number };
}

export const AVD: AvaliacaoAVD[] = [];

export const media = (ns: number[]) => ns.reduce((a, b) => a + b, 0) / ns.length;
export const faixa = (m: number) => (m <= 2.4 ? 'Baixo' : m <= 3.5 ? 'Médio' : 'Alto');

/** Os 9 quadrantes, na ordem em que a grade é desenhada (linha = comportamento). */
export const QUADRANTES_9BOX = [
  { nome: 'Diamante Bruto', comp: 'Alto', desemp: 'Baixo' },
  { nome: 'Forte Comportamento', comp: 'Alto', desemp: 'Médio' },
  { nome: 'Estrela', comp: 'Alto', desemp: 'Alto' },
  { nome: 'Questionável', comp: 'Médio', desemp: 'Baixo' },
  { nome: 'Mantenedor', comp: 'Médio', desemp: 'Médio' },
  { nome: 'Forte Desempenho', comp: 'Médio', desemp: 'Alto' },
  { nome: 'Insuficiente', comp: 'Baixo', desemp: 'Baixo' },
  { nome: 'Eficaz', comp: 'Baixo', desemp: 'Médio' },
  { nome: 'Comprometido', comp: 'Baixo', desemp: 'Alto' },
];

/* ---------- Calibragem ---------- */

export interface Defesa {
  slug: string;
  tese: string;
  evidencias: { texto: string; ref: string }[];
  porQueNaoMaior: string;
  risco: string;
  nivelRisco: 'alto' | 'medio' | 'baixo';
}

export const DEFESAS: Defesa[] = [];

/* ---------- Trilha QA → Dev ---------- */

export interface NivelTrilha {
  id: string;
  ordem: number;
  nome: string;
  identidade: string;
  saidaValida?: string;
  criterios: string[];
}

export const TRILHA: NivelTrilha[] = [
  { id: 'n0', ordem: 0, nome: 'N0 · Executor', identidade: 'Executa roteiro definido por outro',
    criterios: ['Executa roteiro sem desvio', 'Reporta defeito com reprodução'] },
  { id: 'n1', ordem: 1, nome: 'N1 · Analista de Testes',
    identidade: 'Modela os próprios cenários e levanta risco',
    criterios: [
      'Escreveu 3 roteiros próprios a partir do card, aprovados sem reescrita',
      'Levantou ≥2 riscos fora do card que se confirmaram relevantes',
      'Produziu 1 análise de impacto aceita pelo dev responsável',
      'Reportou ≥5 defeitos com reprodução completa, zero devolvidos',
      'Usa IA para ampliar cobertura, com output revisado criticamente',
    ] },
  { id: 'n2', ordem: 2, nome: 'N2 · QA Automação',
    identidade: 'Opera e estende a suíte existente',
    saidaValida: 'Deixou de ser manual — o problema de negócio já está resolvido aqui',
    criterios: [
      'Executou do zero ao verde ≥5 casos no repositório e2e',
      'Abriu ≥3 PRs mesclados no repositório de testes',
      'Classificou falha de teste × bug de produto em ≥10 ocorrências',
      'Git sem apoio: branch, commit, PR, conflito simples',
      'Escreve SQL de verificação de pós-condição sem apoio',
    ] },
  { id: 'n3', ordem: 3, nome: 'N3 · QA Engineer (SDET)',
    identidade: 'Constrói a ferramenta de teste, não só o teste',
    saidaValida: 'Engenharia de qualidade — saída de carreira legítima, não um fracasso',
    criterios: [
      'Gerou ≥3 Mapping.py do zero, aprovados em revisão',
      'Criou ≥1 helper reutilizado por OUTRA pessoa',
      'Suíte sob responsabilidade dele estável por 4 semanas corridas',
      'Revisou PR de terceiro com apontamento aceito',
      'Reduziu tempo ou escopo de uma regressão, com número antes/depois',
    ] },
  { id: 'n4', ordem: 4, nome: 'N4 · Dev Jr. com veia de qualidade',
    identidade: 'Entrega feature e bug no produto',
    criterios: [
      'Concluiu trilha formal da linguagem-alvo com projeto entregue',
      '≥3 cards de bug reais com PR mesclado, sem reincidência em 30 dias',
      '≥1 card de feature pequena passando pelo gate de revisão',
      'Escreveu testes unitários para o próprio código',
      'Diagnosticou causa raiz de ≥1 defeito sem orientação prévia',
    ] },
];

export interface QA {
  slug: string;
  nome: string;
  nivelAtual: string;
  nivelAlvo: string;
  entrouEm: string;
  /** Progresso por critério do nível seguinte: índice → {feito, diasParado} */
  progresso: { feito: boolean; diasParado?: number; evidencia?: string }[];
  bloqueio?: string;
  bloqueioEhMeu?: boolean;
}

export const QAS: QA[] = [];

/** Ritmo observado do coorte, em dias, para dar senso de calibragem. */
export const RITMO_COORTE: Record<string, number> = { n1: 150, n2: 210, n3: 240, n4: 300 };

/* ---------- PDI ---------- */

export interface Marco {
  titulo: string;
  skill?: string;
  nivelAlvo?: number;
  prazo: string;
  status: 'aberto' | 'em_andamento' | 'concluido';
}

export interface PDI {
  slug: string;
  ciclo: string;
  objetivos: { titulo: string; porQue: string; marcos: Marco[] }[];
}

/**
 * Validação de coerência: o objetivo contraria a âncora que a pessoa rejeita?
 * Não bloqueia — pergunta. Boa parte do PDI que morre em março foi escrito pelo
 * líder sobre o que o líder acha que a pessoa deveria querer.
 */
export function DNA_AVISO(objetivo: string, ancoraRejeitada: string): boolean {
  const o = objetivo.toLowerCase();
  const a = ancoraRejeitada.toLowerCase();
  if (a.includes('gerencial') && /lideran|coorden|tech lead|gest/.test(o)) return true;
  if (a.includes('técnic') && /especialista|aprofund|referência técnica/.test(o)) return true;
  if (a.includes('estabilidade') && /estabiliz|manuten|sustenta/.test(o)) return true;
  return false;
}

export const PDIS: PDI[] = [];
