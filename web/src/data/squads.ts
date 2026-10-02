/**
 * Tribos e squads — a estrutura organizacional, configurável.
 *
 * Nada aqui é fixo: a lista de squads e quem está em cada uma vive na
 * configuração (ver src/config.ts), então dá para criar squad, renomear, mover
 * pessoa e trocar Tech Lead sem tocar em código. O que está aqui é só o
 * estado inicial.
 *
 * Uma pessoa pode estar em mais de uma squad — isso acontece, e a
 * tela marca com "+1 squad" como na Visão de times.
 */

import type { Cor } from '../app/ui';

/**
 * Id de tribo é string livre, não união fechada: tribo é cadastro, e criar
 * uma nova não pode exigir editar o tipo. 'pf' e 'qd' são só o estado inicial.
 */
export type TriboId = string;

export interface Tribo {
  id: TriboId;
  nome: string;
  cor: Cor;
  produto: string;
  portalId: string;
  coordenacao: string[];
  gerencia: string[];
}

export interface Squad {
  id: string;
  nome: string;
  tribo: TriboId;
  /** slug do Tech Lead, se houver. Squad sem TL é um dado de gestão, não um erro. */
  techLead?: string;
  coordenacao: string[];
  /** slugs das pessoas alocadas. */
  membros: string[];
}

/**
 * Tribos e squads nascem vazias.
 *
 * O sistema sobe sem organização nenhuma cadastrada: você cria as suas em
 * Cadastros › Tribos e Visão de times › Estrutura. Vir com uma estrutura de
 * exemplo pareceria configuração pronta e obrigaria a apagar antes de usar.
 */
export const TRIBOS_SEED: Tribo[] = [];

export const SQUADS_PADRAO: Squad[] = [];

/** Em quantas squads a pessoa está — "+1 squad" vem daqui. */
export function squadsDe(slug: string, squads: Squad[]): Squad[] {
  return squads.filter((s) => s.membros.includes(slug));
}

/** Quem não está em squad nenhuma. É um número que importa no painel. */
export function semSquad(slugsAtivos: string[], squads: Squad[]): string[] {
  const alocados = new Set(squads.flatMap((s) => s.membros));
  return slugsAtivos.filter((s) => !alocados.has(s));
}
