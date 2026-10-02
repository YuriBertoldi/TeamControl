/**
 * Registros de 1:1 e feedbacks — o acervo, indexado.
 *
 * Vem do banco: o backend processa a pasta e `GET /api/registros` devolve o
 * ÍNDICE — data, duração, fonte, tema, contagens e a confidencialidade de cada
 * parte. O texto integral NÃO entra aqui: markdown e transcrição são buscados
 * por `api.registro(id)` quando a conversa é aberta, porque as fontes somam
 * quase 1 MB e a tela carrega o índice toda vez.
 *
 * Cada registro tem até três partes com confidencialidade própria:
 *   1 Parte 1, compartilhável  — o que você entrega à pessoa
 *   3 Parte 2, privado         — sua leitura, nunca sai daqui
 *   2 Avaliação mensal         — o que foi lançado no portal
 * Mais a seção "Omitido de propósito", que registra QUE existe material
 * cortado e por quê, sem o conteúdo. Quando o motivo é saúde, nem a contagem
 * detalhada circula.
 */

import { lerJSON } from './armazenamento';

export interface ParteRegistro {
  formato: 'compartilhavel' | 'privado_coordenador' | 'avaliacao_1a1';
  /** 1 público ao liderado · 2 RH/calibragem · 3 privado · 4 restrito saúde. */
  conf: 1 | 2 | 3 | 4;
}

/**
 * Uma fonte da conversa — o que lastreia o registro.
 *
 * `transcricao_bruta` é o que foi dito, palavra por palavra. `notas_sumarizadas`
 * é o resumo que a ferramenta gerou. Os dois são confidencialidade 3: contêm
 * inclusive o que o registro compartilhável cortou de propósito.
 */
export interface FonteRegistro {
  id: number;
  fonte: 'tactiq' | 'gemini_notes' | 'gemini_transcript';
  kind: 'transcricao_bruta' | 'notas_sumarizadas' | 'payload_api';
  extrator: string;
  qualidade: 'ok' | 'parcial' | 'falhou' | 'revisado_manual';
  conf: 1 | 2 | 3 | 4;
  /** Quantas falas foram indexadas. Zero nas notas, que não têm falante. */
  falas: number;
  caracteres: number;
}

export interface Registro1a1 {
  /** Id da reunião no banco — é por ele que o conteúdo é buscado. */
  id: number;
  slug: string;
  /** Nome completo, para a tela não depender de cruzar com o cadastro. */
  pessoa: string;
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
  /**
   * O lastro: as transcrições e anotações de onde o registro saiu.
   *
   * Vem sem texto no índice — só fonte, qualidade da extração e tamanho. É o
   * que permite a tela dizer "este registro tem transcrição por trás" sem
   * carregar 18 mil caracteres por linha.
   */
  fontes: FonteRegistro[];
  /** A data do nome do arquivo não bate com a do conteúdo — pede conferência. */
  divergencia: boolean;
  /** Quantos itens foram deliberadamente cortados dos registros. */
  omitidos: number;
  /** Destes, quantos são de saúde — nível 4, não sai nem para o RH. */
  omitidoSaude: number;
  /** Quantos saíram do compartilhável mas seguem no privado. Opcional: o
   * índice da API não calcula isso hoje. */
  omitidoNoPrivado?: number;
  bytes: number;
}

/**
 * O acervo, lido do cache que `conectar()` preenche na subida.
 *
 * Síncrono de propósito: as telas usam isto em cerca de vinte lugares, em
 * contagem e filtro. Tornar tudo assíncrono trocaria um problema por vinte
 * estados de carregamento. O `main.tsx` garante a ordem — hidrata e só então
 * importa o Shell, então quando este módulo é avaliado o cache já está pronto.
 *
 * Sem API no ar, abre com o último estado conhecido, que é o comportamento
 * certo para um sistema local cujo backend pode estar desligado.
 */
export const REGISTROS: Registro1a1[] = lerJSON<Registro1a1[]>('registros', []);

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
