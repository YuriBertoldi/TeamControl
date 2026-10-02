/**
 * Apuração do DNA Motivacional.
 *
 * O que estes testes protegem, em ordem de dano:
 *
 * 1. **O código de três letras.** Ele vira rótulo da pessoa no sistema inteiro.
 *    Um empate resolvido para o lado errado troca o perfil e, com ele, toda a
 *    orientação de conduta que a tela deriva.
 * 2. **A margem.** 7×0 e 4×3 dão a mesma letra. Se a margem se perder, a tela
 *    passa a afirmar como traço firme o que foi quase moeda ao ar.
 * 3. **A equivalência entre as duas entradas.** Questionário e importação por
 *    totais precisam produzir a mesma `Apuracao`, senão a leitura da pessoa
 *    muda conforme o caminho que você usou para registrá-la.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  apurar, apurarTotais, apurarRegistro, intensidadeDe, descricaoPessoal,
  condutaDe, distribuicaoDoTime, gravarDNA, carregarDNA, historicoDe, dnaDe,
  salvarDNA, PARES, EIXOS,
  type Respostas, type Polo, type RegistroDNA,
} from './dna';

/** Respostas completas a partir dos seis totais — na ordem dos pares. */
function respostasPara(totais: Partial<Record<Polo, number>>): Respostas {
  const resta = { ...totais } as Record<Polo, number>;
  const out: Respostas = {};
  for (const par of PARES) {
    // Escolhe o polo que ainda tem cota; se nenhum tiver, o primeiro.
    const escolhido = par.opcoes.find((o) => (resta[o.polo] ?? 0) > 0)?.polo
      ?? par.opcoes[0].polo;
    resta[escolhido] = (resta[escolhido] ?? 0) - 1;
    out[par.n] = escolhido;
  }
  return out;
}

/** Tudo no primeiro polo de cada eixo: P, E(stabilidade), I. */
const TUDO_PRIMEIRO: Respostas = Object.fromEntries(
  PARES.map((p) => {
    const eixo = EIXOS.find((e) => e.polos.includes(p.opcoes[0].polo))!;
    return [p.n, eixo.polos[0]];
  }));

describe('apurar', () => {
  it('só fecha o código com as 21 respostas', () => {
    const parcial: Respostas = { 1: 'conexao', 2: 'variedade' };
    const ap = apurar(parcial);
    expect(ap.completo).toBe(false);
    expect(ap.codigo).toBeNull();
    expect(ap.perfil).toBeNull();
    expect(ap.respondidos).toBe(2);
    expect(ap.total).toBe(21);
  });

  it('com tudo no primeiro polo devolve PEI, com margem máxima', () => {
    const ap = apurar(TUDO_PRIMEIRO);
    expect(ap.completo).toBe(true);
    expect(ap.codigo).toBe('PEI');
    expect(ap.perfil?.nome).toBe('Diretor');
    for (const e of ap.eixos) {
      expect(e.pontos).toEqual([7, 0]);
      expect(e.margem).toBe(7);
      expect(intensidadeDe(e)).toBe('forte');
    }
    expect(ap.fracos).toHaveLength(0);
  });

  it('empate cai para o primeiro polo, como a fórmula da planilha', () => {
    // A planilha usa `>` estrito: o segundo polo só vence com vantagem.
    // Um eixo com 7 pares não empata, mas a regra precisa valer caso a
    // planilha passe a ter número par de pares num eixo.
    const ap = apurarTotais({
      producao: 3, conexao: 3,
      estabilidade: 3, variedade: 3,
      interioridade: 3, exterioridade: 3,
    });
    expect(ap.codigo).toBe('PEI');
    for (const e of ap.eixos) {
      expect(e.margem).toBe(0);
      expect(intensidadeDe(e)).toBe('empate');
    }
  });

  it('marca como fraco o eixo decidido por 1 ponto', () => {
    const ap = apurarTotais({
      producao: 4, conexao: 3,       // margem 1 → fraca
      estabilidade: 7, variedade: 0, // margem 7 → forte
      interioridade: 5, exterioridade: 2, // margem 3 → clara
    });
    expect(ap.codigo).toBe('PEI');
    expect(intensidadeDe(ap.eixos[0])).toBe('fraca');
    expect(intensidadeDe(ap.eixos[1])).toBe('forte');
    expect(intensidadeDe(ap.eixos[2])).toBe('clara');
    expect(ap.fracos).toHaveLength(1);
    expect(ap.fracos[0].eixo.id).toBe('impulso');
  });

  it('produz os 8 códigos conforme o lado vencedor de cada eixo', () => {
    const casos: [Partial<Record<Polo, number>>, string][] = [
      [{ producao: 7, estabilidade: 7, interioridade: 7 }, 'PEI'],
      [{ producao: 7, variedade: 7, interioridade: 7 }, 'PVI'],
      [{ producao: 7, estabilidade: 7, exterioridade: 7 }, 'PEE'],
      [{ producao: 7, variedade: 7, exterioridade: 7 }, 'PVE'],
      [{ conexao: 7, estabilidade: 7, interioridade: 7 }, 'CEI'],
      [{ conexao: 7, variedade: 7, interioridade: 7 }, 'CVI'],
      [{ conexao: 7, estabilidade: 7, exterioridade: 7 }, 'CEE'],
      [{ conexao: 7, variedade: 7, exterioridade: 7 }, 'CVE'],
    ];
    for (const [totais, codigo] of casos) {
      expect(apurarTotais(totais).codigo, JSON.stringify(totais)).toBe(codigo);
      expect(apurarTotais(totais).perfil?.codigo).toBe(codigo);
    }
  });
});

describe('apurarTotais — o caminho da planilha', () => {
  it('reproduz a planilha modelo corrigida: A1 C6 D5 F2 B5 E2 → CEI', () => {
    // Os totais do modelo, já com a correção dos pares 3 e 9 aplicada
    // (um ponto migra de Estabilidade para Exterioridade).
    const ap = apurarTotais({
      producao: 1, conexao: 6,
      estabilidade: 5, variedade: 2,
      interioridade: 5, exterioridade: 2,
    });
    expect(ap.codigo).toBe('CEI');
    expect(ap.perfil?.nome).toBe('Sustentador');
    expect(ap.completo).toBe(true);
  });

  it('é equivalente ao questionário para os mesmos totais', () => {
    const totais = {
      producao: 2, conexao: 5,
      estabilidade: 6, variedade: 1,
      interioridade: 4, exterioridade: 3,
    };
    const porTotais = apurarTotais(totais);
    const porRespostas = apurar(respostasPara(totais));

    expect(porRespostas.codigo).toBe(porTotais.codigo);
    expect(porRespostas.eixos.map((e) => e.pontos))
      .toEqual(porTotais.eixos.map((e) => e.pontos));
  });

  it('não fecha código quando falta um eixo inteiro', () => {
    const ap = apurarTotais({ producao: 7, estabilidade: 7 });
    expect(ap.completo).toBe(false);
    expect(ap.codigo).toBeNull();
  });
});

describe('descricaoPessoal', () => {
  it('avisa que a leitura está incompleta em vez de inventar perfil', () => {
    const texto = descricaoPessoal(apurar({ 1: 'conexao' }), 'Diego');
    expect(texto).toHaveLength(1);
    expect(texto[0]).toMatch(/incompleta/i);
    expect(texto[0]).toMatch(/1 de 21/);
  });

  it('cita o nome, o código, o perfil e os placares de cada eixo', () => {
    const ap = apurarTotais({
      producao: 1, conexao: 6,
      estabilidade: 5, variedade: 2,
      interioridade: 5, exterioridade: 2,
    });
    const texto = descricaoPessoal(ap, 'Diego').join('\n');
    expect(texto).toContain('Diego');
    expect(texto).toContain('CEI');
    expect(texto).toContain('Sustentador');
    expect(texto).toContain('1×6');
    expect(texto).toContain('5×2');
  });

  it('separa traço firme de preferência fraca', () => {
    const ap = apurarTotais({
      producao: 7, conexao: 0,            // forte
      estabilidade: 4, variedade: 3,      // fraca
      interioridade: 7, exterioridade: 0, // forte
    });
    const texto = descricaoPessoal(ap, 'Ana').join('\n');
    expect(texto).toMatch(/traço firme/i);
    expect(texto).toMatch(/NÃO é traço/i);
    expect(texto).toMatch(/necessidade/i);
  });

  it('sempre fecha lembrando que não serve para justificar nota', () => {
    const ap = apurarTotais({
      producao: 7, estabilidade: 7, interioridade: 7,
    });
    const texto = descricaoPessoal(ap, 'Ana');
    expect(texto.at(-1)).toMatch(/nunca para justificar nota/i);
  });
});

describe('condutaDe', () => {
  it('muda a orientação conforme o polo de cada eixo', () => {
    const produtor = condutaDe(apurarTotais({
      producao: 7, estabilidade: 7, exterioridade: 7,
    }));
    const conector = condutaDe(apurarTotais({
      conexao: 7, variedade: 7, interioridade: 7,
    }));

    expect(produtor.map((c) => c.titulo)).not.toEqual(conector.map((c) => c.titulo));
    expect(JSON.stringify(produtor)).toMatch(/resultado/i);
    expect(JSON.stringify(conector)).toMatch(/pessoa/i);

    // Exterioridade pede reconhecimento visível; Interioridade, reservado.
    expect(JSON.stringify(produtor)).toMatch(/público/i);
    expect(JSON.stringify(conector)).toMatch(/particular|reservad/i);
  });

  it('sempre devolve pelo menos uma conduta por eixo', () => {
    const c = condutaDe(apurarTotais({
      producao: 7, estabilidade: 7, interioridade: 7,
    }));
    expect(c.length).toBeGreaterThanOrEqual(3);
    for (const x of c) {
      expect(x.titulo).toBeTruthy();
      expect(x.texto.length).toBeGreaterThan(30);
    }
  });
});

describe('persistência', () => {
  beforeEach(() => { localStorage.clear(); });

  const registro = (slug: string, data: string, totais: Partial<Record<Polo, number>>): RegistroDNA => ({
    slug, data, respostas: {}, origem: 'planilha',
    totaisImportados: totais as Record<Polo, number>,
  });

  it('grava e lê de volta', () => {
    gravarDNA(registro('diego-nunes', '2026-10-01', { producao: 7, estabilidade: 7, interioridade: 7 }));
    expect(carregarDNA()).toHaveLength(1);
    expect(apurarRegistro(dnaDe('diego-nunes')!).codigo).toBe('PEI');
  });

  it('substitui a leitura do mesmo dia em vez de duplicar', () => {
    gravarDNA(registro('diego-nunes', '2026-10-01', { producao: 7, estabilidade: 7, interioridade: 7 }));
    gravarDNA(registro('diego-nunes', '2026-10-01', { conexao: 7, variedade: 7, exterioridade: 7 }));

    expect(historicoDe('diego-nunes')).toHaveLength(1);
    expect(apurarRegistro(dnaDe('diego-nunes')!).codigo).toBe('CVE');
  });

  it('mantém o histórico e devolve a leitura mais recente primeiro', () => {
    gravarDNA(registro('diego-nunes', '2026-04-01', { producao: 7, estabilidade: 7, interioridade: 7 }));
    gravarDNA(registro('diego-nunes', '2026-10-01', { producao: 7, variedade: 7, interioridade: 7 }));

    const hist = historicoDe('diego-nunes');
    expect(hist).toHaveLength(2);
    expect(hist[0].data).toBe('2026-10-01');
    // O delta entre leituras é o sinal — por isso a antiga não é sobrescrita.
    expect(apurarRegistro(hist[0]).codigo).toBe('PVI');
    expect(apurarRegistro(hist[1]).codigo).toBe('PEI');
  });

  it('sobrevive a localStorage corrompido sem derrubar a tela', () => {
    localStorage.setItem('teamcontrol.dna', '{ nao é json');
    expect(carregarDNA()).toEqual([]);
  });

  it('apurarRegistro respeita a origem do registro', () => {
    const doQuestionario: RegistroDNA = {
      slug: 'ana', data: '2026-10-01', origem: 'questionario',
      respostas: TUDO_PRIMEIRO,
    };
    expect(apurarRegistro(doQuestionario).codigo).toBe('PEI');
  });
});

describe('distribuicaoDoTime', () => {
  beforeEach(() => { localStorage.clear(); });

  it('conta por polo e separa quem não tem leitura', () => {
    salvarDNA([
      { slug: 'a', data: '2026-10-01', respostas: {}, origem: 'planilha',
        totaisImportados: { producao: 7, conexao: 0, estabilidade: 7, variedade: 0,
                            interioridade: 7, exterioridade: 0 } },
      { slug: 'b', data: '2026-10-01', respostas: {}, origem: 'planilha',
        totaisImportados: { producao: 0, conexao: 7, estabilidade: 0, variedade: 7,
                            interioridade: 0, exterioridade: 7 } },
    ]);

    const dist = distribuicaoDoTime(['a', 'b', 'c']);
    expect(dist).toHaveLength(3);
    for (const d of dist) {
      expect(d.contagem).toEqual([1, 1]);
      // 'c' nunca respondeu: não entra na conta de nenhum lado.
      expect(d.semLeitura).toBe(1);
    }
  });

  it('time vazio não quebra', () => {
    const dist = distribuicaoDoTime([]);
    for (const d of dist) {
      expect(d.contagem).toEqual([0, 0]);
      expect(d.semLeitura).toBe(0);
    }
  });
});
