/**
 * Gera src/data/dnaInstrumento.ts a partir da planilha modelo do DNA
 * Motivacional. O texto das 42 afirmativas e dos 8 perfis sai da planilha, não
 * é transcrito à mão — transcrever 8 descrições longas é convite a erro, e o
 * instrumento perde valor se o enunciado mudar de sentido no caminho.
 *
 * Uso: node scripts/gerar-dna.cjs <caminho do .xlsx já descompactado>
 */

const fs = require('fs');
const path = require('path');

const raiz = process.argv[2];
if (!raiz) {
  console.error('uso: node scripts/gerar-dna.cjs <pasta do xlsx descompactado>');
  process.exit(1);
}

const ler = (p) => fs.readFileSync(path.join(raiz, p), 'utf8');

const dec = (s) => s
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const limpar = (s) => dec(s)
  .replace(/&#10;/g, '\n')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n+/g, '\n')
  .trim();

const strs = [...ler('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)]
  .map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));

/** Lê uma planilha como lista de linhas { n, cells: { A: valor } }. */
function linhas(arquivo) {
  const out = [];
  for (const r of ler(arquivo).matchAll(/<row[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const c of r[2].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ehTexto = /t="s"/.test(c[2]);
      const v = ((c[3] || '').match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (v !== undefined) cells[c[1]] = ehTexto ? strs[+v] : v;
    }
    out.push({ n: +r[1], cells });
  }
  return out;
}

/* ---------- pares ---------- */

// Cabeçalho da planilha: coluna E rotulada "A", F="B", G="C", H="D", I="E", J="F".
const COLUNA = { E: 'A', F: 'B', G: 'C', H: 'D', I: 'E', J: 'F' };
const POLO = {
  A: 'producao', C: 'conexao',
  D: 'estabilidade', F: 'variedade',
  B: 'interioridade', E: 'exterioridade',
};

const porPar = {};
for (const { n, cells } of linhas('xl/worksheets/sheet1.xml')) {
  if (n < 5 || n > 46) continue;
  const par = Math.round(+cells.C);
  const col = Object.keys(COLUNA).find((k) => cells[k] !== undefined);
  if (!par || !col) continue;
  (porPar[par] = porPar[par] || []).push({
    texto: limpar(cells.D).replace(/\n/g, ' '),
    polo: POLO[COLUNA[col]],
  });
}

// Correção documentada: nos pares 3 e 9 a afirmativa de recompensa externa está
// lançada na coluna de Estabilidade. Pelo conteúdo o polo é Exterioridade.
for (const p of [3, 9]) {
  for (const a of porPar[p] || []) {
    if (a.polo === 'estabilidade') a.polo = 'exterioridade';
  }
}

const pares = Object.keys(porPar).map(Number).sort((a, b) => a - b)
  .map((n) => ({ n, opcoes: porPar[n] }));

// Checagem: com a correção, cada eixo tem que ficar com 7 pares.
const EIXO_DO_POLO = {
  producao: 'impulso', conexao: 'impulso',
  estabilidade: 'necessidade', variedade: 'necessidade',
  interioridade: 'premio', exterioridade: 'premio',
};
const porEixo = {};
for (const p of pares) {
  const eixos = [...new Set(p.opcoes.map((o) => EIXO_DO_POLO[o.polo]))];
  if (eixos.length !== 1) throw new Error(`par ${p.n} ficou cruzado entre eixos`);
  porEixo[eixos[0]] = (porEixo[eixos[0]] || 0) + 1;
}
if (Object.values(porEixo).some((n) => n !== 7)) {
  throw new Error('distribuição por eixo não ficou 7/7/7: ' + JSON.stringify(porEixo));
}

/* ---------- perfis ---------- */

const perfis = [];
for (const { n, cells } of linhas('xl/worksheets/sheet3.xml')) {
  if (n < 2 || !cells.B) continue;
  const corpo = limpar(cells.D).split('\n');
  const listar = (txt) => limpar(txt)
    .split(/[,.]\s+/).map((s) => s.trim().replace(/\.$/, ''))
    .filter((s) => s.length > 3);
  perfis.push({
    codigo: limpar(cells.B),
    // Na planilha vem "O DIRETOR". O artigo volta na tela quando a frase pede,
    // e o caixa-alta vira capitalização normal para não gritar em toda listagem.
    nome: limpar(cells.C).replace(/^O\s+/i, '').toLocaleLowerCase('pt-BR')
      .replace(/(^|\s)(\p{L})/gu, (_, a, b) => a + b.toLocaleUpperCase('pt-BR')),
    // A primeira linha é "Seu tipo de DNA Motivacional é XYZ (...)", redundante
    // com o código e o nome que já aparecem no cabeçalho do card.
    descricao: corpo.slice(1).join(' ').trim(),
    motivadores: listar(cells.E),
    desmotivadores: listar(cells.F),
    dicas: limpar(cells.G).split(/\n?\d\.\s/).map((s) => s.trim()).filter(Boolean),
  });
}
if (perfis.length !== 8) throw new Error(`esperava 8 perfis, achei ${perfis.length}`);

/* ---------- saída ---------- */

const q = (s) => JSON.stringify(String(s));
const lista = (arr, ident) => arr.map((x) => ' '.repeat(ident) + q(x) + ',').join('\n');

let o = `/**
 * DNA Motivacional — o instrumento que você já aplica.
 *
 * GERADO por scripts/gerar-dna.cjs a partir de DNA MOTIVACIONAL_Modelo.xlsx.
 * Não editar à mão: rode o script de novo se a planilha mudar.
 *
 * São 21 pares de escolha forçada sobre três eixos binários, que produzem um
 * código de três letras e um dos oito perfis. O código é POSICIONAL — P|C,
 * depois E|V, depois I|E — e por isso a letra E significa coisas diferentes na
 * segunda e na terceira posição (Estabilidade e Exterioridade). Os polos têm
 * nome próprio aqui justamente para o código nunca depender dessa ambiguidade.
 *
 * UMA CORREÇÃO EM RELAÇÃO À PLANILHA MODELO: nos pares 3 e 9 a afirmativa de
 * recompensa externa está lançada na coluna de Estabilidade, não na de
 * Exterioridade. Pelo conteúdo o polo é Exterioridade, e com a correção cada
 * eixo fica com exatamente 7 pares (7+7+7=21) em vez de 7/8/6. Sem ela, duas
 * respostas sobre reconhecimento contaminam o eixo de necessidade e podem
 * inverter a segunda letra do código.
 *
 * TRAVA: nada daqui entra em justificativa de AVD nem em defesa de calibragem.
 * Motivação não é argumento de desempenho — src/data/insumo.ts exclui este
 * módulo por desenho, não por esquecimento.
 */

export type Polo =
  | "producao" | "conexao"
  | "estabilidade" | "variedade"
  | "interioridade" | "exterioridade";

export type EixoId = "impulso" | "necessidade" | "premio";

export interface Eixo {
  id: EixoId;
  nome: string;
  pergunta: string;
  polos: [Polo, Polo];
  /** Letra de cada polo no código de três letras, na ordem de \`polos\`. */
  letras: [string, string];
}

export const EIXOS: Eixo[] = [
  { id: "impulso", nome: "Impulso",
    pergunta: "O que mais move a pessoa: entregar resultado ou cuidar de gente?",
    polos: ["producao", "conexao"], letras: ["P", "C"] },
  { id: "necessidade", nome: "Necessidade",
    pergunta: "Do que ela precisa para render: previsibilidade ou variedade?",
    polos: ["estabilidade", "variedade"], letras: ["E", "V"] },
  { id: "premio", nome: "Prêmio",
    pergunta: "De onde vem a recompensa que conta: de dentro ou de fora?",
    polos: ["interioridade", "exterioridade"], letras: ["I", "E"] },
];

export const ROTULO_POLO: Record<Polo, string> = {
  producao: "Produção",
  conexao: "Conexão",
  estabilidade: "Estabilidade",
  variedade: "Variedade",
  interioridade: "Interioridade",
  exterioridade: "Exterioridade",
};

export interface Afirmativa { texto: string; polo: Polo }
export interface Par { n: number; opcoes: [Afirmativa, Afirmativa] }

/** Os 21 pares, na ordem da planilha. */
export const PARES: Par[] = [
`;

for (const p of pares) {
  o += `  { n: ${p.n}, opcoes: [\n`;
  for (const a of p.opcoes) {
    o += `    { polo: ${q(a.polo)},\n      texto: ${q(a.texto)} },\n`;
  }
  o += `  ] },\n`;
}

o += `];

export interface Perfil {
  codigo: string;
  nome: string;
  descricao: string;
  motivadores: string[];
  desmotivadores: string[];
  dicas: string[];
}

export const PERFIS: Perfil[] = [
`;

for (const p of perfis) {
  o += `  {
    codigo: ${q(p.codigo)},
    nome: ${q(p.nome)},
    descricao:
      ${q(p.descricao)},
    motivadores: [
${lista(p.motivadores, 6)}
    ],
    desmotivadores: [
${lista(p.desmotivadores, 6)}
    ],
    dicas: [
${lista(p.dicas, 6)}
    ],
  },
`;
}

o += `];\n`;

const destino = path.join(__dirname, '..', 'src', 'data', 'dnaInstrumento.ts');
fs.writeFileSync(destino, o);
console.log(`ok: ${pares.length} pares (${JSON.stringify(porEixo)}), ${perfis.length} perfis`);
console.log(`escrito em ${destino} (${o.length} bytes)`);
