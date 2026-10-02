/**
 * Navegação entre telas e para o perfil de uma pessoa.
 *
 * Existe como contexto e não como prop porque o perfil é alcançável de quase
 * todo lugar — Painel, Pessoas, Visão de times, Registros, Skills, AVD — e
 * passar `abrirPessoa` por cinco níveis de props em rotas carregadas com
 * `lazy` só produz ruído.
 *
 * O perfil é uma camada POR CIMA da rota, não uma rota: você abre o perfil do
 * Diego a partir do Painel, fecha, e volta exatamente para o Painel onde
 * estava. Tratar como rota obrigaria a reconstruir de onde se veio.
 */

import { createContext, useContext } from 'react';
import type { RotaId } from './Shell';

export interface Navegacao {
  ir: (rota: RotaId) => void;
  abrirPessoa: (slug: string) => void;
  fecharPessoa: () => void;
}

const Ctx = createContext<Navegacao>({
  ir: () => {},
  abrirPessoa: () => {},
  fecharPessoa: () => {},
});

export const ProvedorNavegacao = Ctx.Provider;

export const useNavegacao = () => useContext(Ctx);
