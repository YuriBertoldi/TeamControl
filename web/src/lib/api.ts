/**
 * Cliente da API do TeamControl.
 *
 * Três decisões que importam:
 *
 * 1. **Toda chamada tem timeout.** Sem ele, a API fora do ar deixa a tela
 *    carregando para sempre, e quem está usando não sabe se é lentidão ou
 *    pane. Dois segundos é tempo de sobra para um servidor local.
 *
 * 2. **Erro não lança por padrão.** `tentar` devolve `null` quando a API não
 *    responde, e quem chama decide o que fazer — no caso do boot, cair no
 *    armazenamento local. Trabalhar offline é cenário normal aqui, não
 *    exceção: o backend pode simplesmente não ter sido subido.
 *
 * 3. **A escrita, essa sim, propaga o erro.** Falha ao salvar precisa chegar
 *    à tela. Gravar no navegador e fingir que foi para o banco é a forma mais
 *    rápida de perder dado sem ninguém perceber.
 */

import type { Pessoa } from '../data/mock';
import type { Tribo, Squad } from '../data/squads';

/** Base da API. Em desenvolvimento, o Vite serve noutra porta. */
export const BASE = import.meta.env.VITE_API ?? 'http://127.0.0.1:8080';

const TIMEOUT_MS = 2000;

export class ErroAPI extends Error {
  // Campo declarado e atribuído no corpo, não por parâmetro de construtor:
  // o projeto compila com `erasableSyntaxOnly`, que recusa a forma curta.
  readonly status: number;

  constructor(status: number, mensagem: string) {
    super(mensagem);
    this.name = 'ErroAPI';
    this.status = status;
  }
}

async function requisitar<T>(caminho: string, init?: RequestInit, timeoutMs = TIMEOUT_MS): Promise<T> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), timeoutMs);
  try {
    const resp = await fetch(`${BASE}${caminho}`, {
      ...init,
      signal: controle.signal,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
    if (!resp.ok) {
      const corpo = await resp.json().catch(() => ({}));
      throw new ErroAPI(resp.status, corpo.erro ?? `HTTP ${resp.status}`);
    }
    return (await resp.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Executa e devolve `null` em qualquer falha — para o caminho de leitura. */
async function tentar<T>(caminho: string, timeoutMs = TIMEOUT_MS): Promise<T | null> {
  try {
    return await requisitar<T>(caminho, undefined, timeoutMs);
  } catch {
    return null;
  }
}

/* ---------- leitura ---------- */

export const api = {
  /**
   * Saúde do backend e a pasta que ele varre.
   *
   * A pasta vem junto porque o front tinha a mesma configuração duplicada,
   * com um caminho de demonstração por padrão — e a tela de Importações
   * exibia um diretório que não era o varrido de fato.
   */
  async saude(): Promise<{ ok: boolean; pasta: string }> {
    const r = await tentar<{ ok: boolean; pasta?: string }>("/api/saude");
    return { ok: r?.ok === true, pasta: r?.pasta ?? "" };
  },

  pessoas: () => tentar<Pessoa[]>('/api/pessoas'),
  tribos: () => tentar<Tribo[]>('/api/tribos'),
  squads: () => tentar<Squad[]>('/api/squads'),
  importacoes: () => tentar<ArquivoAPI[]>('/api/importacoes'),

  /** Índice das conversas: contagem e metadado, sem texto. */
  registros: () => tentar<RegistroAPI[]>('/api/registros'),

  /**
   * Conteúdo de uma conversa: as partes do registro E as transcrições.
   *
   * Timeout maior que o padrão: uma transcrição passa de 18 mil caracteres e
   * há conversa com duas fontes. Dois segundos derrubariam a abertura num
   * banco com a pasta inteira carregada.
   */
  registro: (id: number) => tentar<DetalheRegistroAPI>(`/api/registros/${id}`, 8000),

  /* ---------- escrita ---------- */

  salvarPessoas: (lista: Pessoa[]) =>
    requisitar<{ ok: boolean }>('/api/pessoas', {
      method: 'PUT', body: JSON.stringify(lista),
    }),

  salvarTribos: (lista: Tribo[]) =>
    requisitar<{ ok: boolean }>('/api/tribos', {
      method: 'PUT', body: JSON.stringify(lista),
    }),

  salvarSquads: (lista: Squad[]) =>
    requisitar<{ ok: boolean }>('/api/squads', {
      method: 'PUT', body: JSON.stringify(lista),
    }),
};

/** O que `/api/importacoes` devolve. */
export interface ArquivoAPI {
  id: number;
  caminho: string;
  arquivo: string;
  sha256: string;
  bytes: number;
  tipo: string;
  status: string;
  erro?: string;
  motivo?: string;
  dataReuniao?: string;
  dataArquivo?: string;
  pessoaId?: number;
}

/* ---------- registros de 1:1 ---------- */

/** Uma das versões escritas da conversa. */
export interface ParteAPI {
  formato: 'compartilhavel' | 'privado_coordenador' | 'avaliacao_1a1';
  /** 1 público ao liderado · 2 RH/calibragem · 3 privado · 4 restrito saúde. */
  conf: 1 | 2 | 3 | 4;
  markdown?: string;
}

/**
 * O lastro da conversa: a transcrição ou as anotações de onde o registro saiu.
 *
 * É o que responde "onde foi que ele disse isso". A transcrição bruta vem
 * sempre em confidencialidade 3 — ela contém tudo o que foi falado, inclusive
 * o que o registro compartilhável cortou de propósito.
 */
export interface FonteAPI {
  id: number;
  fonte: 'tactiq' | 'gemini_notes' | 'gemini_transcript';
  kind: 'transcricao_bruta' | 'notas_sumarizadas' | 'payload_api';
  extrator: string;
  qualidade: 'ok' | 'parcial' | 'falhou' | 'revisado_manual';
  conf: 1 | 2 | 3 | 4;
  falas: number;
  caracteres: number;
  texto?: string;
}

export interface EncaminhamentoAPI {
  responsavel: string;
  tipo: 'liderado' | 'coordenador' | 'terceiro' | 'ambos';
  descricao: string;
  prazoTexto: string;
  prazoVago: boolean;
  status: string;
}

/** Registra QUE havia material cortado e por quê — nunca o conteúdo. */
export interface OmissaoAPI {
  item: string;
  onde: string;
  motivo: string;
}

export interface RegistroAPI {
  id: number;
  slug: string;
  pessoa: string;
  data: string;
  arquivo: string;
  duracao: string;
  fonte: string;
  tema: string;
  performance: string | null;
  impacto: number | null;
  encaminhamentos: number;
  prazosVagos: number;
  meus: number;
  proximaConversa: number;
  partes: ParteAPI[];
  fontes: FonteAPI[];
  omitidos: number;
  omitidoSaude: number;
  bytes: number;
  /** A data do nome do arquivo não bate com a do conteúdo. */
  divergencia: boolean;
}

export interface DetalheRegistroAPI extends RegistroAPI {
  listaEncaminhamentos: EncaminhamentoAPI[];
  listaOmissoes: OmissaoAPI[];
  perfJustificativa?: string;
  impactoJustificativa?: string;
}
