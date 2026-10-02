/**
 * Migração das chaves do `localStorage`.
 *
 * O projeto foi renomeado e, com ele, o prefixo das chaves. Sem migração,
 * quem já usava o sistema abriria a tela e encontraria tudo de volta no seed:
 * pessoas cadastradas, ciclos ajustados, leituras de DNA — sumindo sem erro
 * nenhum. É o pior tipo de perda, porque parece que nunca existiu.
 *
 * Estes testes travam a migração. Podem ser removidos quando não restar
 * nenhum navegador com o prefixo antigo — mas não antes.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ler, escrever, remover, lerJSON, escreverJSON, chave } from './armazenamento';
import { carregarPessoas, carregarCargos, carregarTribos } from './cadastro';
import { carregarCiclos, cicloSelecionado } from './ciclos';
import { carregarDNA } from './dna';

const ANTIGO = (nome: string) => `timebertoldi.${nome}`;

beforeEach(() => { localStorage.clear(); });

describe('chaves', () => {
  it('usa o prefixo novo', () => {
    expect(chave('pessoas')).toBe('teamcontrol.pessoas');
  });
});

describe('migração do prefixo antigo', () => {
  it('lê o valor gravado sob o nome antigo', () => {
    localStorage.setItem(ANTIGO('config'), '{"cadenciaDias":45}');
    expect(ler('config')).toBe('{"cadenciaDias":45}');
  });

  it('copia para a chave nova e apaga a antiga — migra uma vez só', () => {
    localStorage.setItem(ANTIGO('config'), 'valor');
    ler('config');

    expect(localStorage.getItem(chave('config'))).toBe('valor');
    expect(localStorage.getItem(ANTIGO('config'))).toBeNull();
  });

  it('a chave nova vence a antiga quando as duas existem', () => {
    // Cenário real: a pessoa usou a versão nova, salvou, e um resquício da
    // antiga continuou no navegador. O que ela salvou por último é o que vale.
    localStorage.setItem(ANTIGO('config'), 'antigo');
    localStorage.setItem(chave('config'), 'novo');
    expect(ler('config')).toBe('novo');
  });

  it('sem nenhuma das duas, devolve null', () => {
    expect(ler('config')).toBeNull();
  });

  it('remover limpa os dois prefixos', () => {
    localStorage.setItem(ANTIGO('pessoas'), 'a');
    localStorage.setItem(chave('pessoas'), 'b');
    remover('pessoas');

    expect(localStorage.getItem(ANTIGO('pessoas'))).toBeNull();
    expect(localStorage.getItem(chave('pessoas'))).toBeNull();
  });

  it('escrever grava só no prefixo novo', () => {
    escrever('dna', 'x');
    expect(localStorage.getItem(chave('dna'))).toBe('x');
    expect(localStorage.getItem(ANTIGO('dna'))).toBeNull();
  });
});

describe('lerJSON', () => {
  it('desserializa o que foi gravado', () => {
    escreverJSON('ciclos', [{ id: 'a' }]);
    expect(lerJSON('ciclos', [])).toEqual([{ id: 'a' }]);
  });

  it('cai no padrão quando não há nada', () => {
    expect(lerJSON('ciclos', ['padrao'])).toEqual(['padrao']);
  });

  it('cai no padrão com JSON corrompido, em vez de derrubar a tela', () => {
    localStorage.setItem(chave('ciclos'), '{ truncado');
    expect(lerJSON('ciclos', ['padrao'])).toEqual(['padrao']);
  });

  it('migra e desserializa numa tacada só', () => {
    localStorage.setItem(ANTIGO('ciclos'), '[{"id":"avd-2026"}]');
    expect(lerJSON('ciclos', [])).toEqual([{ id: 'avd-2026' }]);
    expect(localStorage.getItem(ANTIGO('ciclos'))).toBeNull();
  });
});

describe('dados reais sobrevivem à troca de nome', () => {
  it('pessoas cadastradas na versão antiga continuam lá', () => {
    const minhas = [{ slug: 'alguem', nome: 'Alguém Cadastrado' }];
    localStorage.setItem(ANTIGO('pessoas'), JSON.stringify(minhas));

    const lidas = carregarPessoas();
    expect(lidas).toHaveLength(1);
    expect(lidas[0].nome).toBe('Alguém Cadastrado');
  });

  it('cargos, tribos, ciclos e DNA também', () => {
    localStorage.setItem(ANTIGO('cargos'), JSON.stringify([{ id: 'x', nome: 'Meu Cargo' }]));
    localStorage.setItem(ANTIGO('tribos'), JSON.stringify([{ id: 't', nome: 'Minha Tribo' }]));
    localStorage.setItem(ANTIGO('ciclos'), JSON.stringify([{ id: 'c', nome: 'Meu Ciclo' }]));
    localStorage.setItem(ANTIGO('dna'), JSON.stringify([{ slug: 'alguem', data: '2026-01-01' }]));

    expect(carregarCargos()[0].nome).toBe('Meu Cargo');
    expect(carregarTribos()[0].nome).toBe('Minha Tribo');
    expect(carregarCiclos()[0].nome).toBe('Meu Ciclo');
    expect(carregarDNA()[0].slug).toBe('alguem');
  });

  it('o ciclo que estava selecionado continua selecionado', () => {
    localStorage.setItem(ANTIGO('ciclos'),
      JSON.stringify([{ id: 'a', status: 'fechado' }, { id: 'b', status: 'calibragem' }]));
    localStorage.setItem(ANTIGO('cicloSelecionado'), 'a');

    expect(cicloSelecionado().id).toBe('a');
  });
});
