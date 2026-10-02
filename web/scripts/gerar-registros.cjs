/**
 * Gera src/data/registros.ts a partir dos registros reais de 1:1.
 *
 * Os 28 `.md` da pasta já têm a estrutura de três partes que o sistema modela
 * (compartilhável, privado do coordenador, avaliação da portal de avaliação) mais a
 * seção "Omitido de propósito". Em vez de inventar um histórico de exemplo, o
 * timeline da pessoa é montado do que existe — é a única forma de julgar se a
 * tela funciona contra a bagunça real.
 *
 * O CONTEÚDO INTEGRAL NÃO É COPIADO. Vai para o mock só o que a lista precisa
 * mostrar: data, duração, fonte, tema, contagens e a classificação de
 * confidencialidade de cada parte. O texto continua no arquivo, e no sistema
 * final virá do banco com o filtro de audiência aplicado em SQL.
 *
 * Uso: node scripts/gerar-registros.cjs <pasta registros-demo>
 */

const fs = require('fs');
const path = require('path');

const raiz = process.argv[2];
if (!raiz) {
  console.error('uso: node scripts/gerar-registros.cjs <pasta registros-demo>');
  process.exit(1);
}

const dir = path.join(raiz, 'registros-1-1');
const arquivos = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();

/**
 * Corpo de uma seção, do cabeçalho até o próximo cabeçalho.
 *
 * Feito varrendo linhas e não com regex: com a flag `m`, o `$` casa no fim de
 * QUALQUER linha, e um `[\s\S]*?` preguiçoso para na primeira — a seção voltava
 * vazia e a contagem de encaminhamentos dava zero.
 */
function secao(texto, titulo) {
  const linhas = texto.split('\n');
  const inicio = linhas.findIndex((l) => new RegExp(`^#{1,3}\\s+${titulo}`, 'i').test(l));
  if (inicio < 0) return '';
  let fim = linhas.length;
  for (let i = inicio + 1; i < linhas.length; i++) {
    if (/^#{1,3}\s+\S/.test(linhas[i])) { fim = i; break; }
  }
  return linhas.slice(inicio + 1, fim).join('\n');
}

function linhasDeTabela(bloco) {
  return bloco.split('\n')
    .filter((l) => l.trim().startsWith('|'))
    // Cabeçalho e separador não são dados.
    .filter((l) => !/^\|[\s|:-]+\|$/.test(l.trim()))
    .slice(1);
}

const registros = [];

for (const nome of arquivos) {
  const txt = fs.readFileSync(path.join(dir, nome), 'utf8');
  const m = nome.match(/^(\d{4}-\d{2}-\d{2})_([a-z-]+?)(?:_compartilhavel)?\.md$/);
  if (!m) { console.warn('nome fora do padrão:', nome); continue; }
  const [, data, slug] = m;

  const campo = (rotulo) =>
    ((txt.match(new RegExp(`^\\*\\*${rotulo}:\\*\\*\\s*(.+)$`, 'm')) || [])[1] || '').trim();

  const encaminhamentos = linhasDeTabela(secao(txt, 'Encaminhamentos'));
  const proxima = secao(txt, 'Para a próxima conversa')
    .split('\n').filter((l) => /^\s*[-*\d]/.test(l));

  /** Última coluna da tabela é o prazo. */
  const prazoDe = (linha) => {
    const cols = linha.split('|').map((c) => c.trim()).filter(Boolean);
    return cols[cols.length - 1] || '';
  };
  /** Primeira coluna é o responsável. */
  const respDe = (linha) => {
    const cols = linha.split('|').map((c) => c.trim()).filter(Boolean);
    return cols[0] || '';
  };

  // Prazo vago é o que nunca virou data computável — "Imediato", "Próximas
  // semanas", "Até a próxima 1:1". É a dor central do acervo: sem data, não há
  // como responder "o que está vencido hoje".
  const prazosVagos = encaminhamentos.filter((l) => !/\d{1,2}\/\d{1,2}/.test(prazoDe(l)));

  // Encaminhamento do coordenador é o que mais some, porque não há ninguém
  // para cobrar. Contar separado é o que faz ele aparecer na preparação.
  const meus = encaminhamentos.filter((l) => /^yuri\b/i.test(respDe(l)));

  const temPrivado = /^#\s+Parte 2\s+—\s+Registro privado/m.test(txt);
  const temAvaliacao = /^#\s+Avaliação do 1:1/m.test(txt);
  // "Omitido de propósito" é uma TABELA (Item | Onde foi omitido | Motivo),
  // não uma lista. Contar bullets dava zero em todos os 28 arquivos.
  const itensOmitidos = linhasDeTabela(secao(txt, 'Omitido'));

  // Saúde é o único nível 4, e a detecção é por LINHA, não pelo bloco inteiro:
  // testar o texto todo marcava como sensível qualquer registro que citasse
  // "afastamento" por outro motivo. Aqui erra-se para o lado seguro — na
  // dúvida o item não circula —, mas sem contaminar o registro inteiro.
  const saude = itensOmitidos.filter((l) => /sa[úu]de|m[ée]dic[ao]|licen[çc]a m[ée]dica/i.test(l));

  // Quantos itens saíram do compartilhável mas ficaram no privado. É a
  // diferença entre "foi cortado" e "foi perdido".
  const mantidosNoPrivado = itensOmitidos.filter((l) => /mantid[ao].{0,20}privado/i.test(l));

  registros.push({
    slug,
    data,
    arquivo: nome,
    duracao: campo('Duração'),
    fonte: campo('Fonte'),
    tema: campo('Tema'),
    performance: (txt.match(/\*\*1\.\s*Performance:\*\*\s*`([^`]+)`/) || [])[1] || null,
    impacto: Number((txt.match(/\*\*2\.\s*Impacto[^`]*`(\d)`/) || [])[1]) || null,
    encaminhamentos: encaminhamentos.length,
    prazosVagos: prazosVagos.length,
    meus: meus.length,
    proximaConversa: proxima.length,
    // Só a Parte 1 é entregável ao liderado.
    partes: [
      { formato: 'compartilhavel', conf: 1 },
      ...(temPrivado ? [{ formato: 'privado_coordenador', conf: 3 }] : []),
      ...(temAvaliacao ? [{ formato: 'avaliacao_1a1', conf: 2 }] : []),
    ],
    omitidos: itensOmitidos.length,
    omitidoSaude: saude.length,
    omitidoNoPrivado: mantidosNoPrivado.length,
    bytes: Buffer.byteLength(txt),
  });
}

/* ---------- feedbacks avulsos ---------- */

const feedbacks = [];
function varrerFeedback(base) {
  for (const entrada of fs.readdirSync(base, { withFileTypes: true })) {
    const p = path.join(base, entrada.name);
    if (entrada.isDirectory()) {
      if (/^\./.test(entrada.name) || entrada.name === 'node_modules') continue;
      varrerFeedback(p);
    } else if (/eedback/i.test(p) && entrada.name.endsWith('.md')) {
      const txt = fs.readFileSync(p, 'utf8');
      const rel = path.relative(raiz, p).replace(/\\/g, '/');
      const data = (entrada.name.match(/(\d{4}-\d{2}-\d{2})/) || [])[1]
        || (entrada.name.match(/(\d{2})-(\d{2})-(\d{2})/) || []).slice(1).reverse().join('-');
      feedbacks.push({
        slug: rel.split('/')[0].toLowerCase(),
        data: data || '',
        titulo: (txt.match(/^#\s+(.+)$/m) || [])[1] || entrada.name.replace(/\.md$/, ''),
        arquivo: rel,
        bytes: Buffer.byteLength(txt),
      });
    }
  }
}
varrerFeedback(raiz);

/* ---------- saída ---------- */

const q = (v) => JSON.stringify(v);

let o = `/**
 * Registros de 1:1 e feedbacks — o acervo, indexado.
 *
 * GERADO por scripts/gerar-registros.cjs a partir da pasta registros-demo.
 * Não editar à mão.
 *
 * O que está aqui é o ÍNDICE, não o conteúdo: data, duração, fonte, tema,
 * contagens e a confidencialidade de cada parte. O texto integral continua no
 * arquivo e, no sistema final, vem do banco com o filtro de audiência aplicado
 * em SQL — antes de qualquer tela ou LLM ver.
 *
 * Cada registro tem até três partes com confidencialidade própria:
 *   1 Parte 1, compartilhável  — o que você entrega à pessoa
 *   3 Parte 2, privado         — sua leitura, nunca sai daqui
 *   2 Avaliação da portal de avaliação   — Performance e Impacto do mês
 * Mais a seção "Omitido de propósito", que registra QUE existe material
 * cortado e por quê, sem o conteúdo. Quando o motivo é saúde, nem a contagem
 * detalhada circula.
 */

export interface ParteRegistro {
  formato: 'compartilhavel' | 'privado_coordenador' | 'avaliacao_1a1';
  /** 1 público ao liderado · 2 RH/calibragem · 3 privado · 4 restrito saúde. */
  conf: 1 | 2 | 3 | 4;
}

export interface Registro1a1 {
  slug: string;
  data: string;
  arquivo: string;
  duracao: string;
  fonte: string;
  tema: string;
  /** Avaliação mensal da portal de avaliação registrada na conversa, quando houve. */
  performance: string | null;
  impacto: number | null;
  encaminhamentos: number;
  /** Encaminhamentos cujo prazo nunca virou data — a dor central do acervo. */
  prazosVagos: number;
  /** Quantos são seus. É o que mais morre em silêncio. */
  meus: number;
  proximaConversa: number;
  partes: ParteRegistro[];
  /** Quantos itens foram deliberadamente cortados dos registros. */
  omitidos: number;
  /** Destes, quantos são de saúde — nível 4, não sai nem para o RH. */
  omitidoSaude: number;
  /** Quantos saíram do compartilhável mas seguem no registro privado. */
  omitidoNoPrivado: number;
  bytes: number;
}

export const REGISTROS: Registro1a1[] = [
`;

for (const r of registros) {
  o += `  { slug: ${q(r.slug)}, data: ${q(r.data)}, arquivo: ${q(r.arquivo)},\n`;
  o += `    duracao: ${q(r.duracao)}, fonte: ${q(r.fonte)},\n`;
  o += `    tema: ${q(r.tema)},\n`;
  o += `    performance: ${q(r.performance)}, impacto: ${q(r.impacto)},\n`;
  o += `    encaminhamentos: ${r.encaminhamentos}, prazosVagos: ${r.prazosVagos}, meus: ${r.meus}, proximaConversa: ${r.proximaConversa},\n`;
  o += `    partes: ${JSON.stringify(r.partes)},\n`;
  o += `    omitidos: ${r.omitidos}, omitidoSaude: ${r.omitidoSaude}, omitidoNoPrivado: ${r.omitidoNoPrivado}, bytes: ${r.bytes} },\n`;
}

o += `];

export interface Feedback {
  slug: string;
  data: string;
  titulo: string;
  arquivo: string;
  bytes: number;
}

/**
 * Feedbacks avulsos — registrados fora da 1:1.
 *
 * Hoje existe exatamente um na pasta, numa subpasta solta. É justamente o tipo
 * de evidência que sumiria na hora da AVD, e o motivo de o banco de feedbacks
 * existir como superfície própria em vez de virar mais um parágrafo de ata.
 */
export const FEEDBACKS: Feedback[] = [
`;

for (const f of feedbacks) {
  o += `  { slug: ${q(f.slug)}, data: ${q(f.data)},\n    titulo: ${q(f.titulo)},\n`;
  o += `    arquivo: ${q(f.arquivo)}, bytes: ${f.bytes} },\n`;
}

o += `];\n`;

const destino = path.join(__dirname, '..', 'src', 'data', 'registros.ts');
fs.writeFileSync(destino, o);

const porPessoa = {};
for (const r of registros) porPessoa[r.slug] = (porPessoa[r.slug] || 0) + 1;
console.log(`${registros.length} registros de ${Object.keys(porPessoa).length} pessoas`);
console.log(`${feedbacks.length} feedback(s) avulso(s)`);
const tot = (c) => registros.reduce((s, r) => s + r[c], 0);
console.log(`encaminhamentos: ${tot('encaminhamentos')} · prazo vago: ${tot('prazosVagos')} · seus: ${tot('meus')}`);
console.log(`omitidos: ${tot('omitidos')} · de saúde: ${tot('omitidoSaude')} · mantidos no privado: ${tot('omitidoNoPrivado')}`);
console.log(`escrito em ${destino}`);
