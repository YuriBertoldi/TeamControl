/**
 * Travas do pacote de insumo para a IA.
 *
 * Estes são os testes de SEGURANÇA do sistema, não de qualidade. Cada um
 * corresponde a uma forma concreta de causar dano:
 *
 * - DNA entrar no pacote → motivação vira argumento de desempenho numa mesa de
 *   calibragem, que é exatamente o que o instrumento não sustenta.
 * - Item de confidencialidade alta vazar → conteúdo que você prometeu não
 *   circular aparece num texto que vai para o RH.
 * - Contra-evidência sumir → o gerador produz peça de advocacia cega, e a mesa
 *   derruba.
 * - Omissão não ser contada → quem lê conclui que viu tudo e escreve uma
 *   afirmação de completude falsa.
 *
 * Se um destes quebrar, não é regressão de funcionalidade: é vazamento.
 *
 * O sistema sobe sem dado nenhum, então os fixtures são montados aqui. Sai
 * melhor que depender de um seed: o teste declara exatamente a situação que
 * verifica, inclusive a evidência confidencial que NÃO pode sair na saída.
 */

import { describe, it, expect, vi } from 'vitest';
import type { Pessoa, Assunto } from './mock';

/* ---------- fixtures ---------- */

const PESSOA: Pessoa = {
  slug: 'fulano', nome: 'Fulano de Tal', curto: 'Fulano', time: 't1',
  familia: 'Desenvolvimento', cargo: 'Desenvolvedor Pleno', techLead: false,
  admissao: '2024-03-01', status: 'ativo', elegivel: true,
  trajetoria: ['S', 'E', 'S'], quadrante: 'Forte Desempenho',
  ultima1a1: '2026-09-20', cadenciaDias: 60,
};

const INELEGIVEL: Pessoa = {
  ...PESSOA, slug: 'novato', nome: 'Novato Recente', curto: 'Novato',
  elegivel: false, motivoInelegivel: 'Menos de 6 meses de casa',
  trajetoria: [], quadrante: null,
};

const SEM_LASTRO: Pessoa = {
  ...PESSOA, slug: 'sem-lastro', nome: 'Sem Lastro', curto: 'SemLastro',
};

const assunto = (over: Partial<Assunto>): Assunto => ({
  id: 'a1', prioridade: 'alta', minutos: 10, categoria: 'Compromisso meu',
  origem: 'regra_compromisso', titulo: 'Assunto público',
  porQueAgora: 'Fato observável registrado na conversa.',
  refs: ['EV-2026-09-20-FULANO-01'],
  pergunta: 'Pergunta de abertura.', porQueAssim: 'Motivo da formulação.',
  toca: [], ...over,
});

/** Conteúdo que não pode aparecer em lugar nenhum da saída. */
const SEGREDO = 'conteudo confidencial que nao pode circular';
const REF_SEGREDA = 'EV-2026-09-20-FULANO-99';

vi.mock('./mock', async (original) => {
  const real = await original<typeof import('./mock')>();
  return {
    ...real,
    PESSOAS: [PESSOA, INELEGIVEL, SEM_LASTRO],
    PAUTA: {
      fulano: [
        assunto({}),
        assunto({
          id: 'a2', categoria: 'Risco', titulo: 'Contra-evidencia registrada',
          porQueAgora: 'Padrão que enfraquece a tese, visto em duas conversas.',
          refs: ['EV-2026-09-20-FULANO-02'],
        }),
        assunto({ id: 'a3', conf: 3, titulo: SEGREDO, porQueAgora: SEGREDO,
                  refs: [REF_SEGREDA] }),
      ],
      'sem-lastro': [],
    },
    COMPROMISSOS: [
      { id: 1, pessoa: 'fulano', responsavel: 'coordenador', nomeResp: 'Coordenação',
        descricao: 'Devolver a definição de escopo', prazoTexto: 'próximos dias',
        prazoDate: '2026-09-01', status: 'aberto', origemMeeting: 'm1', herdado: 0 },
    ],
    TEMAS: {
      fulano: {
        recorrentes: [{ tema: 'Carga', ocorrencias: 4, janela: 5,
                        nota: 'Aparece há quatro conversas.',
                        refs: ['EV-2026-09-20-FULANO-02'] }],
        ausentes: [{ tema: 'PDI', conversasSem: 3, ultimo: '2026-06-01' }],
      },
    },
  };
});

const { montarInsumo, lastroDe } = await import('./insumo');
const { cicloVigente } = await import('./ciclos');
const { PESSOAS } = await import('./mock');

const ciclo = cicloVigente();

type Pergunta = Parameters<typeof montarInsumo>[1];
const pergunta = (fontes: Pergunta['fontes']): Pergunta => ({
  id: 'teste', texto: 'Quais foram os principais pontos fortes do período?',
  alvo: 'lider', limite: 2000, fontes,
});

const TODAS: Pergunta['fontes'] = [
  'evidencias', 'registros_1a1', 'feedbacks', 'compromissos',
  'skills', 'trilha', 'pdi', 'trajetoria',
];

/* ---------- travas ---------- */

describe('montarInsumo — travas de confidencialidade', () => {
  it('nunca carrega DNA motivacional, mesmo pedindo todas as fontes', () => {
    const { prompt, contagem } = montarInsumo('fulano', pergunta(TODAS), ciclo);

    expect(prompt).not.toMatch(/âncora de carreira/i);
    expect(prompt).not.toMatch(/motivador/i);
    expect(prompt).not.toMatch(/aspiração declarada/i);
    expect(Object.keys(contagem)).not.toContain('DNA');
  });

  it('declara explicitamente no prompt que o DNA foi excluído por desenho', () => {
    expect(montarInsumo('fulano', pergunta(['evidencias']), ciclo).prompt)
      .toMatch(/DNA motivacional foi excluído por desenho/i);
  });

  it('não deixa escapar evidência acima de confidencialidade 2', () => {
    const { prompt } = montarInsumo('fulano', pergunta(TODAS), ciclo);

    expect(prompt, 'vazou o título do assunto confidencial').not.toContain(SEGREDO);
    expect(prompt, 'vazou o ref_code confidencial').not.toContain(REF_SEGREDA);
  });

  it('conta o que foi omitido sem revelar o conteúdo', () => {
    const { prompt, omitidos } = montarInsumo('fulano', pergunta(['evidencias']), ciclo);

    expect(omitidos).toHaveLength(1);
    expect(omitidos[0].quantidade).toBe(1);
    expect(omitidos[0].motivo).toMatch(/confidencialidade/i);
    expect(prompt).toMatch(/filtrados por confidencialidade/i);
    expect(prompt).not.toContain(SEGREDO);
  });

  it('avisa que a leitura é parcial mesmo quando nada foi filtrado', () => {
    const { prompt } = montarInsumo('sem-lastro', pergunta(['evidencias']), ciclo);

    expect(prompt).toMatch(/Você não viu tudo/i);
    // \s+ e não espaço literal: o prompt quebra linha no meio da frase.
    expect(prompt).toMatch(/não\s+escreva\s+"não há registro de X"/i);
  });
});

describe('montarInsumo — regras de redação', () => {
  const p = () => montarInsumo('fulano', pergunta(['evidencias']), ciclo).prompt;

  it('exige citação de ref_code e proíbe número inventado', () => {
    expect(p()).toMatch(/cita o ref_code/i);
    expect(p()).toMatch(/Todo número do texto tem que existir nos dados/i);
  });

  it('proíbe propor nota, quadrante, mérito e promoção', () => {
    expect(p())
      .toMatch(/Não proponha nota, quadrante, mérito, promoção, aumento ou próximo nível/i);
  });

  it('exige duas fontes distintas para afirmação de padrão', () => {
    expect(p()).toMatch(/PADRÃO exige ao menos duas fontes/i);
  });

  it('inclui o bloco de contra-evidências para toda pessoa', () => {
    for (const pessoa of PESSOAS) {
      expect(montarInsumo(pessoa.slug, pergunta(['evidencias']), ciclo).prompt, pessoa.slug)
        .toMatch(/Contra-evidências \(bloco obrigatório\)/i);
    }
  });

  it('lista a contra-evidência quando existe', () => {
    expect(p()).toContain('Contra-evidencia registrada');
  });

  it('quando não há contra-evidência, manda dizer isso em vez de omitir', () => {
    const { prompt } = montarInsumo('sem-lastro', pergunta(['evidencias']), ciclo);

    expect(prompt).toMatch(/Nenhuma contra-evidência registrada/i);
    expect(prompt).toMatch(/peça de advocacia/i);
  });
});

describe('montarInsumo — conteúdo por fonte', () => {
  it('só inclui as seções pedidas pela pergunta', () => {
    const { prompt } = montarInsumo('fulano', pergunta(['skills']), ciclo);

    expect(prompt).toMatch(/Skills esperadas da cadeira/i);
    expect(prompt).not.toMatch(/## Trilha QA/i);
    expect(prompt).not.toMatch(/## Compromissos do período/i);
  });

  it('a trajetória vai inteira, e o prompt diz por quê', () => {
    expect(montarInsumo('fulano', pergunta(['trajetoria']), ciclo).prompt)
      .toMatch(/A série vai inteira, não selecionada/i);
  });

  it('marca separadamente os compromissos que são do coordenador', () => {
    const { prompt } = montarInsumo('fulano', pergunta(['compromissos']), ciclo);

    expect(prompt).toMatch(/compromissos SEUS em aberto/i);
    expect(prompt).toMatch(/dependência sua não é falha de execução da pessoa/i);
  });

  it('carrega escala e janela do ciclo, não de constantes', () => {
    const { prompt } = montarInsumo('fulano', pergunta(['evidencias']), ciclo);

    expect(prompt).toContain(ciclo.nome);
    expect(prompt).toContain(String(ciclo.escalaMin));
    expect(prompt).toContain(String(ciclo.escalaMax));
    for (const rotulo of ciclo.rotulosEscala) expect(prompt).toContain(rotulo);
  });

  it('reproduz o texto da pergunta literalmente', () => {
    const q = pergunta(['evidencias']);
    const { prompt } = montarInsumo('fulano', q, ciclo);

    expect(prompt).toContain(q.texto);
    expect(prompt).toContain('limite de 2000 caracteres');
  });
});

describe('montarInsumo — avisos antes de gerar', () => {
  it('avisa quando a pessoa não tem evidência nenhuma', () => {
    expect(montarInsumo('sem-lastro', pergunta(['evidencias']), ciclo).avisos.join(' '))
      .toMatch(/sem lastro nenhum/i);
  });

  it('avisa quando a pessoa está fora do ciclo', () => {
    expect(montarInsumo('novato', pergunta(['evidencias']), ciclo).avisos.join(' '))
      .toMatch(/Fora do ciclo/i);
  });

  it('pessoa inexistente devolve aviso em vez de estourar', () => {
    const insumo = montarInsumo('nao-existe', pergunta(['evidencias']), ciclo);

    expect(insumo.prompt).toBe('');
    expect(insumo.avisos).toContain('Pessoa não encontrada no cadastro.');
  });
});

describe('lastroDe', () => {
  it('conta só evidência citável, ignorando a confidencial', () => {
    // Três assuntos, um de confidencialidade 3: só dois contam.
    expect(lastroDe(PESSOA)).toBe(2);
  });

  it('pessoa sem pauta tem lastro zero', () => {
    expect(lastroDe(SEM_LASTRO)).toBe(0);
  });
});
