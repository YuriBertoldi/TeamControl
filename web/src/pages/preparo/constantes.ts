/** Vocabulário visual da pauta, compartilhado entre a linha e o detalhe. */

import { PESSOAS, HOJE, diasEntre, type Prioridade } from '../../data/mock';
import type { DotVariant, TokenCor } from '../../app/ListaDetalhe';

/**
 * Pessoa inicial da tela: quem está há mais tempo sem 1:1.
 *
 * Era uma constante com um slug fixo da base de demonstração. Com o cadastro
 * real carregado esse slug deixou de existir, `porSlug` devolveu `undefined` e
 * a tela inteira ficou branca — sem mensagem, sem pista do motivo.
 *
 * Calculado da lista de verdade, isso não pode mais acontecer: ou existe
 * alguém e abre nessa pessoa, ou não existe ninguém e a tela diz isso.
 * Devolve `null` quando não há liderado ativo.
 */
export function primeiroDaFila(): string | null {
  const ativos = PESSOAS.filter((p) => p.status === 'ativo' || p.status === 'afastado');
  if (ativos.length === 0) return null;
  return [...ativos]
    .sort((a, b) => diasEntre(b.ultima1a1, HOJE) - diasEntre(a.ultima1a1, HOJE))[0].slug;
}

export const DOT_PRIORIDADE: Record<Prioridade, DotVariant> = {
  alta: 'error', media: 'warning', baixa: 'neutral', escuta: 'success',
};

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  alta: 'Prioridade alta', media: 'Prioridade média', baixa: 'Prioridade baixa',
  escuta: 'Escuta aberta',
};

export const ROTULO_CURTO: Record<Prioridade, string> = {
  alta: 'ALTA', media: 'MÉDIA', baixa: 'BAIXA', escuta: 'ESCUTA',
};

export const PRIORIDADE_COR: Record<Prioridade, TokenCor> = {
  alta: 'red', media: 'orange', baixa: 'gray', escuta: 'green',
};

/** Distingue o que veio de regra determinística do que veio da IA. */
export const ORIGEM_ROTULO: Record<string, string> = {
  regra_compromisso: 'regra · compromisso',
  regra_recorrencia: 'regra · recorrência',
  regra_bus_factor: 'regra · bus factor',
  regra_ausencia: 'regra · ausência',
  ia_longitudinal: 'IA · leitura longitudinal',
  trava_equilibrio: 'trava de equilíbrio',
};

export const MOTIVOS_DESCARTE = [
  'Irrelevante', 'Momento errado', 'Já resolvido', 'Formulação ruim',
] as const;
