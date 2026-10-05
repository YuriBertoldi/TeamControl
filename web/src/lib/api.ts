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

  /* ---------- importações ---------- */

  /**
   * Ignora um arquivo da fila, ou devolve para ela.
   *
   * Só estes dois destinos existem de propósito. Marcar como `processado` pela
   * tela faria o banco dizer que a conversa está no sistema sem que ninguém a
   * tenha lido — e isso só apareceria na calibragem, quando não há como voltar.
   */
  marcarArquivo: (id: number, status: 'ignorado' | 'pendente') =>
    requisitar<{ ok: boolean }>(`/api/importacoes/${id}`, {
      method: 'PUT', body: JSON.stringify({ status }),
    }),

  /**
   * Aponta de quem é o arquivo quando a carga não soube dizer.
   *
   * Por slug, e não por id: é assim que a pessoa é identificada em todas as
   * telas, e um id numérico só aqui criaria uma segunda identidade para a
   * mesma coisa.
   *
   * A decisão vale para ESTE arquivo, não vira regra para o nome. "Este
   * arquivo é da Fulana" é um fato que quem abriu o arquivo verificou; "sempre
   * que aparecer este nome é a Fulana" é uma regra geral que ninguém pediu.
   */
  atribuirPessoa: (id: number, pessoa: string) =>
    requisitar<{ ok: boolean }>(`/api/importacoes/${id}`, {
      method: 'PUT', body: JSON.stringify({ pessoa }),
    }),

  /**
   * Varre a pasta e processa o que achar.
   *
   * Timeout largo: a passada completa lê 121 arquivos, extrai 15 PDFs e grava
   * 3 mil linhas de transcrição. Os 2s do padrão abortariam no meio e a tela
   * diria que falhou enquanto o banco seguia gravando.
   */
  varrer: () =>
    requisitar<{ ok: boolean; vistos: number; reunioes: number; registros: number;
                 revisao: string[] | null; erros: string[] | null }>(
      '/api/importacoes/varrer', { method: 'POST' }, 120000),

  /* ---------- compromissos e preparação ---------- */

  /** Encaminhamentos em aberto de todo mundo. */
  compromissos: () => tentar<CompromissoAPI[]>('/api/compromissos'),

  /**
   * Confirma o prazo ou muda a situação de um compromisso.
   *
   * A data que o sistema sugeriu só vira a data que vale passando por aqui.
   * O sistema lê "próximas semanas" e propõe; quem assumiu o compromisso
   * confirma. Um board cobrando data que ninguém combinou perde a confiança
   * de quem o usa na primeira 1:1 em que isso aparecer.
   */
  atualizarCompromisso: (id: number, dados: { prazo?: string; status?: string }) =>
    requisitar<{ ok: boolean }>(`/api/compromissos/${id}`, {
      method: 'PUT', body: JSON.stringify(dados),
    }),

  /**
   * A preparação de uma 1:1, montada do histórico.
   *
   * Sob demanda e não na subida: o pacote lê o texto de todas as conversas da
   * pessoa, e só faz sentido quando a tela de preparação abre. Timeout largo
   * pelo mesmo motivo.
   */
  preparo: (slug: string) =>
    tentar<PreparoAPI>(`/api/preparo/${encodeURIComponent(slug)}`, 15000),

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

/* ---------- compromissos e preparação de 1:1 ---------- */

/**
 * Um encaminhamento em aberto.
 *
 * `natureza` separa prazo de conduta: "Contínuo" e "Sob demanda" não vencem,
 * e colocá-los na fila de vencidos encheria o board de alarme falso — board
 * que grita por engano é board que se aprende a ignorar junto com o que
 * gritava com razão.
 */
export interface CompromissoAPI {
  id: number;
  pessoa: string;
  pessoaSlug: string;
  responsavel: 'coordenador' | 'liderado' | 'terceiro' | 'ambos';
  nomeResp: string;
  descricao: string;
  prazoTexto: string;
  prazoDate: string | null;
  /** O que o sistema LEU do texto. Vira `prazoDate` só quando confirmado. */
  prazoSugerido?: string | null;
  natureza: 'prazo' | 'continuo' | 'indefinido';
  status: string;
  origemMeeting: string;
  /** Em quantas conversas distintas a mesma descrição aparece. */
  herdado: number;
  prazoVago: boolean;
  notaHerdado?: string;
  /** Prazo é "a próxima 1:1", e a próxima 1:1 é a que está sendo preparada. */
  venceAgora: boolean;
}

export interface AssuntoAPI {
  id: string;
  prioridade: 'alta' | 'media' | 'baixa' | 'escuta';
  minutos: number;
  categoria: string;
  origem: string;
  titulo: string;
  porQueAgora: string;
  refs: string[];
  pergunta: string;
  porQueAssim: string;
  toca: string[];
  conf?: number;
  avisoConf?: string;
  herdado?: boolean;
}

export interface PreparoAPI {
  pessoa: string;
  slug: string;
  ultimaConversa: string | null;
  diasSemConversa: number | null;
  assuntos: AssuntoAPI[];
  temas: {
    recorrentes: { tema: string; ocorrencias: number; janela: number; nota: string; refs: string[] }[];
    ausentes: { tema: string; conversasSem: number; ultimo: string | null; nota?: string }[];
  };
  novidades: { tipo: 'cruzado' | 'entrega' | 'alerta'; data: string; conf: number;
               texto: string; origem?: string; ref?: string }[];
  proximaConversa: string[];
  naoFalar: {
    cicloVigente: string;
    itens: { texto: string; conf: number; motivo: string }[];
    omitidosNivel4: number;
  };
  compromissos: CompromissoAPI[];
}
