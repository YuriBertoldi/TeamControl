/**
 * Registros de 1:1 e feedbacks — o acervo, indexado.
 *
 * Nasce vazio e é preenchido por `scripts/gerar-registros.cjs`, que varre a
 * sua pasta de registros e extrai o ÍNDICE: data, duração, fonte, tema,
 * contagens e a confidencialidade de cada parte. O texto integral nunca entra
 * aqui — continua no arquivo e, no sistema final, vem do banco com o filtro
 * de audiência aplicado em SQL.
 *
 * Cada registro tem até três partes com confidencialidade própria:
 *   1 Parte 1, compartilhável  — o que você entrega à pessoa
 *   3 Parte 2, privado         — sua leitura, nunca sai daqui
 *   2 Avaliação mensal         — o que foi lançado no portal
 * Mais a seção "Omitido de propósito", que registra QUE existe material
 * cortado e por quê, sem o conteúdo. Quando o motivo é saúde, nem a contagem
 * detalhada circula.
 */

export interface ParteRegistro {
  formato: 'compartilhavel' | 'privado_coordenador' | 'avaliacao_1a1';
  /** 1 público ao liderado · 2 RH/calibragem · 3 privado · 4 restrito saúde. */
  conf: 1 | 2 | 3 | 4;
}

export interface Registro1a1 {
  slug: string;
  data: string;
  arquivo: string;
  duracao: string;
  fonte: string;
  tema: string;
  /** Avaliação mensal da portal de avaliação registrada na conversa, quando houve. */
  performance: string | null;
  impacto: number | null;
  encaminhamentos: number;
  /** Encaminhamentos cujo prazo nunca virou data — a dor central do acervo. */
  prazosVagos: number;
  /** Quantos são seus. É o que mais morre em silêncio. */
  meus: number;
  proximaConversa: number;
  partes: ParteRegistro[];
  /** Quantos itens foram deliberadamente cortados dos registros. */
  omitidos: number;
  /** Destes, quantos são de saúde — nível 4, não sai nem para o RH. */
  omitidoSaude: number;
  /** Quantos saíram do compartilhável mas seguem no registro privado. */
  omitidoNoPrivado: number;
  bytes: number;
}

export const REGISTROS: Registro1a1[] = [];

export interface Feedback {
  slug: string;
  data: string;
  titulo: string;
  arquivo: string;
  bytes: number;
}

/**
 * Feedbacks avulsos — registrados fora da 1:1.
 *
 * Hoje existe exatamente um na pasta, numa subpasta solta. É justamente o tipo
 * de evidência que sumiria na hora da AVD, e o motivo de o banco de feedbacks
 * existir como superfície própria em vez de virar mais um parágrafo de ata.
 */
export const FEEDBACKS: Feedback[] = [];
