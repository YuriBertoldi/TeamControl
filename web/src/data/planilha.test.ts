/**
 * Testes do motor de planilha.
 *
 * O que estes testes protegem é o caminho de volta: um arquivo que o Excel
 * salvou e que a importação precisa ler sem deformar nome de pessoa — porque
 * nome deformado não casa com o cadastro, e a linha é recusada em silêncio.
 */

import { describe, it, expect } from 'vitest';
import { gerarCSV, lerCSV, indicesDe } from './planilha';

describe('gerarCSV', () => {
  it('começa com BOM, para o Excel não ler como Latin-1', () => {
    // Sem o BOM, "João" vira "JoÃ£o" e o nome deixa de casar com o cadastro.
    expect(gerarCSV(['nome'], [['João']]).charCodeAt(0)).toBe(0xfeff);
  });

  it('separa por ponto e vírgula', () => {
    // O Excel em pt-BR usa vírgula como decimal: um CSV com vírgula cai todo
    // numa coluna só.
    const csv = gerarCSV(['a', 'b'], [['1', '2']]);
    expect(csv).toContain('a;b');
    expect(csv).toContain('1;2');
  });

  it('só põe aspas no campo que precisa', () => {
    const csv = gerarCSV(['t'], [['sem nada'], ['com; separador'], ['com "aspas"']]);
    expect(csv).toContain('sem nada');
    expect(csv).toContain('"com; separador"');
    expect(csv).toContain('"com ""aspas"""');
  });

  it('termina as linhas com CRLF', () => {
    expect(gerarCSV(['a'], [['x']])).toContain('a\r\nx\r\n');
  });
});

describe('lerCSV', () => {
  it('faz a volta do que gerou', () => {
    const linhas = [['Ana', '3', 'texto com; ponto e vírgula'], ['João', '0', 'com "aspas"']];
    expect(lerCSV(gerarCSV(['nome', 'nivel', 'obs'], linhas)))
      .toEqual([['nome', 'nivel', 'obs'], ...linhas]);
  });

  it('aceita vírgula, que é o que o Google Sheets exporta', () => {
    expect(lerCSV('nome,nivel\nAna,3')).toEqual([['nome', 'nivel'], ['Ana', '3']]);
  });

  it('não parte a linha dentro de um campo entre aspas', () => {
    // Descrição de critério de trilha tem ponto e vírgula e quebra de linha o
    // tempo todo. Um split ingênuo gravaria metade de uma frase como registro.
    const r = lerCSV('a;b\n"linha 1\nlinha 2";x');
    expect(r).toHaveLength(2);
    expect(r[1][0]).toBe('linha 1\nlinha 2');
    expect(r[1][1]).toBe('x');
  });

  it('ignora linha em branco no fim do arquivo', () => {
    expect(lerCSV('a;b\n1;2\n\n\n')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('aceita CRLF e LF', () => {
    expect(lerCSV('a;b\r\n1;2')).toEqual(lerCSV('a;b\n1;2'));
  });
});

describe('indicesDe', () => {
  it('casa por nome, não por posição', () => {
    // Quem preenche no Excel reordena coluna sem perceber. Importar por
    // posição gravaria nível no campo de interesse sem nada reclamar.
    const i = indicesDe(['interesse', 'pessoa', 'nivel'], ['pessoa', 'nivel', 'interesse']);
    expect(i).toEqual({ pessoa: 1, nivel: 2, interesse: 0 });
  });

  it('ignora acento, caixa e espaço em volta', () => {
    const i = indicesDe(['  Nível ', 'PESSOA'], ['nivel', 'pessoa']);
    expect(i).toEqual({ nivel: 0, pessoa: 1 });
  });

  it('devolve -1 para coluna que falta, em vez de casar com a errada', () => {
    expect(indicesDe(['pessoa'], ['pessoa', 'nivel']).nivel).toBe(-1);
  });
});
