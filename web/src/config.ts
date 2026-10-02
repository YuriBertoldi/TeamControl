/**
 * Parametrização do sistema.
 *
 * Nada de caminho fixo no código. A precedência é:
 *   1. o que o usuário salvou na tela de Configurações (localStorage)
 *   2. variável de ambiente (.env → VITE_*)
 *   3. o padrão daqui
 *
 * No sistema de verdade, (2) vira variável de ambiente do container Go e (1)
 * vira linha na tabela de configuração do tenant. A forma deste módulo é a
 * mesma; só muda de onde o valor vem.
 */

import { SQUADS_PADRAO, type Squad } from './data/squads';
import { ler, escreverJSON, remover } from './data/armazenamento';
import { sincronizar } from './data/origem';

export interface PastaMonitorada {
  id: string;
  caminho: string;
  rotulo: string;
  ativa: boolean;
  /** Subpastas ignoradas na varredura. */
  ignorar: string[];
}

export interface Config {
  /** Estrutura organizacional — editável na tela de Squads. */
  squads: Squad[];
  pastas: PastaMonitorada[];
  /** Intervalo de varredura, em segundos. Polling, não fsnotify — ver plano. */
  intervaloVarreduraSeg: number;
  /** Extensões aceitas na ingestão. */
  extensoes: string[];
  /** Pasta onde o export Markdown versionado é gravado. */
  pastaExport: string;
  /** Nome do coordenador, usado para separá-lo dos participantes na transcrição. */
  nomeCoordenador: string;
  /** Cadência de 1:1 combinada: uma a cada 2 meses. A folga soma ao limiar do alerta. */
  cadenciaDias: number;
  folgaCadenciaDias: number;
  /** Corte de elegibilidade ao ciclo de avaliação, em meses de casa. */
  mesesMinimosAVD: number;
}


const env = import.meta.env as Record<string, string | undefined>;

export const CONFIG_PADRAO: Config = {
  squads: SQUADS_PADRAO,
  pastas: [
    {
      id: 'principal',
      caminho: env.VITE_PASTA_REGISTROS ?? 'C:\\dados\\registros-demo',
      rotulo: 'Registros 1:1',
      ativa: true,
      ignorar: ['.claude', 'node_modules'],
    },
    {
      id: 'drive',
      caminho: env.VITE_PASTA_DRIVE ?? 'G:\\Meu Drive\\1-1 Gravações',
      rotulo: 'Google Drive (unidade montada)',
      ativa: false,
      ignorar: [],
    },
  ],
  intervaloVarreduraSeg: Number(env.VITE_INTERVALO_VARREDURA ?? 30),
  extensoes: ['.txt', '.pdf', '.md'],
  pastaExport: env.VITE_PASTA_EXPORT ?? 'C:\\dados\\gestao-pessoas-dados',
  nomeCoordenador: env.VITE_COORDENADOR ?? 'Coordenação',
  cadenciaDias: 60,
  folgaCadenciaDias: 0,
  mesesMinimosAVD: 6,
};

const CHAVE = 'config';

export function carregarConfig(): Config {
  try {
    const salvo = ler(CHAVE);
    if (!salvo) return CONFIG_PADRAO;
    // Merge raso: chave nova no padrão continua valendo mesmo com config antiga salva.
    return { ...CONFIG_PADRAO, ...JSON.parse(salvo) as Partial<Config> };
  } catch {
    return CONFIG_PADRAO;
  }
}

export function salvarConfig(c: Config): void {
  escreverJSON(CHAVE, c);
  // Squads viajam dentro da config, mas no banco são tabela própria.
  sincronizar('squads', c.squads);
}

export function limparConfig(): void {
  remover(CHAVE);
}

/** Último segmento do caminho — para exibir sem ocupar a linha inteira. */
export function nomeCurtoPasta(caminho: string): string {
  const partes = caminho.split(/[\\/]/).filter(Boolean);
  return partes[partes.length - 1] ?? caminho;
}
