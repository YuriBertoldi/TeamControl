/**
 * Dados operacionais: importações, relatórios e alertas.
 *
 * As listas nascem vazias e se populam pela importação, que você aponta em
 * Configurações › Pastas monitoradas. Os CATÁLOGOS ficam — modelos de
 * relatório, rótulos de tipo e severidade — porque são conhecimento do
 * produto, não dado de alguém.
 *
 * O acervo zerado é proposital: Painel mostrando um acervo cheio numa
 * instalação nova seria mentira na primeira tela.
 */

import type { Confidencialidade } from './mock';

/* ---------- Importações ---------- */

export type TipoFonte =
  | 'tactiq_txt' | 'gemini_notes_pdf' | 'gemini_transcript_pdf'
  | 'registro_md' | 'dossie_md' | 'rascunho_avd_md' | 'material_avd_pdf';

export type StatusFonte = 'processado' | 'pendente' | 'revisao_manual' | 'ignorado' | 'erro';

export interface ArquivoFonte extends Record<string, unknown> {
  id: number;
  arquivo: string;
  pasta: string;
  tipo: TipoFonte;
  status: StatusFonte;
  pessoa: string | null;
  dataReuniao: string | null;
  dataArquivo: string | null;
  bytes: number;
  motivo?: string;
  candidatos?: string[];
}

export const TIPO_ROTULO: Record<TipoFonte, string> = {
  tactiq_txt: 'Tactiq .txt',
  gemini_notes_pdf: 'Gemini (notas)',
  gemini_transcript_pdf: 'Gemini (transcrição)',
  registro_md: 'Registro .md',
  dossie_md: 'Dossiê AVD',
  rascunho_avd_md: 'Rascunho AVD',
  material_avd_pdf: 'Material AVD',
};

export const STATUS_ROTULO: Record<StatusFonte, string> = {
  processado: 'Processado',
  pendente: 'Na fila',
  revisao_manual: 'Revisão manual',
  ignorado: 'Ignorado',
  erro: 'Erro',
};

export const ARQUIVOS: ArquivoFonte[] = [];

/**
 * Números reais da pasta, para o painel não mentir sobre o tamanho do acervo.
 *
 * Os números vêm da varredura do backend, nunca de contagem manual: pasta de
 * trabalho costuma ter temporários do Office que inflam o total.
 */
export const ACERVO = {
  totalArquivos: 0,
  tactiq: 0,
  geminiNotas: 0,
  geminiTranscricao: 0,
  materialAvd: 0,
  registrosProcessados: 0,
  dossies: 0,
  rascunhos: 0,
  feedbacks: 0,
  naoClassificado: 0,
};

/* ---------- Relatórios ---------- */

export type Audiencia = 'liderado' | 'rh' | 'coordenador';

export interface ModeloRelatorio {
  codigo: string;
  nome: string;
  publico: string;
  periodicidade: string;
  confidMax: Confidencialidade;
  audiencia: Audiencia;
  descricao: string;
}

export const MODELOS_RELATORIO: ModeloRelatorio[] = [
  { codigo: 'R1', nome: 'Pulso mensal do time', publico: 'Você', periodicidade: 'Mensal',
    confidMax: 3, audiencia: 'coordenador',
    descricao: 'Evidências, avaliações, compromissos e alertas do mês, por pessoa.' },
  { codigo: 'R2', nome: 'Dossiê pré-calibragem', publico: 'Você (mesa)', periodicidade: 'Por ciclo',
    confidMax: 2, audiencia: 'rh',
    descricao: 'Tese, evidências ordenadas por força, trajetória completa e o bloco obrigatório de contra-evidências.' },
  { codigo: 'R3', nome: 'Resumo trimestral da pessoa', publico: 'Entregue ao liderado', periodicidade: 'Trimestral',
    confidMax: 1, audiencia: 'liderado',
    descricao: 'Só evidências compartilháveis, compromissos, PDI e trilha.' },
  { codigo: 'R4', nome: 'Progresso da trilha QA→Dev', publico: 'Você + versão para entregar', periodicidade: 'Mensal',
    confidMax: 3, audiencia: 'coordenador',
    descricao: 'Critérios atendidos, dias parado por critério e hipótese de bloqueio.' },
  { codigo: 'R5', nome: 'Mapa de risco de retenção', publico: 'Só você', periodicidade: 'Quinzenal',
    confidMax: 3, audiencia: 'coordenador',
    descricao: 'Composição de sinais declarados. Nunca sai do coordenador.' },
  { codigo: 'R6', nome: 'Status consolidado de PDIs', publico: 'Você + gestor', periodicidade: 'Mensal',
    confidMax: 2, audiencia: 'rh',
    descricao: 'Quem tem PDI, quem não tem, marcos vencidos.' },
  { codigo: 'R7', nome: 'Relatório para gestor/RH', publico: 'Gestor, RH', periodicidade: 'Mensal',
    confidMax: 2, audiencia: 'rh',
    descricao: 'Montado de um pack próprio, nunca por edição do R1 — é onde vazamento acontece.' },
  { codigo: 'R8', nome: 'Retrospectiva de ciclo', publico: 'Você', periodicidade: 'Pós-calibragem',
    confidMax: 3, audiencia: 'coordenador',
    descricao: 'O que a mesa questionou contra o que o R2 previu. Calibra a sua régua ano a ano.' },
  { codigo: 'R9', nome: 'Mapa de conhecimento e bus factor', publico: 'Você + gestor', periodicidade: 'Trimestral',
    confidMax: 2, audiencia: 'rh',
    descricao: 'Skill crítica com uma única pessoa em nível ≥ 3.' },
  { codigo: 'R10', nome: 'Higiene do processo', publico: 'Só você', periodicidade: 'Semanal',
    confidMax: 3, audiencia: 'coordenador',
    descricao: 'Três linhas que impedem a repetição do buraco de jun/jul.' },
];

export interface RelatorioGerado extends Record<string, unknown> {
  id: number;
  codigo: string;
  titulo: string;
  pessoa: string | null;
  audiencia: Audiencia;
  confidMax: Confidencialidade;
  geradoEm: string;
  versao: number;
  verificado: boolean;
  evidencias: number;
  evidenciasVerificadas: number;
}

export const RELATORIOS_GERADOS: RelatorioGerado[] = [];

/* ---------- Alertas ---------- */

export type Severidade = 'critica' | 'alta' | 'media' | 'info';

export interface Alerta extends Record<string, unknown> {
  id: number;
  regra: string;
  familia: string;
  severidade: Severidade;
  pessoa: string | null;
  titulo: string;
  detalhe: string;
  acao: string;
  conf: Confidencialidade;
  dias?: number;
}

export const ALERTAS: Alerta[] = [];

/**
 * O alerta de 1:1 é DERIVADO, não escrito à mão.
 *
 * Deixá-lo fixo era um jeito garantido de contradizer a configuração: mudar a
 * cadência para 2 meses e o alerta continuar dizendo "mensal". Aqui ele nasce
 * das pessoas e do limiar, então os dois nunca divergem.
 */
export function alertasDe1a1(
  pessoas: { nome: string; ultima1a1: string; status: string }[],
  limiteDias: number,
  hoje: string,
): Alerta[] {
  const dias = (de: string) => Math.round((+new Date(hoje) - +new Date(de)) / 86400000);
  return pessoas
    .filter((p) => (p.status === 'ativo' || p.status === 'afastado') && dias(p.ultima1a1) > limiteDias)
    .sort((a, b) => dias(b.ultima1a1) - dias(a.ultima1a1))
    .map((p, i) => ({
      id: 900 + i,
      regra: 'sem_1a1',
      familia: 'Ritual',
      // Até o dobro da cadência é atraso; além disso, é abandono.
      severidade: (dias(p.ultima1a1) > limiteDias * 2 ? 'critica' : 'alta') as Severidade,
      pessoa: p.nome,
      titulo: `Sem 1:1 há ${dias(p.ultima1a1)} dias`,
      detalhe: `Cadência combinada é de ${limiteDias} dias — uma a cada ${Math.round(limiteDias / 30)} meses.`,
      acao: 'Agendar 1:1 esta semana',
      conf: 1 as const,
      dias: dias(p.ultima1a1),
    }));
}

export const SEV_ROTULO: Record<Severidade, string> = {
  critica: 'Crítica', alta: 'Alta', media: 'Média', info: 'Info',
};
export const SEV_COR = { critica: 'red', alta: 'orange', media: 'yellow', info: 'gray' } as const;
export const SEV_DOT = { critica: 'error', alta: 'error', media: 'warning', info: 'neutral' } as const;

/* ---------- Temas estratégicos (termômetro do painel) ---------- */

export interface TemaEstrategico {
  tema: string;
  comEvidencia: number;
  total: number;
}

/** Os temas que você cobra do time. Cadastráveis — nascem vazios. */
export const TEMAS_ESTRATEGICOS: TemaEstrategico[] = [];
