/** Vocabulário visual da pauta, compartilhado entre a linha e o detalhe. */

import type { Prioridade } from '../../data/mock';
import type { DotVariant, TokenCor } from '../../app/ListaDetalhe';

/** Pessoa inicial da tela. O seletor troca em tempo de execução; no sistema
 * isto vem da rota /preparo/:slug. */
export const SLUG_PADRAO = 'diego-nunes';

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
