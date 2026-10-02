/**
 * Ciclos de AVD.
 *
 * O que está em jogo aqui é a comparabilidade entre ciclos. Escala, faixas e
 * drivers são DADOS do ciclo justamente porque mudam: uma nota 3,5 não quer
 * dizer o mesmo em dois ciclos se a escala mudou. Se o encerramento parar de
 * congelar, a trajetória de uma pessoa ao longo dos anos passa a comparar
 * coisas diferentes sem avisar.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  carregarCiclos, salvarCiclos, restaurarCiclos, cicloNovo, cicloVigente,
  cicloSelecionado, selecionarCiclo, encerrarCiclo, reabrirCiclo, somenteLeitura,
  faixaDe, CICLOS_SEED, STATUS_CICLO,
} from './ciclos';

beforeEach(() => { localStorage.clear(); });

describe('carregar e salvar', () => {
  it('sem nada salvo, devolve o seed', () => {
    expect(carregarCiclos().map((c) => c.id))
      .toEqual(CICLOS_SEED.map((c) => c.id));
  });

  it('o que foi salvo vence o seed', () => {
    const nova = [{ ...CICLOS_SEED[0], nome: 'Renomeado' }];
    salvarCiclos(nova);
    expect(carregarCiclos()[0].nome).toBe('Renomeado');
  });

  it('restaurar volta ao seed e limpa o armazenamento', () => {
    salvarCiclos([{ ...CICLOS_SEED[0], nome: 'Renomeado' }]);
    expect(restaurarCiclos().map((c) => c.id)).toEqual(CICLOS_SEED.map((c) => c.id));
    expect(carregarCiclos()[0].nome).toBe(CICLOS_SEED[0].nome);
  });

  it('armazenamento corrompido não derruba a tela', () => {
    localStorage.setItem('teamcontrol.ciclos', 'nao é json');
    expect(carregarCiclos()).toHaveLength(CICLOS_SEED.length);
  });
});

describe('cicloVigente', () => {
  it('prefere o ciclo em coleta ou calibragem', () => {
    expect(['coleta', 'calibragem']).toContain(cicloVigente().status);
  });

  it('cai no planejado quando não há ciclo aberto', () => {
    salvarCiclos([
      { ...CICLOS_SEED[0], status: 'fechado' },
      { ...CICLOS_SEED[1], status: 'planejado' },
    ]);
    expect(cicloVigente().status).toBe('planejado');
  });

  it('com tudo fechado, ainda devolve algum ciclo em vez de undefined', () => {
    salvarCiclos(CICLOS_SEED.map((c) => ({ ...c, status: 'fechado' as const })));
    expect(cicloVigente()).toBeDefined();
    expect(cicloVigente().id).toBe(CICLOS_SEED[0].id);
  });
});

describe('ciclo selecionado — compartilhado pelo módulo', () => {
  it('sem escolha explícita, segue o vigente', () => {
    expect(cicloSelecionado().id).toBe(cicloVigente().id);
  });

  it('a escolha persiste entre telas', () => {
    const outro = CICLOS_SEED[1];
    selecionarCiclo(outro.id);
    // Simula outra rota montando depois: lê do zero, não de estado em memória.
    expect(cicloSelecionado().id).toBe(outro.id);
  });

  it('escolha apontando para ciclo que sumiu cai no vigente', () => {
    selecionarCiclo('ciclo-que-nao-existe');
    expect(cicloSelecionado().id).toBe(cicloVigente().id);
  });
});

describe('encerrar e reabrir', () => {
  it('encerrar marca fechado e carimba a data, sem remover o ciclo', () => {
    const antes = carregarCiclos().length;
    const nova = encerrarCiclo(CICLOS_SEED[0].id);

    expect(nova).toHaveLength(antes);
    const c = nova.find((x) => x.id === CICLOS_SEED[0].id)!;
    expect(c.status).toBe('fechado');
    expect(c.encerradoEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(somenteLeitura(c)).toBe(true);
  });

  it('encerrar preserva drivers, escala, faixas e perguntas', () => {
    const original = CICLOS_SEED[0];
    const c = encerrarCiclo(original.id).find((x) => x.id === original.id)!;

    expect(c.driversComportamento).toEqual(original.driversComportamento);
    expect(c.driversDesempenho).toEqual(original.driversDesempenho);
    expect(c.faixas).toEqual(original.faixas);
    expect(c.escalaMin).toBe(original.escalaMin);
    expect(c.escalaMax).toBe(original.escalaMax);
    expect(c.perguntas).toEqual(original.perguntas);
  });

  it('encerrar persiste — não é só estado de tela', () => {
    encerrarCiclo(CICLOS_SEED[0].id);
    expect(carregarCiclos().find((c) => c.id === CICLOS_SEED[0].id)!.status)
      .toBe('fechado');
  });

  it('não mexe nos outros ciclos', () => {
    const nova = encerrarCiclo(CICLOS_SEED[0].id);
    const outro = nova.find((c) => c.id === CICLOS_SEED[1].id)!;
    expect(outro.status).toBe(CICLOS_SEED[1].status);
    expect(outro.encerradoEm).toBeUndefined();
  });

  it('reabrir devolve à calibragem e limpa a data de encerramento', () => {
    encerrarCiclo(CICLOS_SEED[0].id);
    const c = reabrirCiclo(CICLOS_SEED[0].id).find((x) => x.id === CICLOS_SEED[0].id)!;

    expect(c.status).toBe('calibragem');
    expect(c.encerradoEm).toBeUndefined();
    expect(somenteLeitura(c)).toBe(false);
  });

  it('só o status fechado trava a edição', () => {
    for (const s of STATUS_CICLO) {
      const c = { ...CICLOS_SEED[0], status: s.valor };
      expect(somenteLeitura(c), s.valor).toBe(s.valor === 'fechado');
    }
  });
});

describe('cicloNovo', () => {
  it('herda drivers e escala do modelo', () => {
    const modelo = CICLOS_SEED[0];
    const novo = cicloNovo('AVD 2028', modelo);

    expect(novo.driversComportamento).toEqual(modelo.driversComportamento);
    expect(novo.driversDesempenho).toEqual(modelo.driversDesempenho);
    expect(novo.faixas).toEqual(modelo.faixas);
    expect(novo.rotulosEscala).toEqual(modelo.rotulosEscala);
  });

  it('NÃO herda as perguntas abertas', () => {
    // Perguntas mudam a cada ciclo. Copiá-las daria a falsa impressão de que
    // já foram conferidas contra a portal de avaliação — e você responderia a pergunta
    // do ciclo passado achando que era a deste.
    const modelo = { ...CICLOS_SEED[0] };
    expect(modelo.perguntas.length).toBeGreaterThan(0);
    expect(cicloNovo('AVD 2028', modelo).perguntas).toEqual([]);
  });

  it('nasce planejado e com id próprio', () => {
    const novo = cicloNovo('AVD 2028', CICLOS_SEED[0]);
    expect(novo.status).toBe('planejado');
    expect(novo.id).not.toBe(CICLOS_SEED[0].id);
    expect(novo.nome).toBe('AVD 2028');
    expect(novo.encerradoEm).toBeUndefined();
  });
});

describe('faixaDe', () => {
  const ciclo = CICLOS_SEED[0];

  it('classifica nas faixas do ciclo, não em constantes', () => {
    expect(faixaDe(ciclo, 1.0)?.rotulo).toBe('Baixo');
    expect(faixaDe(ciclo, 2.4)?.rotulo).toBe('Baixo');
    expect(faixaDe(ciclo, 2.5)?.rotulo).toBe('Médio');
    expect(faixaDe(ciclo, 3.5)?.rotulo).toBe('Médio');
    expect(faixaDe(ciclo, 3.6)?.rotulo).toBe('Alto');
    expect(faixaDe(ciclo, 4.0)?.rotulo).toBe('Alto');
  });

  it('as faixas não se sobrepõem nem deixam buraco dentro da escala', () => {
    for (let n = ciclo.escalaMin; n <= ciclo.escalaMax; n += 0.1) {
      const nota = Math.round(n * 10) / 10;
      const cobrem = ciclo.faixas.filter((f) => nota >= f.min && nota <= f.max);
      expect(cobrem.length, `nota ${nota}`).toBe(1);
    }
  });

  it('nota fora da escala não casa com faixa nenhuma', () => {
    expect(faixaDe(ciclo, 0)).toBeUndefined();
    expect(faixaDe(ciclo, 5)).toBeUndefined();
  });

  it('um ciclo com outra escala classifica por ELA, não pela do seed', () => {
    const outro = {
      ...ciclo,
      escalaMin: 1, escalaMax: 5,
      faixas: [
        { rotulo: 'Abaixo', min: 1, max: 2.9, cor: 'red' as const },
        { rotulo: 'Dentro', min: 3, max: 5, cor: 'green' as const },
      ],
    };
    expect(faixaDe(outro, 3.5)?.rotulo).toBe('Dentro');
    // A mesma nota é "Médio" no ciclo original — é esta a razão de a escala
    // viajar junto com as notas.
    expect(faixaDe(ciclo, 3.5)?.rotulo).toBe('Médio');
  });
});
