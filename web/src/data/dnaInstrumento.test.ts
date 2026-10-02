/**
 * Invariantes do instrumento de DNA Motivacional.
 *
 * Este arquivo é gerado de uma planilha (`scripts/gerar-dna.cjs`). Testar um
 * arquivo gerado parece redundante até você lembrar que a planilha muda: basta
 * alguém corrigir um enunciado, acrescentar um par ou reordenar uma coluna
 * para o código de três letras sair errado **em silêncio** — sem erro de
 * compilação, sem exceção, só um perfil trocado.
 *
 * O caso mais caro é o dos pares 3 e 9: na planilha modelo a afirmativa de
 * recompensa externa está lançada na coluna de Estabilidade. O gerador corrige,
 * e os testes abaixo travam a correção. Se alguém regenerar sem ela, a
 * distribuição deixa de ser 7/7/7 e o teste quebra na hora.
 */

import { describe, it, expect } from 'vitest';
import { PARES, PERFIS, EIXOS, ROTULO_POLO, type Polo } from './dnaInstrumento';

const EIXO_DO_POLO = new Map<Polo, string>(
  EIXOS.flatMap((e) => e.polos.map((p) => [p, e.id] as const)));

describe('instrumento', () => {
  it('tem exatamente 21 pares, numerados de 1 a 21 sem buraco', () => {
    expect(PARES).toHaveLength(21);
    expect(PARES.map((p) => p.n)).toEqual(
      Array.from({ length: 21 }, (_, i) => i + 1));
  });

  it('cada par oferece duas alternativas, e só duas', () => {
    for (const par of PARES) {
      expect(par.opcoes, `par ${par.n}`).toHaveLength(2);
    }
  });

  it('nenhum par é cruzado entre eixos', () => {
    // Um par que ofereça Estabilidade contra Interioridade não mede nada:
    // a escolha some de um eixo e aparece no outro.
    for (const par of PARES) {
      const eixos = new Set(par.opcoes.map((o) => EIXO_DO_POLO.get(o.polo)));
      expect(eixos.size, `par ${par.n} mistura ${[...eixos].join(' e ')}`).toBe(1);
    }
  });

  it('cada par opõe os DOIS polos do mesmo eixo, não o mesmo polo duas vezes', () => {
    for (const par of PARES) {
      const [a, b] = par.opcoes;
      expect(a.polo, `par ${par.n}`).not.toBe(b.polo);
    }
  });

  it('distribui 7 pares para cada um dos três eixos', () => {
    const porEixo: Record<string, number> = {};
    for (const par of PARES) {
      const eixo = EIXO_DO_POLO.get(par.opcoes[0].polo)!;
      porEixo[eixo] = (porEixo[eixo] ?? 0) + 1;
    }
    expect(porEixo).toEqual({ impulso: 7, necessidade: 7, premio: 7 });
  });

  it('mantém a correção dos pares 3 e 9 (recompensa externa é Exterioridade)', () => {
    for (const n of [3, 9]) {
      const par = PARES.find((p) => p.n === n)!;
      const polos = par.opcoes.map((o) => o.polo).sort();
      expect(polos, `par ${n} voltou ao erro da planilha`)
        .toEqual(['exterioridade', 'interioridade']);
    }
  });

  it('não tem enunciado vazio nem duplicado', () => {
    const textos = PARES.flatMap((p) => p.opcoes.map((o) => o.texto));
    expect(textos).toHaveLength(42);
    for (const t of textos) expect(t.length).toBeGreaterThan(10);
    expect(new Set(textos).size).toBe(42);
  });
});

describe('perfis', () => {
  it('cobre as 8 combinações possíveis dos três eixos binários', () => {
    expect(PERFIS).toHaveLength(8);

    const esperados = new Set<string>();
    for (const a of EIXOS[0].letras) {
      for (const b of EIXOS[1].letras) {
        for (const c of EIXOS[2].letras) esperados.add(a + b + c);
      }
    }
    expect(new Set(PERFIS.map((p) => p.codigo))).toEqual(esperados);
  });

  it('todo perfil tem nome, descrição, motivadores, desmotivadores e dicas', () => {
    for (const p of PERFIS) {
      expect(p.nome, p.codigo).toBeTruthy();
      expect(p.descricao.length, p.codigo).toBeGreaterThan(100);
      expect(p.motivadores.length, p.codigo).toBeGreaterThan(0);
      expect(p.desmotivadores.length, p.codigo).toBeGreaterThan(0);
      expect(p.dicas.length, p.codigo).toBeGreaterThan(0);
    }
  });

  it('não repete a linha "Seu tipo de DNA Motivacional é X" na descrição', () => {
    // O gerador corta essa primeira linha porque ela é redundante com o
    // cabeçalho do card. Se voltar, o card passa a dizer a mesma coisa duas vezes.
    for (const p of PERFIS) {
      expect(p.descricao, p.codigo).not.toMatch(/Seu tipo de DNA Motivacional/i);
    }
  });
});

describe('eixos', () => {
  it('tem três eixos, cada um com dois polos e duas letras', () => {
    expect(EIXOS).toHaveLength(3);
    for (const e of EIXOS) {
      expect(e.polos).toHaveLength(2);
      expect(e.letras).toHaveLength(2);
      expect(e.letras[0]).not.toBe(e.letras[1]);
    }
  });

  it('todo polo tem rótulo legível', () => {
    for (const e of EIXOS) {
      for (const polo of e.polos) {
        expect(ROTULO_POLO[polo], polo).toBeTruthy();
      }
    }
  });

  it('a letra E aparece em dois eixos — é por isso que o código é posicional', () => {
    // Não é defeito: Estabilidade na 2ª posição e Exterioridade na 3ª. O teste
    // existe para documentar a armadilha e impedir que alguém "conserte"
    // trocando uma das letras e invalidando os códigos já gravados.
    const todas = EIXOS.flatMap((e) => e.letras);
    expect(todas.filter((l) => l === 'E')).toHaveLength(2);
  });
});
