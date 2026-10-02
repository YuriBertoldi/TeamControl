/**
 * Cadastro de pessoas, tribos e cargos.
 *
 * Duas regras aqui não são preferência, são estrutura:
 *
 * 1. **Nada é apagado.** Sair da gestão, afastar e desligar são mudanças de
 *    status, porque 1:1s, evidências e avaliações continuam valendo depois —
 *    é o lastro que sustenta a calibragem do ciclo em andamento.
 * 2. **O cargo define as skills da cadeira.** Se `skillsDoCargo` passar a
 *    devolver o catálogo inteiro, a matriz volta a cobrar Robot Framework de
 *    dev e Delphi de QA, e o gap deixa de significar qualquer coisa.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  carregarPessoas, salvarPessoas, restaurarPessoas, pessoaNova, slugDe,
  carregarTribos, salvarTribos, restaurarTribos,
  carregarCargos, salvarCargos, restaurarCargos, cargoNovo, skillsDoCargo,
  CARGOS_SEED, STATUS_PESSOA,
} from './cadastro';
import { PESSOAS_SEED } from './pessoas';

beforeEach(() => { localStorage.clear(); });

describe('slugDe', () => {
  it('normaliza acento, caixa e espaço', () => {
    expect(slugDe('João Néri', [])).toBe('joao-neri');
    expect(slugDe('Ítalo Sá', [])).toBe('italo-sa');
    expect(slugDe('  Ana   Paula  ', [])).toBe('ana-paula');
  });

  it('não colide com slug existente', () => {
    expect(slugDe('Ana Paula', ['ana-paula'])).toBe('ana-paula-2');
    expect(slugDe('Ana Paula', ['ana-paula', 'ana-paula-2'])).toBe('ana-paula-3');
  });

  it('descarta pontuação em vez de produzir slug quebrado', () => {
    expect(slugDe('José (QA)', [])).toBe('jose-qa');
    expect(slugDe('D\'Ávila', [])).toBe('d-avila');
  });
});

describe('pessoaNova', () => {
  it('entra ativa e inelegível, com o motivo declarado', () => {
    const p = pessoaNova('Mariana Prado', []);
    expect(p.status).toBe('ativo');
    expect(p.elegivel).toBe(false);
    expect(p.motivoInelegivel).toMatch(/6 meses/i);
  });

  it('admissão e última 1:1 nascem hoje, não vazias', () => {
    const hoje = new Date().toISOString().slice(0, 10);
    const p = pessoaNova('Mariana Prado', []);
    expect(p.admissao).toBe(hoje);
    expect(p.ultima1a1).toBe(hoje);
  });

  it('não nasce com salário — é campo que você preenche conscientemente', () => {
    const p = pessoaNova('Mariana Prado', []);
    expect(p.salario).toBeUndefined();
    expect(p.ultimoReajuste).toBeUndefined();
  });
});

describe('status de pessoa', () => {
  it('oferece exatamente os quatro status, e nenhum deles é "excluir"', () => {
    expect(STATUS_PESSOA.map((s) => s.valor))
      .toEqual(['ativo', 'afastado', 'fora_gestao', 'desligado']);
    for (const s of STATUS_PESSOA) {
      expect(s.rotulo).toBeTruthy();
      expect(s.descricao.length).toBeGreaterThan(20);
    }
  });

  it('mudar status preserva a pessoa e o histórico', () => {
    // A regra estrutural do cadastro: desligar não apaga. Avaliação mensal e
    // quadrante continuam lá, porque é o lastro da calibragem do ciclo.
    const alvo = {
      ...pessoaNova('Fulano de Tal', []),
      trajetoria: ['S', 'E'] as ('S' | 'E')[],
      quadrante: 'Estrela',
    };
    salvarPessoas([alvo]);
    salvarPessoas(carregarPessoas().map((p) => ({ ...p, status: 'desligado' as const })));

    const depois = carregarPessoas();
    expect(depois).toHaveLength(1);
    expect(depois[0].status).toBe('desligado');
    expect(depois[0].trajetoria).toEqual(['S', 'E']);
    expect(depois[0].quadrante).toBe('Estrela');
  });

  it('restaurar devolve o seed, que nasce vazio', () => {
    salvarPessoas([pessoaNova('Fulano de Tal', [])]);
    expect(carregarPessoas()).toHaveLength(1);
    expect(restaurarPessoas()).toEqual(PESSOAS_SEED);
    expect(carregarPessoas()).toEqual(PESSOAS_SEED);
  });

  it('armazenamento corrompido cai no seed em vez de derrubar a tela', () => {
    localStorage.setItem('teamcontrol.pessoas', '[[[');
    expect(carregarPessoas()).toEqual(PESSOAS_SEED);
  });
});

describe('tribos', () => {
  it('aceita tribo nova com id livre', () => {
    const lista = carregarTribos();
    salvarTribos([...lista, {
      id: 'tribo-nova', nome: 'Conta Corrente', cor: 'teal', produto: 'Fiscal',
      portalId: '', coordenacao: ['Coordenação'], gerencia: [],
    }]);
    expect(carregarTribos()).toHaveLength(lista.length + 1);
    expect(carregarTribos().at(-1)!.id).toBe('tribo-nova');
  });

  it('restaurar devolve o seed, que nasce vazio', () => {
    // O sistema sobe sem organização cadastrada. Restaurar devolve o vazio,
    // não uma estrutura de exemplo que precisaria ser apagada antes do uso.
    salvarTribos([{ id: 't', nome: 'Alguma', cor: 'blue', produto: '',
                    portalId: '', coordenacao: [], gerencia: [] }]);
    expect(carregarTribos()).toHaveLength(1);
    expect(restaurarTribos()).toEqual([]);
    expect(carregarTribos()).toEqual([]);
  });
});

describe('cargos e skills da cadeira', () => {
  it('todo cargo do seed tem skills vinculadas', () => {
    for (const c of CARGOS_SEED) {
      expect(c.skills.length, c.nome).toBeGreaterThan(0);
      for (const s of c.skills) {
        expect(s.nivelEsperado, `${c.nome}/${s.codigo}`).toBeGreaterThanOrEqual(1);
        expect(s.nivelEsperado).toBeLessThanOrEqual(4);
      }
    }
  });

  it('nenhum cargo repete a mesma skill duas vezes', () => {
    for (const c of CARGOS_SEED) {
      const codigos = c.skills.map((s) => s.codigo);
      expect(new Set(codigos).size, c.nome).toBe(codigos.length);
    }
  });

  it('dev não é cobrado em Robot Framework e QA não é em Delphi', () => {
    // A razão de existir do cadastro de cargos. Se isto quebrar, a matriz
    // volta a produzir gap que não é gap.
    const dev = skillsDoCargo('Desenvolvedor Pleno').map((s) => s.codigo);
    const qa = skillsDoCargo('Analista de Testes Pleno').map((s) => s.codigo);

    expect(dev).not.toContain('qa.robot');
    expect(dev).toContain('delphi.vcl');
    expect(qa).not.toContain('delphi.vcl');
    expect(qa).toContain('qa.robot');
  });

  it('o sênior cobra mais que o pleno nas mesmas skills', () => {
    const pleno = new Map(skillsDoCargo('Desenvolvedor Pleno')
      .map((s) => [s.codigo, s.nivelEsperado]));
    const senior = new Map(skillsDoCargo('Desenvolvedor Sênior')
      .map((s) => [s.codigo, s.nivelEsperado]));

    for (const [codigo, nivel] of pleno) {
      expect(senior.get(codigo) ?? 0, codigo).toBeGreaterThanOrEqual(nivel);
    }
    // E cobra coisas que o pleno não cobra.
    expect([...senior.keys()]).toContain('lid.mentoria');
    expect([...pleno.keys()]).not.toContain('lid.mentoria');
  });

  it('o júnior nunca cai abaixo de 1 — senão "esperado" não quer dizer nada', () => {
    for (const s of skillsDoCargo('Desenvolvedor Júnior')) {
      expect(s.nivelEsperado, s.codigo).toBeGreaterThanOrEqual(1);
    }
  });

  it('Tech Lead vence o cargo: quem é TL é medido pela cadeira de TL', () => {
    const comoPleno = skillsDoCargo('Desenvolvedor Pleno', false);
    const comoTL = skillsDoCargo('Desenvolvedor Pleno', true);
    expect(comoTL).not.toEqual(comoPleno);
    expect(comoTL.map((s) => s.codigo)).toContain('lid.mentoria');
  });

  it('cargo desconhecido devolve lista vazia em vez de estourar', () => {
    expect(skillsDoCargo('Cargo Que Não Existe')).toEqual([]);
  });

  it('cargo novo nasce com as skills da família, não vazio', () => {
    // Cargo sem skill nenhuma não avalia ninguém, e preencher 12 linhas na
    // mão é o que faz o cadastro morrer no primeiro uso.
    const novo = cargoNovo('Analista de Testes Sênior', 'Testes / QA');
    expect(novo.skills.length).toBeGreaterThan(0);
    expect(novo.familia).toBe('Testes / QA');
    expect(novo.skills.map((s) => s.codigo)).toContain('qa.cenarios');
  });

  it('cargo novo não colide de id com os existentes', () => {
    const novo = cargoNovo('Desenvolvedor Pleno', 'Desenvolvimento');
    expect(CARGOS_SEED.map((c) => c.id)).not.toContain(novo.id);
  });

  it('salvar e restaurar funcionam', () => {
    salvarCargos([{ id: 'x', nome: 'Único', familia: 'Produto', skills: [] }]);
    expect(carregarCargos()).toHaveLength(1);
    expect(restaurarCargos()).toHaveLength(CARGOS_SEED.length);
  });
});
