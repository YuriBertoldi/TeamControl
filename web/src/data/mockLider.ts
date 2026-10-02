/**
 * Evolução do líder — o que você precisa melhorar, vindo de quatro origens.
 *
 * Nasce vazio. Popula-se do que os liderados trouxeram nas 1:1, da sua
 * avaliação de liderança (anônima), do que o seu gestor respondeu e da sua
 * própria leitura.
 */

import type { Confidencialidade } from './mock';

export type OrigemItem = 'um_a_um' | 'avd_lideranca' | 'avd_meu_lider' | 'auto';
export type StatusItem = 'aberto' | 'em_andamento' | 'resolvido' | 'nao_vou_mudar';

export interface ItemEvolucao {
  id: number;
  origem: OrigemItem;
  /** Quem trouxe. Em avaliação anônima fica nulo — e isso é regra, não falta de dado. */
  pessoa: string | null;
  data: string;
  tema: string;
  texto: string;
  /** O que você decidiu fazer. Item sem decisão é item que você ouviu e engavetou. */
  acao?: string;
  status: StatusItem;
  recorrencia: number;
  conf: Confidencialidade;
  ref?: string;
}

export const ORIGEM_ROTULO: Record<OrigemItem, string> = {
  um_a_um: '1:1 do liderado',
  avd_lideranca: 'Avaliação de liderança (anônima)',
  avd_meu_lider: 'Minha AVD — avaliação do meu líder',
  auto: 'Minha autoavaliação',
};

export const STATUS_ROTULO: Record<StatusItem, string> = {
  aberto: 'Aberto',
  em_andamento: 'Em andamento',
  resolvido: 'Resolvido',
  nao_vou_mudar: 'Não vou mudar',
};

export const ITENS: ItemEvolucao[] = [];

/** Temas que aparecem em mais de uma fonte — é onde a evidência converge. */
export function temasConvergentes(itens: ItemEvolucao[]) {
  const porTema = new Map<string, Set<OrigemItem>>();
  for (const i of itens) {
    if (!porTema.has(i.tema)) porTema.set(i.tema, new Set());
    porTema.get(i.tema)!.add(i.origem);
  }
  return [...porTema.entries()]
    .filter(([, origens]) => origens.size > 1)
    .map(([tema, origens]) => ({ tema, origens: [...origens] }));
}
