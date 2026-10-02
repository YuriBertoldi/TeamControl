/**
 * Seed de pessoas — vazio por decisão.
 *
 * O sistema sobe sem ninguém cadastrado. Você cria o seu time em
 * Cadastros › Pessoas, e as telas tratam o vazio como pendência de gestão,
 * não como erro: "7 sem registro de 1:1" e "10 sem avaliação de skill" são
 * informação, e some sozinho conforme você preenche.
 *
 * Não vem com dado de exemplo, nem fictício. Roster de mentira dá a impressão
 * de sistema já configurado e obriga a apagar tudo antes do primeiro uso —
 * e, pior, esconde o que ainda falta você fazer.
 */

import type { Pessoa } from './mock';

export const PESSOAS_SEED: Pessoa[] = [];
