/**
 * Datas, níveis e o motor de pauta.
 *
 * Aritmética de data é onde bug silencioso mora: `diasEntre` alimenta o alerta
 * de cadência, a elegibilidade ao ciclo e a ordenação do seletor de 1:1. Errar
 * por um dia não quebra nada visivelmente — só faz a pessoa certa não aparecer
 * na lista de quem está atrasado.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  diasEntre, mesesEntre, dataBR, moeda, nivelDe, ehNovo, timeDe, souMeus,
  montarPauta, PESSOAS, PAUTA, type Pessoa, type Assunto,
} from './mock';

const pessoa = (over: Partial<Pessoa> = {}): Pessoa => ({
  slug: 'teste', nome: 'Pessoa Teste', curto: 'Teste', time: 'pf',
  familia: 'Desenvolvimento', cargo: 'Desenvolvedor Pleno', techLead: false,
  admissao: '2024-01-01', status: 'ativo', elegivel: true,
  trajetoria: [], quadrante: null, ultima1a1: '2026-09-01', cadenciaDias: 60,
  ...over,
});

describe('diasEntre', () => {
  it('conta dias corridos entre duas datas ISO', () => {
    expect(diasEntre('2026-09-01', '2026-09-02')).toBe(1);
    expect(diasEntre('2026-09-01', '2026-10-01')).toBe(30);
    expect(diasEntre('2026-01-01', '2026-12-31')).toBe(364);
  });

  it('mesma data dá zero', () => {
    expect(diasEntre('2026-09-22', '2026-09-22')).toBe(0);
  });

  it('atravessa virada de ano', () => {
    expect(diasEntre('2025-12-31', '2026-01-01')).toBe(1);
  });

  it('atravessa 29 de fevereiro em ano bissexto', () => {
    // 2024 é bissexto: fev tem 29 dias.
    expect(diasEntre('2024-02-28', '2024-03-01')).toBe(2);
    // 2026 não é: fev tem 28.
    expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1);
  });

  it('data futura dá negativo, e é isso que distingue vencido de a vencer', () => {
    expect(diasEntre('2026-10-10', '2026-10-01')).toBe(-9);
  });
});

describe('mesesEntre', () => {
  it('conta meses inteiros, não dias divididos por 30', () => {
    expect(mesesEntre('2026-01-15', '2026-02-15')).toBe(1);
    expect(mesesEntre('2026-01-15', '2027-01-15')).toBe(12);
  });

  it('não conta o mês antes de completar o dia', () => {
    // Um dia antes do aniversário ainda são 11 meses, não 12.
    expect(mesesEntre('2026-01-15', '2027-01-14')).toBe(11);
    expect(mesesEntre('2026-01-15', '2026-02-14')).toBe(0);
  });

  it('é o que sustenta o alerta de 12 meses sem reajuste', () => {
    expect(mesesEntre('2025-10-01', '2026-10-01')).toBeGreaterThanOrEqual(12);
    expect(mesesEntre('2026-01-01', '2026-10-01')).toBeLessThan(12);
  });
});

describe('formatação', () => {
  it('dataBR inverte para dd/mm/aaaa', () => {
    expect(dataBR('2026-09-22')).toBe('22/09/2026');
  });

  it('dataBR aceita nulo sem quebrar a tela', () => {
    expect(dataBR(null)).toBeTruthy();
  });

  it('moeda formata em real sem centavos', () => {
    const v = moeda(12500);
    expect(v).toMatch(/R\$/);
    expect(v).toMatch(/12\.500/);
    expect(v).not.toMatch(/,\d\d/);
  });
});

describe('nivelDe', () => {
  it('Tech Lead vence a senioridade do cargo', () => {
    expect(nivelDe(pessoa({ cargo: 'Desenvolvedor Júnior', techLead: true })))
      .toBe('Tech Lead');
  });

  it('deriva do nome do cargo', () => {
    expect(nivelDe(pessoa({ cargo: 'Desenvolvedor Júnior' }))).toBe('Júnior');
    expect(nivelDe(pessoa({ cargo: 'Desenvolvedor Sênior' }))).toBe('Sênior');
    expect(nivelDe(pessoa({ cargo: 'Analista de Testes Especialista' })))
      .toBe('Especialista');
  });

  it('cargo sem marcador de nível é tratado como Pleno', () => {
    expect(nivelDe(pessoa({ cargo: 'Desenvolvedora Plena' }))).toBe('Pleno');
    expect(nivelDe(pessoa({ cargo: 'Analista' }))).toBe('Pleno');
  });
});

describe('ehNovo', () => {
  it('é novo até 120 dias de casa', () => {
    expect(ehNovo(pessoa({ admissao: '2026-09-01' }), '2026-10-01')).toBe(true);
    expect(ehNovo(pessoa({ admissao: '2026-06-01' }), '2026-10-01')).toBe(false);
  });

  it('o limite é inclusivo — 120 dias ainda é novo', () => {
    const p = pessoa({ admissao: '2026-06-03' });
    expect(diasEntre(p.admissao, '2026-10-01')).toBe(120);
    expect(ehNovo(p, '2026-10-01')).toBe(true);
  });
});

describe('timeDe', () => {
  it('resolve a tribo cadastrada', () => {
    expect(timeDe('pf').nome).toBeTruthy();
    expect(timeDe('qd').nome).toBeTruthy();
  });

  it('tribo inexistente devolve rótulo honesto em vez de quebrar', () => {
    // Tribo é cadastro: uma squad pode apontar para uma que foi removida.
    expect(timeDe('tribo-que-sumiu').nome).toBe('Sem tribo');
  });
});

describe('souMeus', () => {
  it('inclui ativos e afastados, exclui desligado e fora da gestão', () => {
    const meus = souMeus();
    for (const p of meus) {
      expect(['ativo', 'afastado'], p.slug).toContain(p.status);
    }
    const excluidos = PESSOAS.filter(
      (p) => p.status === 'desligado' || p.status === 'fora_gestao');
    for (const p of excluidos) {
      expect(meus.map((m) => m.slug)).not.toContain(p.slug);
    }
  });

  it('afastado continua na lista — o vínculo não acabou', () => {
    const afastados = PESSOAS.filter((p) => p.status === 'afastado');
    for (const p of afastados) {
      expect(souMeus().map((m) => m.slug)).toContain(p.slug);
    }
  });
});

describe('montarPauta — prioridade estrita e trava de equilíbrio', () => {
  // O sistema sobe sem pauta nenhuma. O motor é testado contra um cenário
  // montado aqui, que é o único jeito de forçar a situação que importa:
  // orçamento apertado com itens de prioridade alta competindo com a trava.
  const criar = (over: Partial<Assunto>): Assunto => ({
    id: 'x', prioridade: 'media', minutos: 10, categoria: 'Tema',
    origem: 'regra_ausencia', titulo: 'Assunto', porQueAgora: 'Motivo.',
    refs: [], pergunta: 'Pergunta?', porQueAssim: 'Porque sim.', toca: [],
    ...over,
  });

  const CENARIO: Assunto[] = [
    criar({ id: 'alta1', prioridade: 'alta', minutos: 12, categoria: 'Risco' }),
    criar({ id: 'alta2', prioridade: 'alta', minutos: 10, categoria: 'Compromisso meu' }),
    criar({ id: 'dev', prioridade: 'media', minutos: 8, categoria: 'Desenvolvimento' }),
    criar({ id: 'media1', prioridade: 'media', minutos: 7 }),
    criar({ id: 'baixa1', prioridade: 'baixa', minutos: 5 }),
    criar({ id: 'escuta', prioridade: 'escuta', minutos: 5, categoria: 'Escuta aberta' }),
  ];

  beforeEach(() => { PAUTA.teste = CENARIO; });
  afterEach(() => { delete PAUTA.teste; });

  it('respeita o orçamento de tempo', () => {
    for (const minutos of [30, 45, 60]) {
      const r = montarPauta('teste', minutos, new Set());
      expect(r.usado, String(minutos)).toBeLessThanOrEqual(r.orcamento);
      expect(r.orcamento).toBe(minutos);
    }
  });

  it('nunca corta item de prioridade alta para caber a trava', () => {
    // A regra mais importante do motor: a trava RESERVA espaço, não desloca.
    // Aos 30 min os dois itens alta somam 22 e têm que entrar inteiros.
    const dentro = new Set(montarPauta('teste', 30, new Set()).dentro.map((a) => a.id));
    expect(dentro).toContain('alta1');
    expect(dentro).toContain('alta2');
  });

  it('o que não coube aparece como "fora", não some', () => {
    const r = montarPauta('teste', 30, new Set());
    expect(r.dentro.length + r.fora.length).toBe(CENARIO.length);
  });

  it('a escuta que não cabe aparece em "fora" — não some em silêncio', () => {
    // Bug real: `fora` saía de `resto`, que exclui as escutas. O item que
    // mais precisa aparecer quando falta tempo era justamente o que sumia.
    const r = montarPauta('teste', 25, new Set());
    const todos = [...r.dentro, ...r.fora].map((a) => a.id);
    expect(todos).toContain('escuta');
  });

  it('descartar um assunto tira ele da pauta', () => {
    const r = montarPauta('teste', 60, new Set(['alta1']));
    expect(r.dentro.map((a) => a.id)).not.toContain('alta1');
    expect(r.fora.map((a) => a.id)).not.toContain('alta1');
  });

  it('com mais tempo cabem as duas garantias de equilíbrio', () => {
    const curto = montarPauta('teste', 25, new Set());
    const longo = montarPauta('teste', 60, new Set());
    const faltas = (r: typeof curto) => Number(r.faltouDev) + Number(r.faltouEscuta);
    expect(faltas(longo)).toBeLessThanOrEqual(faltas(curto));
    expect(faltas(longo)).toBe(0);
  });

  it('aos 60 min a trava injeta desenvolvimento e escuta', () => {
    const r = montarPauta('teste', 60, new Set());
    expect(r.injetados).toContain('dev');
    expect(r.injetados).toContain('escuta');
  });

  it('quando falta espaço, sugere uma duração que resolve', () => {
    const r = montarPauta('teste', 25, new Set());
    if (r.faltouDev || r.faltouEscuta) {
      expect(r.minimoSugerido).toBeGreaterThan(25);
    }
  });

  it('pessoa sem pauta devolve estrutura vazia em vez de estourar', () => {
    const r = montarPauta('nao-existe', 45, new Set());
    expect(r.dentro).toEqual([]);
    expect(r.fora).toEqual([]);
    expect(r.usado).toBe(0);
  });
});

describe('seed', () => {
  it('o sistema sobe sem pessoa nenhuma cadastrada', () => {
    // Decisão de produto: nada de dado de exemplo, nem fictício. Quem
    // instala cadastra o próprio time, e as telas mostram o vazio como
    // pendência de gestão, não como erro.
    expect(PESSOAS).toEqual([]);
    expect(souMeus()).toEqual([]);
  });

  it('as telas que dependem do roster não quebram com ele vazio', () => {
    expect(() => souMeus().filter((p) => p.elegivel)).not.toThrow();
    expect(timeDe('qualquer').nome).toBe('Sem tribo');
  });
});
