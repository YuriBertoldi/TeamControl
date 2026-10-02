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

async function requisitar<T>(caminho: string, init?: RequestInit): Promise<T> {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), TIMEOUT_MS);
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
async function tentar<T>(caminho: string): Promise<T | null> {
  try {
    return await requisitar<T>(caminho);
  } catch {
    return null;
  }
}

/* ---------- leitura ---------- */

export const api = {
  async saude(): Promise<boolean> {
    const r = await tentar<{ ok: boolean }>('/api/saude');
    return r?.ok === true;
  },

  pessoas: () => tentar<Pessoa[]>('/api/pessoas'),
  tribos: () => tentar<Tribo[]>('/api/tribos'),
  squads: () => tentar<Squad[]>('/api/squads'),
  importacoes: () => tentar<ArquivoAPI[]>('/api/importacoes'),

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
