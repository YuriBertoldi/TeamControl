/**
 * Modelos de planilha e a leitura de volta.
 *
 * Cada domínio tem duas coisas aqui: **o modelo que o sistema gera** e **a
 * leitura do que volta preenchido**. As duas juntas, de propósito — quando o
 * formato muda, muda nos dois lugares ao mesmo tempo, e não num só.
 *
 * O modelo não vem vazio: ele já vem com as pessoas e as skills do cadastro
 * nas linhas. Sem isso, cada pessoa devolve um arquivo com uma grafia
 * diferente de cada nome, e a importação vira adivinhação de quem é quem.
 *
 * **Toda validação devolve o número da linha.** Uma importação que grava 40 de
 * 50 e diz "ok" é pior que uma que falha: as 10 que faltaram só aparecem
 * quando alguém procura por elas, meses depois.
 */

import { PESSOAS, souMeus } from './mock';
import { carregarSkills, skillsDisponiveis } from './cadastro';
import { gerarCSV, lerCSV, indicesDe } from './planilha';

export type TipoModelo = 'skills' | 'autoavaliacao' | 'pdi' | 'trilha' | 'dna';

export interface Modelo {
  tipo: TipoModelo;
  nome: string;
  arquivo: string;
  descricao: string;
  /** O que fazer com o arquivo depois de preenchido. */
  comoUsar: string;
  colunas: string[];
}

export const MODELOS: Modelo[] = [
  {
    tipo: 'skills',
    nome: 'Skills — leitura do líder',
    arquivo: 'modelo-skills-lider.csv',
    descricao:
      'Uma linha por pessoa × skill, já preenchida com o seu time e o catálogo. ' +
      'Nível 0–4; interesse 0–3 é opcional e separado de propósito.',
    comoUsar:
      'Preencha a coluna "nivel" e devolva. Linha sem nível é ignorada — não ' +
      'precisa apagar o que você não vai avaliar agora.',
    colunas: ['pessoa', 'nome', 'skill', 'skill_nome', 'nivel', 'interesse', 'observacao'],
  },
  {
    tipo: 'autoavaliacao',
    nome: 'Skills — autoavaliação',
    arquivo: 'modelo-skills-autoavaliacao.csv',
    descricao:
      'O mesmo formato, mas para a própria pessoa preencher. Entra como ' +
      'origem "autoavaliacao" e NÃO sobrescreve a sua leitura — as duas ' +
      'coexistem, e é a distância entre elas que vira item de pauta.',
    comoUsar:
      'Gere um arquivo por pessoa (filtre antes), mande, e importe o que voltar.',
    colunas: ['pessoa', 'nome', 'skill', 'skill_nome', 'nivel', 'interesse', 'observacao'],
  },
  {
    tipo: 'pdi',
    nome: 'PDI — objetivos',
    arquivo: 'modelo-pdi.csv',
    descricao:
      'Um objetivo por linha, com skill-alvo obrigatória. É ela que transforma ' +
      '"estudar Go", que ninguém consegue cobrar, em algo verificável.',
    comoUsar:
      'nivel_alvo precisa ser maior que nivel_atual. Os marcos vão em linhas ' +
      'próprias, repetindo pessoa e titulo, com a coluna "marco" preenchida.',
    colunas: ['pessoa', 'titulo', 'skill', 'nivel_atual', 'nivel_alvo', 'prazo',
      'marco', 'marco_prazo', 'marco_evidencia'],
  },
  {
    tipo: 'trilha',
    nome: 'Trilha QA → Dev — progresso',
    arquivo: 'modelo-trilha.csv',
    descricao:
      'Um critério por linha, por QA. Critério marcado como atendido EXIGE ' +
      'evidência: critério sem artefato não é verificável.',
    comoUsar:
      'Preencha "atendido_em" (AAAA-MM-DD) e "evidencia" nas linhas concluídas. ' +
      'Baixe este modelo sempre atualizado — os ids dos critérios vêm junto.',
    colunas: ['pessoa', 'nome', 'criterio_id', 'nivel', 'descricao', 'artefato',
      'atendido_em', 'evidencia', 'nota'],
  },
  {
    tipo: 'dna',
    nome: 'DNA motivacional — totais',
    arquivo: 'modelo-dna.csv',
    descricao:
      'Os seis totais por pessoa, no formato da planilha que já circula. ' +
      'Alternativa ao questionário de 21 pares quando a pessoa já respondeu fora.',
    comoUsar:
      'Preencha os seis totais. A apuração e o texto do perfil são gerados na ' +
      'importação, e aparecem para conferência ANTES de salvar.',
    colunas: ['pessoa', 'nome', 'tecnico', 'gerencial', 'autonomia',
      'seguranca', 'servico', 'desafio'],
  },
];

export const modeloDe = (t: TipoModelo) => MODELOS.find((m) => m.tipo === t);

/* ---------- geração ---------- */

/**
 * Monta o modelo já preenchido com quem e o quê.
 *
 * `apenas` limita a uma pessoa, que é como a autoavaliação é distribuída: cada
 * um recebe só as próprias linhas. Mandar a planilha do time inteiro para a
 * pessoa avaliar a si mesma exporia a leitura que você fez dos colegas dela.
 */
export function gerarModelo(tipo: TipoModelo, apenas?: string): string {
  const m = modeloDe(tipo);
  if (!m) return '';
  const pessoas = (apenas ? PESSOAS.filter((p) => p.slug === apenas) : souMeus());

  switch (tipo) {
    case 'skills':
    case 'autoavaliacao': {
      const linhas: string[][] = [];
      pessoas.forEach((p) => {
        // Só as skills que valem para a família do cargo: mandar "Robot
        // Framework" para quem é de produto é ruído que ninguém preenche.
        const skills = skillsDisponiveis(p.familia);
        (skills.length ? skills : carregarSkills()).forEach((s) => {
          linhas.push([p.slug, p.nome, s.codigo, s.nome, '', '', '']);
        });
      });
      return gerarCSV(m.colunas, linhas);
    }
    case 'pdi':
      return gerarCSV(m.colunas,
        pessoas.map((p) => [p.slug, '', '', '', '', '', '', '', '']));
    case 'dna':
      return gerarCSV(m.colunas,
        pessoas.map((p) => [p.slug, p.nome, '', '', '', '', '', '']));
    default:
      // Trilha depende dos critérios que vêm do banco; ver `gerarModeloTrilha`.
      return gerarCSV(m.colunas, []);
  }
}

/** A trilha precisa dos ids de critério, que moram no banco. */
export function gerarModeloTrilha(
  niveis: { codigo: string }[],
  pessoas: { pessoa: string; criterios: { id: number; nivel: string; descricao: string;
                                          artefato?: string; atendidoEm?: string;
                                          evidencia?: string; nota?: string }[] }[],
): string {
  void niveis;
  const m = modeloDe('trilha')!;
  const linhas: string[][] = [];
  pessoas.forEach((p) => {
    const nome = PESSOAS.find((x) => x.slug === p.pessoa)?.nome ?? p.pessoa;
    p.criterios.forEach((c) => {
      linhas.push([p.pessoa, nome, String(c.id), c.nivel, c.descricao,
        c.artefato ?? '', c.atendidoEm ?? '', c.evidencia ?? '', c.nota ?? '']);
    });
  });
  return gerarCSV(m.colunas, linhas);
}

/* ---------- leitura ---------- */

export interface LinhaSkill {
  pessoa: string; skill: string; skillNome: string;
  nivel: number; interesse?: number; observacao?: string; origem: string;
}

export interface Leitura<T> {
  itens: T[];
  /** Linha a linha, com o número — ver o comentário de topo. */
  problemas: string[];
  /** Linhas em branco que foram puladas sem drama. */
  ignoradas: number;
}

const inteiro = (s: string): number | null => {
  const t = (s ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
};

/** Lê a planilha de skills, do líder ou da própria pessoa. */
export function lerSkills(texto: string, origem: 'coordenador' | 'autoavaliacao'): Leitura<LinhaSkill> {
  const out: Leitura<LinhaSkill> = { itens: [], problemas: [], ignoradas: 0 };
  const linhas = lerCSV(texto);
  if (linhas.length < 2) {
    out.problemas.push('arquivo sem linhas além do cabeçalho');
    return out;
  }
  const col = indicesDe(linhas[0], ['pessoa', 'skill', 'skill_nome', 'nivel', 'interesse', 'observacao']);
  for (const obrig of ['pessoa', 'skill', 'nivel']) {
    if (col[obrig] < 0) {
      out.problemas.push(`falta a coluna "${obrig}" — baixe o modelo novamente`);
      return out;
    }
  }

  const conhecidos = new Set(PESSOAS.map((p) => p.slug));
  const skills = new Map(carregarSkills().map((s) => [s.codigo, s.nome]));

  linhas.slice(1).forEach((l, i) => {
    const n = i + 2; // +1 do cabeçalho, +1 porque o Excel conta de 1
    const pessoa = (l[col.pessoa] ?? '').trim();
    const skill = (l[col.skill] ?? '').trim();
    const nivel = inteiro(l[col.nivel] ?? '');

    // Linha sem nível é intencional: o modelo vem com todas as combinações e
    // ninguém preenche todas de uma vez. Reclamar disso faria a importação
    // devolver centenas de "problemas" que não são problema nenhum.
    if (nivel === null) { out.ignoradas++; return; }
    if (!pessoa || !skill) {
      out.problemas.push(`linha ${n}: falta pessoa ou skill`); return;
    }

    // Erro de ESCALA antes de erro de cadastro, e a ordem não é arbitrária.
    // Os dois podem estar na mesma linha, e só um é reportado — então vale
    // reportar o que a pessoa de fato digitou. O slug vem pronto no modelo e
    // raramente é tocado; o nível é o campo que ela preencheu à mão.
    const interesse = col.interesse >= 0 ? inteiro(l[col.interesse] ?? '') : null;
    if (nivel < 0 || nivel > 4) {
      out.problemas.push(`linha ${n}: nível ${nivel} fora da escala 0–4`); return;
    }
    if (interesse !== null && (interesse < 0 || interesse > 3)) {
      out.problemas.push(`linha ${n}: interesse ${interesse} fora da escala 0–3`); return;
    }
    if (!conhecidos.has(pessoa)) {
      out.problemas.push(`linha ${n}: "${pessoa}" não está no cadastro de pessoas`); return;
    }

    out.itens.push({
      pessoa, skill,
      skillNome: (col.skill_nome >= 0 ? l[col.skill_nome] : '') || skills.get(skill) || skill,
      nivel,
      interesse: interesse ?? undefined,
      observacao: col.observacao >= 0 ? (l[col.observacao] ?? '').trim() || undefined : undefined,
      origem,
    });
  });
  return out;
}

export interface LinhaTrilha {
  pessoa: string; criterioId: number;
  atendidoEm: string; evidencia: string; nota: string;
}

/** Lê o progresso da trilha. */
export function lerTrilha(texto: string): Leitura<LinhaTrilha> {
  const out: Leitura<LinhaTrilha> = { itens: [], problemas: [], ignoradas: 0 };
  const linhas = lerCSV(texto);
  if (linhas.length < 2) {
    out.problemas.push('arquivo sem linhas além do cabeçalho');
    return out;
  }
  const col = indicesDe(linhas[0], ['pessoa', 'criterio_id', 'atendido_em', 'evidencia', 'nota']);
  for (const obrig of ['pessoa', 'criterio_id']) {
    if (col[obrig] < 0) {
      out.problemas.push(`falta a coluna "${obrig}" — baixe o modelo novamente`);
      return out;
    }
  }

  linhas.slice(1).forEach((l, i) => {
    const n = i + 2;
    const pessoa = (l[col.pessoa] ?? '').trim();
    const id = inteiro(l[col.criterio_id] ?? '');
    const atendido = col.atendido_em >= 0 ? (l[col.atendido_em] ?? '').trim() : '';
    const evidencia = col.evidencia >= 0 ? (l[col.evidencia] ?? '').trim() : '';

    if (!atendido) { out.ignoradas++; return; }
    if (!pessoa || id === null) {
      out.problemas.push(`linha ${n}: falta pessoa ou criterio_id`); return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(atendido)) {
      out.problemas.push(`linha ${n}: "${atendido}" não é uma data AAAA-MM-DD`); return;
    }
    // A trava que importa: critério sem artefato não é verificável, e critério
    // não verificável vira avaliação de simpatia.
    if (!evidencia) {
      out.problemas.push(
        `linha ${n}: marcado como atendido sem evidência — descreva o artefato que comprova`);
      return;
    }
    out.itens.push({ pessoa, criterioId: id, atendidoEm: atendido, evidencia,
      nota: col.nota >= 0 ? (l[col.nota] ?? '').trim() : '' });
  });
  return out;
}
