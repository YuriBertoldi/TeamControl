/**
 * Testes da leitura das planilhas.
 *
 * O que protegem é a honestidade da importação: uma linha recusada precisa
 * dizer QUAL linha e POR QUÊ. Importação que grava 40 de 50 e devolve "ok" é
 * pior que uma que falha — as 10 ausentes só aparecem quando alguém procura
 * por elas, meses depois.
 */

import { describe, it, expect, vi } from 'vitest';

// O cadastro de pessoas mora no localStorage e é lido em tempo de módulo. Em
// teste ele vem vazio, e sem isto toda linha seria recusada por "pessoa não
// existe" — escondendo as validações que se quer verificar aqui.
vi.mock('./mock', () => ({
  PESSOAS: [{ slug: 'abner', nome: 'Abner Exemplo', familia: 'Desenvolvimento' }],
  souMeus: () => [{ slug: 'abner', nome: 'Abner Exemplo', familia: 'Desenvolvimento' }],
}));
import { gerarCSV } from './planilha';
import { lerSkills, lerTrilha, MODELOS, modeloDe } from './modelos';

const COLS = ['pessoa', 'nome', 'skill', 'skill_nome', 'nivel', 'interesse', 'observacao'];

/** Monta uma planilha de skills com o cabeçalho real do modelo. */
const csvSkills = (linhas: (string | number)[][]) => gerarCSV(COLS, linhas);

describe('lerSkills', () => {
  it('ignora linha sem nível sem chamar de problema', () => {
    // O modelo vem com TODAS as combinações pessoa × skill e ninguém preenche
    // todas de uma vez. Reclamar disso devolveria centenas de "problemas" que
    // não são problema nenhum, e o ruído esconderia os erros de verdade.
    const r = lerSkills(csvSkills([
      ['abner', 'A', 'go.idiomatico', 'Go', '', '', ''],
      ['abner', 'A', 'dados.sql', 'SQL', '', '', ''],
    ]), 'coordenador');
    expect(r.itens).toHaveLength(0);
    expect(r.problemas).toHaveLength(0);
    expect(r.ignoradas).toBe(2);
  });

  it('recusa nível fora da escala, citando a linha', () => {
    const r = lerSkills(csvSkills([['abner', 'A', 'go.idiomatico', 'Go', '9', '', '']]),
      'coordenador');
    expect(r.itens).toHaveLength(0);
    // Linha 2: o cabeçalho é a 1, e é assim que o Excel numera.
    expect(r.problemas[0]).toContain('linha 2');
    expect(r.problemas[0]).toContain('0–4');
  });

  it('recusa interesse fora da escala', () => {
    const r = lerSkills(csvSkills([['abner', 'A', 'go.idiomatico', 'Go', '2', '7', '']]),
      'coordenador');
    expect(r.itens).toHaveLength(0);
    expect(r.problemas[0]).toContain('0–3');
  });

  it('recusa pessoa que não está no cadastro', () => {
    // Sem esta trava a linha iria ao backend e voltaria recusada lá, depois de
    // o usuário já ter clicado em gravar — tarde demais para corrigir no Excel.
    const r = lerSkills(csvSkills([['fulano-zzz', 'F', 'go.idiomatico', 'Go', '2', '', '']]),
      'coordenador');
    expect(r.itens).toHaveLength(0);
    expect(r.problemas[0]).toContain('não está no cadastro');
  });

  it('avisa quando falta coluna obrigatória, em vez de ler errado', () => {
    const r = lerSkills(gerarCSV(['pessoa', 'skill'], [['abner', 'go.idiomatico']]),
      'coordenador');
    expect(r.problemas[0]).toContain('nivel');
  });

  it('carimba a origem que foi pedida', () => {
    // É o que mantém a leitura do líder e a autoavaliação coexistindo. Sem a
    // origem certa, uma sobrescreveria a outra e o gap desapareceria.
    const linhas = [['abner', 'A', 'go.idiomatico', 'Go', '2', '', '']];
    expect(lerSkills(csvSkills(linhas), 'coordenador').itens[0]?.origem).toBe('coordenador');
    expect(lerSkills(csvSkills(linhas), 'autoavaliacao').itens[0]?.origem).toBe('autoavaliacao');
  });

  it('aceita a coluna fora de ordem', () => {
    // Quem preenche no Excel reordena coluna sem perceber.
    const csv = gerarCSV(['nivel', 'skill', 'pessoa'], [['3', 'go.idiomatico', 'abner']]);
    const r = lerSkills(csv, 'coordenador');
    expect(r.itens[0]?.nivel).toBe(3);
    expect(r.itens[0]?.skill).toBe('go.idiomatico');
  });

  it('avisa quando o arquivo só tem cabeçalho', () => {
    expect(lerSkills(csvSkills([]), 'coordenador').problemas).toHaveLength(1);
  });
});

describe('lerTrilha', () => {
  const COLS_T = ['pessoa', 'nome', 'criterio_id', 'nivel', 'descricao',
    'artefato', 'atendido_em', 'evidencia', 'nota'];

  it('recusa critério atendido sem evidência', () => {
    // A trava central da trilha: critério sem artefato não é verificável, e
    // critério não verificável vira avaliação de simpatia.
    const r = lerTrilha(gerarCSV(COLS_T,
      [['abner', 'A', '1', 'N1', 'desc', 'art', '2026-03-01', '', '']]));
    expect(r.itens).toHaveLength(0);
    expect(r.problemas[0]).toContain('evidência');
  });

  it('recusa data em formato errado', () => {
    const r = lerTrilha(gerarCSV(COLS_T,
      [['abner', 'A', '1', 'N1', 'desc', 'art', '01/03/2026', 'PR #12', '']]));
    expect(r.problemas[0]).toContain('AAAA-MM-DD');
  });

  it('ignora o que ainda não foi atendido', () => {
    const r = lerTrilha(gerarCSV(COLS_T,
      [['abner', 'A', '1', 'N1', 'desc', 'art', '', '', '']]));
    expect(r.ignoradas).toBe(1);
    expect(r.problemas).toHaveLength(0);
  });

  it('aceita a linha completa', () => {
    const r = lerTrilha(gerarCSV(COLS_T,
      [['abner', 'A', '7', 'N2', 'desc', 'art', '2026-03-01', 'PR #12 mesclado', 'ok']]));
    expect(r.itens).toEqual([{ pessoa: 'abner', criterioId: 7,
      atendidoEm: '2026-03-01', evidencia: 'PR #12 mesclado', nota: 'ok' }]);
  });
});

describe('catálogo de modelos', () => {
  it('todo modelo tem arquivo, colunas e instrução de uso', () => {
    // O modelo sem instrução volta preenchido de um jeito diferente por cada
    // pessoa, e a importação vira adivinhação.
    MODELOS.forEach((m) => {
      expect(m.arquivo).toMatch(/\.csv$/);
      expect(m.colunas.length).toBeGreaterThan(2);
      expect(m.comoUsar.length).toBeGreaterThan(20);
      expect(modeloDe(m.tipo)).toBe(m);
    });
  });

  it('skills e autoavaliação compartilham o formato', () => {
    // Têm que ser o mesmo arquivo: a pessoa preenche a própria coluna e você
    // importa com a outra origem. Formatos diferentes criariam dois parsers.
    expect(modeloDe('skills')!.colunas).toEqual(modeloDe('autoavaliacao')!.colunas);
  });
});
