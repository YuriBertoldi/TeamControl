/**
 * DNA Motivacional — apuração, persistência e leitura de gestão.
 *
 * O instrumento em si (21 pares, 8 perfis) está em `dnaInstrumento.ts`, gerado
 * da sua planilha. Aqui mora o que o sistema faz com ele.
 *
 * Duas decisões que valem explicar:
 *
 * 1. **A margem do eixo é tão importante quanto o lado.** Um 4×3 e um 7×0
 *    produzem a mesma letra no código, e não significam a mesma coisa: o
 *    primeiro é uma pessoa que transita entre os dois polos, o segundo é uma
 *    preferência dura. Conduzir a 1:1 do jeito errado com alguém de 7×0 custa
 *    caro; com alguém de 4×3, quase nada. Por isso `Apuracao` carrega a
 *    margem, e a tela mostra "fraca" quando ela é de 1 ponto.
 *
 * 2. **Perfil não é diagnóstico nem prognóstico.** É preferência declarada
 *    pela própria pessoa, numa data. Vale para decidir COMO conversar, alocar
 *    e reconhecer — nunca para justificar nota, nem para prever desempenho.
 *    A trava está em `insumo.ts`, que não carrega nada deste módulo.
 */

import { EIXOS, PARES, PERFIS, ROTULO_POLO, type Eixo, type Polo, type Perfil } from './dnaInstrumento';

import { lerJSON, escreverJSON } from './armazenamento';

export { EIXOS, PARES, PERFIS, ROTULO_POLO };
export type { Eixo, Polo, Perfil };

/** Resposta do questionário: número do par → polo escolhido. */
export type Respostas = Record<number, Polo>;

export interface EixoApurado {
  eixo: Eixo;
  /** Pontos de cada polo, na ordem de `eixo.polos`. */
  pontos: [number, number];
  vencedor: Polo;
  letra: string;
  /** Diferença absoluta entre os dois polos. 0 = empate. */
  margem: number;
  /** Quantos pares daquele eixo foram respondidos. */
  respondidos: number;
  total: number;
}

export interface Apuracao {
  /** Código de três letras, ou null enquanto o questionário está incompleto. */
  codigo: string | null;
  perfil: Perfil | null;
  eixos: EixoApurado[];
  respondidos: number;
  total: number;
  completo: boolean;
  /** Eixos decididos por 1 ponto — a leitura ali é frágil e a tela avisa. */
  fracos: EixoApurado[];
}

const EIXO_DO_POLO = new Map<Polo, Eixo>(
  EIXOS.flatMap((e) => e.polos.map((p) => [p, e] as const)));

const paresDoEixo = (e: Eixo) =>
  PARES.filter((p) => EIXO_DO_POLO.get(p.opcoes[0].polo)?.id === e.id);

export function apurar(respostas: Respostas): Apuracao {
  const eixos: EixoApurado[] = EIXOS.map((eixo) => {
    const pares = paresDoEixo(eixo);
    const pontos: [number, number] = [0, 0];
    let respondidos = 0;
    for (const par of pares) {
      const escolha = respostas[par.n];
      if (!escolha) continue;
      respondidos++;
      const i = eixo.polos.indexOf(escolha);
      if (i >= 0) pontos[i]++;
    }
    // Empate cai para o primeiro polo, que é a convenção da planilha: a
    // fórmula usa `>` estrito, então o segundo polo só vence com vantagem.
    const venceSegundo = pontos[1] > pontos[0];
    return {
      eixo,
      pontos,
      vencedor: eixo.polos[venceSegundo ? 1 : 0],
      letra: eixo.letras[venceSegundo ? 1 : 0],
      margem: Math.abs(pontos[0] - pontos[1]),
      respondidos,
      total: pares.length,
    };
  });

  const respondidos = eixos.reduce((s, e) => s + e.respondidos, 0);
  const completo = respondidos === PARES.length;
  const codigo = completo ? eixos.map((e) => e.letra).join('') : null;

  return {
    codigo,
    perfil: codigo ? (PERFIS.find((p) => p.codigo === codigo) ?? null) : null,
    eixos,
    respondidos,
    total: PARES.length,
    completo,
    fracos: eixos.filter((e) => e.respondidos === e.total && e.margem <= 1),
  };
}

/* ---------- persistência ---------- */

export interface RegistroDNA {
  slug: string;
  /** Quando foi respondido. A camada volátil envelhece: o delta é o sinal. */
  data: string;
  respostas: Respostas;
  /**
   * Quando veio da planilha e não do questionário, só temos os 6 totais.
   * Guardar isso explicitamente evita fingir que existem 21 respostas.
   */
  totaisImportados?: Record<Polo, number>;
  origem: 'questionario' | 'planilha';
  /** Observação sua sobre a leitura — o que o número não conta. */
  nota?: string;
}

const CHAVE = 'dna';

export function carregarDNA(): RegistroDNA[] {
  return lerJSON<RegistroDNA[]>(CHAVE, []);
}

export function salvarDNA(lista: RegistroDNA[]): void {
  escreverJSON(CHAVE, lista);
}

/**
 * Histórico por pessoa, do mais recente para o mais antigo.
 *
 * Guardar as leituras antigas é o ponto: "Variedade subiu de 2 para 6 em seis
 * meses" diz mais sobre risco de saída que qualquer score preditivo.
 */
export function historicoDe(slug: string, lista = carregarDNA()): RegistroDNA[] {
  return lista.filter((r) => r.slug === slug)
    .sort((a, b) => b.data.localeCompare(a.data));
}

export const dnaDe = (slug: string, lista = carregarDNA()): RegistroDNA | undefined =>
  historicoDe(slug, lista)[0];

export function gravarDNA(reg: RegistroDNA, lista = carregarDNA()): RegistroDNA[] {
  // Uma leitura por pessoa por dia: refazer no mesmo dia é correção, não
  // série temporal, e duas linhas idênticas poluiriam o histórico.
  const nova = [...lista.filter((r) => !(r.slug === reg.slug && r.data === reg.data)), reg];
  salvarDNA(nova);
  return nova;
}

export function removerDNA(slug: string, data: string, lista = carregarDNA()): RegistroDNA[] {
  const nova = lista.filter((r) => !(r.slug === slug && r.data === data));
  salvarDNA(nova);
  return nova;
}

/** Apuração a partir do registro, respeitando a origem (planilha ou questionário). */
export function apurarRegistro(reg: RegistroDNA): Apuracao {
  if (reg.origem === 'planilha' && reg.totaisImportados) {
    return apurarTotais(reg.totaisImportados);
  }
  return apurar(reg.respostas);
}

/**
 * Apuração a partir dos 6 totais da planilha (a linha de soma da aba
 * "DNA MOTIVACIONAL"), sem as respostas individuais.
 *
 * É o caminho de importação mais barato que existe e não depende de ler .xlsx
 * no navegador: você abre a planilha da pessoa, copia seis números, pronto.
 */
export function apurarTotais(totais: Partial<Record<Polo, number>>): Apuracao {
  const eixos: EixoApurado[] = EIXOS.map((eixo) => {
    const pontos: [number, number] = [
      totais[eixo.polos[0]] ?? 0,
      totais[eixo.polos[1]] ?? 0,
    ];
    const venceSegundo = pontos[1] > pontos[0];
    const respondidos = pontos[0] + pontos[1];
    return {
      eixo, pontos,
      vencedor: eixo.polos[venceSegundo ? 1 : 0],
      letra: eixo.letras[venceSegundo ? 1 : 0],
      margem: Math.abs(pontos[0] - pontos[1]),
      respondidos,
      total: paresDoEixo(eixo).length,
    };
  });

  const respondidos = eixos.reduce((s, e) => s + e.respondidos, 0);
  const completo = eixos.every((e) => e.respondidos > 0);
  const codigo = completo ? eixos.map((e) => e.letra).join('') : null;

  return {
    codigo,
    perfil: codigo ? (PERFIS.find((p) => p.codigo === codigo) ?? null) : null,
    eixos,
    respondidos,
    total: PARES.length,
    completo,
    fracos: eixos.filter((e) => e.respondidos > 0 && e.margem <= 1),
  };
}

/* ---------- descrição personalizada ---------- */

export type Intensidade = 'empate' | 'fraca' | 'clara' | 'forte';

/**
 * Quão firme é a preferência, não só de que lado ela caiu.
 *
 * São 7 pares por eixo. 7×0 e 4×3 produzem a mesma letra e não descrevem a
 * mesma pessoa: um é traço, o outro é quase moeda ao ar. Tratar os dois como
 * iguais é o erro que transforma o instrumento em rótulo.
 */
export function intensidadeDe(e: EixoApurado): Intensidade {
  if (e.margem === 0) return 'empate';
  if (e.margem <= 1) return 'fraca';
  if (e.margem <= 3) return 'clara';
  return 'forte';
}

const ADVERBIO: Record<Intensidade, string> = {
  empate: 'divide-se por igual entre',
  fraca: 'inclina-se de leve para',
  clara: 'tem preferência clara por',
  forte: 'é marcadamente de',
};

/** O que cada polo significa em frase, não em rótulo. */
const SENTIDO: Record<Polo, string> = {
  producao: 'entregar resultado e fazer acontecer',
  conexao: 'cuidar das pessoas e do clima ao redor do trabalho',
  estabilidade: 'previsibilidade, método e ritmo sustentável',
  variedade: 'mudança, novidade e ritmo intenso',
  interioridade: 'significado próprio e reconhecimento reservado',
  exterioridade: 'reconhecimento visível e recompensa concreta',
};

/** A tensão real quando dois eixos puxam para lados diferentes. */
function tensao(ap: Apuracao): string | null {
  const tem = (p: Polo) => ap.eixos.some((e) => e.vencedor === p);

  if (tem('producao') && tem('conexao')) return null;
  if (tem('producao') && tem('variedade') && tem('interioridade')) {
    return 'Quer avançar rápido e em várias frentes, mas o que valida o esforço é interno — elogio público rende pouco e meta sem sentido próprio desmobiliza.';
  }
  if (tem('producao') && tem('estabilidade') && tem('exterioridade')) {
    return 'Entrega por método e espera retorno proporcional e visível. Entrega grande sem reconhecimento concreto é o que corrói aqui, não a carga.';
  }
  if (tem('conexao') && tem('variedade')) {
    return 'Rende com gente e com novidade ao mesmo tempo. Isolamento numa frente longa e repetitiva é a combinação que mais desgasta.';
  }
  if (tem('conexao') && tem('estabilidade')) {
    return 'Precisa de terreno firme e de relação estável para render. Mudança brusca anunciada em cima da hora custa mais aqui do que em qualquer outro perfil.';
  }
  if (tem('producao') && tem('variedade')) {
    return 'Move-se por desafio e por ritmo. Rotina longa na mesma frente é risco de saída antes de ser queda de desempenho.';
  }
  return null;
}

/**
 * Descrição da pessoa a partir das RESPOSTAS dela, não do perfil genérico.
 *
 * O texto do perfil descreve um tipo; isto descreve esta leitura: de que lado
 * cada eixo caiu, com que firmeza, e onde os eixos entram em tensão. Vale
 * igual para questionário e para importação da planilha, porque ambos
 * produzem a mesma `Apuracao` — a regra é uma só.
 */
export function descricaoPessoal(ap: Apuracao, nome: string): string[] {
  if (!ap.completo) {
    return [`A leitura de ${nome} está incompleta: ${ap.respondidos} de ${ap.total} respostas. O código de três letras só sai com todas.`];
  }

  const paragrafos: string[] = [];

  const [impulso, necessidade, premio] = ap.eixos;
  const frase = (e: EixoApurado) =>
    `${ADVERBIO[intensidadeDe(e)]} ${SENTIDO[e.vencedor]}`;

  paragrafos.push(
    ap.perfil
      ? `${nome} é ${ap.perfil.codigo} — ${ap.perfil.nome}. No impulso, ${frase(impulso)} (${impulso.pontos[0]}×${impulso.pontos[1]}). Na necessidade, ${frase(necessidade)} (${necessidade.pontos[0]}×${necessidade.pontos[1]}). No prêmio, ${frase(premio)} (${premio.pontos[0]}×${premio.pontos[1]}).`
      : `${nome} respondeu tudo, mas o código não resolveu para um dos oito perfis.`,
  );

  const fortes = ap.eixos.filter((e) => intensidadeDe(e) === 'forte');
  if (fortes.length > 0) {
    paragrafos.push(
      `O que é traço firme e não vale contrariar: ${fortes.map((e) =>
        `${e.eixo.nome.toLowerCase()} em ${ROTULO_POLO[e.vencedor].toLowerCase()}`).join(' e ')}. ` +
      'Aqui a leitura é estável e conduzir contra o polo custa engajamento.',
    );
  }

  const frouxos = ap.eixos.filter((e) => intensidadeDe(e) === 'empate' || intensidadeDe(e) === 'fraca');
  if (frouxos.length > 0) {
    paragrafos.push(
      `O que NÃO é traço: ${frouxos.map((e) => e.eixo.nome.toLowerCase()).join(' e ')}. ` +
      `A letra saiu por ${frouxos.map((e) => e.margem).join(' e ')} ponto(s) de diferença — ` +
      'trate como "transita entre os dois" e confirme na conversa em vez de assumir.',
    );
  }

  const t = tensao(ap);
  if (t) paragrafos.push(t);

  paragrafos.push(
    'Isto é preferência declarada por ela nesta data, não diagnóstico nem previsão. ' +
    'Serve para decidir como conversar, alocar e reconhecer — nunca para justificar nota.',
  );

  return paragrafos;
}

/* ---------- leitura de gestão ---------- */

/**
 * O que o perfil muda na SUA conduta — não o que ele diz sobre a pessoa.
 *
 * Esta é a parte que transforma o teste em ferramenta de gestão. Sem ela o
 * resultado é um rótulo bonito que ninguém usa na segunda-feira.
 */
export interface Conduta { titulo: string; texto: string }

export function condutaDe(ap: Apuracao): Conduta[] {
  const out: Conduta[] = [];
  const polo = (p: Polo) => ap.eixos.some((e) => e.vencedor === p);

  if (polo('producao')) {
    out.push({
      titulo: 'Abra a 1:1 pelo resultado, não pelo "como você está"',
      texto: 'A pergunta aberta sobre bem-estar costuma render resposta genérica aqui. Comece pelo que está em jogo e o resto aparece sozinho.',
    });
  } else {
    out.push({
      titulo: 'Reserve os primeiros minutos para a pessoa, não para a pauta',
      texto: 'Entrar direto no status transforma a 1:1 em reunião de acompanhamento, e é justamente o que faz essa pessoa se fechar.',
    });
  }

  if (polo('estabilidade')) {
    out.push({
      titulo: 'Anuncie mudança com antecedência e com o porquê',
      texto: 'Mudança de escopo comunicada em cima da hora é lida como caos, não como agilidade. O custo aparece em retrabalho e em silêncio na conversa seguinte.',
    });
    out.push({
      titulo: 'Quebre objetivo grande em marcos com prazo',
      texto: 'Meta ambiciosa e vaga desanima em vez de mobilizar. Marco pequeno e datado é o que mantém o movimento.',
    });
  } else {
    out.push({
      titulo: 'Rotina longa demais na mesma frente é risco de saída',
      texto: 'Essa pessoa rende em variedade. Seis meses no mesmo tipo de tarefa pede rodízio planejado, não um discurso sobre importância do legado.',
    });
    out.push({
      titulo: 'Ofereça caminhos, não o caminho',
      texto: 'Dê o objetivo e deixe a rota aberta. Procedimento fechado aqui vira desengajamento silencioso.',
    });
  }

  if (polo('exterioridade')) {
    out.push({
      titulo: 'Reconheça em público e com algo tangível',
      texto: 'Elogio só na 1:1 não fecha a conta. Citar na daily, na retro ou para o gestor é o que conta como reconhecimento.',
    });
  } else {
    out.push({
      titulo: 'Reconheça em particular e pelo significado',
      texto: 'Holofote em público pode constranger e ter efeito contrário. O que registra é o reconhecimento específico, reservado, ligado ao sentido do trabalho.',
    });
  }

  return out;
}

/** Distribuição do time por polo — a leitura que muda como você monta squad. */
export function distribuicaoDoTime(
  slugs: string[], lista = carregarDNA(),
): { eixo: Eixo; contagem: [number, number]; semLeitura: number }[] {
  return EIXOS.map((eixo, i) => {
    const contagem: [number, number] = [0, 0];
    let semLeitura = 0;
    for (const slug of slugs) {
      const reg = dnaDe(slug, lista);
      if (!reg) { semLeitura++; continue; }
      const ap = apurarRegistro(reg);
      const ex = ap.eixos[i];
      if (!ex || ex.respondidos === 0) { semLeitura++; continue; }
      contagem[eixo.polos.indexOf(ex.vencedor) === 1 ? 1 : 0]++;
    }
    return { eixo, contagem, semLeitura };
  });
}
