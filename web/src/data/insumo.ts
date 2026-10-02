/**
 * Insumo para a IA responder as perguntas abertas da AVD.
 *
 * A direção da causalidade é a regra mais importante aqui: NOTA → TEXTO,
 * nunca texto → nota. O sistema não propõe a nota do driver nem o quadrante;
 * ele junta o que já está registrado, com `ref_code` em cada item, e pede uma
 * redação ancorada. Na mesa de calibragem você precisa acreditar no que
 * defende, e acreditar exige ter julgado.
 *
 * Três travas que viajam dentro do próprio pacote, porque regra que mora só
 * no manual não é cumprida:
 *   1. DNA motivacional nunca entra — motivação não é argumento de desempenho.
 *   2. Nada de nível 4 (restrito_saude) e nada marcado "fica entre nós".
 *   3. O que foi omitido aparece como CONTAGEM e motivo, nunca como conteúdo:
 *      quem lê precisa saber que não viu tudo, senão escreve uma afirmação de
 *      completude falsa.
 */

import {
  PESSOAS, COMPROMISSOS, TEMAS, PAUTA, HOJE, diasEntre, dataBR, nivelDe,
  type Pessoa,
} from './mock';
import { NIVEIS, AUTO, SKILLS, AVD, QAS, PDIS, TRILHA } from './mockCiclo';
import { skillsDoCargo } from './cadastro';
import type { Ciclo, PerguntaAberta, FonteInsumo } from './ciclos';

export interface Insumo {
  /** O texto pronto para colar no Claude Code. */
  prompt: string;
  /** Quantos itens entraram, por fonte — a tela mostra antes de gerar. */
  contagem: Record<string, number>;
  /** Quantos itens o filtro de confidencialidade tirou, e por quê. */
  omitidos: { quantidade: number; motivo: string }[];
  /** Avisos que impedem gerar com lastro ruim. */
  avisos: string[];
}

const linha = (s: string) => `${s}\n`;

/** Evidências citáveis da pessoa, reaproveitando as refs já acumuladas. */
function evidenciasDe(slug: string) {
  return (PAUTA[slug] ?? [])
    // Assunto de origem confidencial não vira justificativa de AVD: a pauta é
    // sua, a justificativa vai para o RH.
    .filter((a) => (a.conf ?? 1) <= 2)
    .flatMap((a) => a.refs.map((ref) => ({ ref, fato: a.porQueAgora, tema: a.categoria })));
}

function omitidasDe(slug: string) {
  return (PAUTA[slug] ?? []).filter((a) => (a.conf ?? 1) > 2);
}

export function montarInsumo(
  slug: string, pergunta: PerguntaAberta, ciclo: Ciclo,
): Insumo {
  const p = PESSOAS.find((x) => x.slug === slug);
  if (!p) {
    return { prompt: '', contagem: {}, omitidos: [],
             avisos: ['Pessoa não encontrada no cadastro.'] };
  }

  const contagem: Record<string, number> = {};
  const avisos: string[] = [];
  let out = '';

  out += linha(`# Insumo para a pergunta aberta — ${ciclo.nome}`);
  out += linha('');
  out += linha(`Pessoa: ${p.nome} · ${p.cargo}${p.techLead ? ' · Tech Lead' : ''}`);
  out += linha(`Período avaliado: ${dataBR(ciclo.inicio)} a ${dataBR(ciclo.fim)}`);
  out += linha(`Escala do ciclo: ${ciclo.escalaMin}–${ciclo.escalaMax} (${
    ciclo.rotulosEscala.join(' · ')})`);
  out += linha('');
  out += linha('## Pergunta a responder, como está na portal de avaliação');
  out += linha('');
  out += linha(`> ${pergunta.texto}`);
  if (pergunta.limite) out += linha(`> (limite de ${pergunta.limite} caracteres)`);
  out += linha('');

  out += linha('## Regras da redação');
  out += linha('');
  out += linha('- Só afirme o que está nos dados abaixo. Nada de inferência livre.');
  out += linha('- Toda afirmação de fato cita o ref_code entre colchetes: [EV-...].');
  out += linha('- Todo número do texto tem que existir nos dados. Número inventado é a');
  out += linha('  alucinação mais convincente e a mais cara numa mesa de calibragem.');
  out += linha('- Afirmação de PADRÃO exige ao menos duas fontes distintas.');
  out += linha('- Não proponha nota, quadrante, mérito, promoção, aumento ou próximo nível.');
  out += linha('- Primeira pessoa, voz de coordenador, sem adjetivo sem lastro.');
  out += linha('');

  /* ---- fontes ---- */

  const quer = (f: FonteInsumo) => pergunta.fontes.includes(f);

  if (quer('evidencias')) {
    const evs = evidenciasDe(slug);
    contagem['Evidências'] = evs.length;
    out += linha('## Evidências rastreáveis');
    out += linha('');
    if (evs.length === 0) {
      out += linha('_Nenhuma evidência registrada no período._');
      avisos.push('Sem nenhuma evidência: a resposta sairia sem lastro nenhum.');
    }
    for (const e of evs) out += linha(`- [${e.ref}] (${e.tema}) ${e.fato}`);
    out += linha('');
  }

  if (quer('trajetoria')) {
    contagem['Avaliações mensais'] = p.trajetoria.length;
    out += linha('## Trajetória das avaliações mensais');
    out += linha('');
    out += linha(p.trajetoria.length
      ? p.trajetoria.map((t) => (t === 'af' ? 'afastado' : t === 'E' ? 'Excepcional' : t === 'S' ? 'Satisfatório' : t)).join(' · ')
      : '_Sem avaliação mensal registrada no período._');
    out += linha('');
    out += linha('A série vai inteira, não selecionada: escolher os meses bons é o');
    out += linha('jeito mais rápido de produzir uma peça que a mesa derruba.');
    out += linha('');
  }

  if (quer('compromissos')) {
    const cs = COMPROMISSOS.filter((c) => c.pessoa === slug);
    contagem['Compromissos'] = cs.length;
    out += linha('## Compromissos do período');
    out += linha('');
    for (const c of cs) {
      const atraso = c.prazoDate && diasEntre(c.prazoDate, HOJE) > 0
        ? ` — vencido há ${diasEntre(c.prazoDate, HOJE)} dias` : '';
      out += linha(`- [${c.status}] (${c.nomeResp}) ${c.descricao}${atraso}`);
    }
    // Compromisso do coordenador vencido é dado sobre VOCÊ, e distorce a
    // leitura do liderado se entrar na mesma lista sem marcação.
    const meus = cs.filter((c) => c.responsavel === 'coordenador' && c.status !== 'concluido');
    if (meus.length) {
      out += linha('');
      out += linha(`Atenção: ${meus.length} destes são compromissos SEUS em aberto.`);
      out += linha('Atraso causado por dependência sua não é falha de execução da pessoa.');
    }
    out += linha('');
  }

  if (quer('skills')) {
    const esperado = skillsDoCargo(p.cargo, p.techLead);
    const atual = NIVEIS[slug] ?? {};
    const nome = (cod: string) => SKILLS.find((s) => s.codigo === cod)?.nome ?? cod;
    contagem['Skills da cadeira'] = esperado.length;
    out += linha(`## Skills esperadas da cadeira (${p.cargo})`);
    out += linha('');
    for (const e of esperado) {
      const n = atual[e.codigo] ?? 0;
      const a = AUTO[slug]?.[e.codigo];
      const marca = n < e.nivelEsperado ? ' ← abaixo do esperado' : '';
      out += linha(`- ${nome(e.codigo)}: líder ${n} / esperado ${e.nivelEsperado}${
        a !== undefined ? ` / autoavaliação ${a}` : ''}${marca}`);
    }
    const divergentes = esperado.filter((e) => {
      const a = AUTO[slug]?.[e.codigo];
      return a !== undefined && Math.abs(a - (atual[e.codigo] ?? 0)) >= 2;
    });
    if (divergentes.length) {
      out += linha('');
      out += linha(`${divergentes.length} skill(s) com divergência de 2+ níveis entre a`);
      out += linha('autoavaliação e a sua leitura. Isso é conversa a ter, não conclusão.');
    }
    out += linha('');
  }

  if (quer('trilha')) {
    const q = QAS.find((x) => x.slug === slug);
    contagem['Critérios de trilha'] = q?.progresso.length ?? 0;
    out += linha('## Trilha QA → Dev');
    out += linha('');
    if (!q) {
      out += linha('_Pessoa não está na trilha QA → Dev._');
    } else {
      const criterios = TRILHA.find((n) => n.id === q.nivelAlvo)?.criterios ?? [];
      out += linha(`Nível atual ${q.nivelAtual} · alvo ${q.nivelAlvo}`);
      q.progresso.forEach((c, i) => {
        const parado = (c.diasParado ?? 0) > 0 ? ` — parado há ${c.diasParado} dias` : '';
        const ev = c.evidencia ? ` [${c.evidencia}]` : '';
        out += linha(`- [${c.feito ? 'x' : ' '}] ${criterios[i] ?? `critério ${i + 1}`}${parado}${ev}`);
      });
      if (q.bloqueio) {
        out += linha('');
        out += linha(`Hipótese de bloqueio registrada: ${q.bloqueio}`);
        if (q.bloqueioEhMeu) out += linha('Este bloqueio foi classificado como responsabilidade do coordenador.');
      }
      out += linha('');
      out += linha('Critério parado pode ser falta de OPORTUNIDADE, não de competência —');
      out += linha('e nesse caso o encaminhamento é do coordenador. Diga qual dos dois');
      out += linha('os dados sustentam, ou diga que não dá para distinguir.');
    }
    out += linha('');
  }

  if (quer('pdi')) {
    const pdi = PDIS.find((x) => x.slug === slug);
    contagem['Objetivos de PDI'] = pdi?.objetivos.length ?? 0;
    out += linha('## PDI');
    out += linha('');
    if (!pdi) {
      out += linha('_Sem PDI registrado._');
      avisos.push('Sem PDI: a pergunta de desenvolvimento ficará sem plano para citar.');
    } else {
      for (const o of pdi.objetivos) {
        out += linha(`- ${o.titulo} — ${o.porQue}`);
        for (const m of o.marcos) {
          out += linha(`  - [${m.status}] ${m.titulo} (skill ${m.skill} → nível ${m.nivelAlvo}, até ${dataBR(m.prazo)})`);
        }
      }
    }
    out += linha('');
  }

  if (quer('registros_1a1')) {
    const t = TEMAS[slug];
    contagem['Temas recorrentes'] = t?.recorrentes.length ?? 0;
    out += linha('## Temas das 1:1 do período');
    out += linha('');
    if (!t) {
      out += linha('_Sem 1:1 processada no período._');
      avisos.push('Nenhuma 1:1 processada: processe as transcrições antes de gerar.');
    } else {
      for (const r of t.recorrentes) out += linha(`- Recorrente: ${r.tema} — ${r.ocorrencias} das últimas ${r.janela} conversas. ${r.nota} [${r.refs.join(", ")}]`);
      for (const a of t.ausentes) out += linha(`- Ausente: ${a.tema} — sem menção há ${a.conversasSem} conversas${a.ultimo ? ` (último registro ${dataBR(a.ultimo)})` : ""}`);
    }
    out += linha('');
  }

  if (quer('feedbacks')) {
    const av = AVD.find((a) => a.slug === slug);
    const buracos = (av?.semEvidenciaComp.length ?? 0) + (av?.semEvidenciaDesemp.length ?? 0);
    contagem['Drivers sem evidência'] = buracos;
    if (buracos > 0) {
      out += linha('## Drivers ainda sem evidência vinculada');
      out += linha('');
      for (const i of av!.semEvidenciaComp) out += linha(`- ${ciclo.driversComportamento[i]}`);
      for (const i of av!.semEvidenciaDesemp) out += linha(`- ${ciclo.driversDesempenho[i]}`);
      out += linha('');
      out += linha('Não escreva nada sobre estes drivers: não há do que partir.');
      out += linha('');
      avisos.push(`${buracos} driver(s) sem evidência — o buraco aparece na mesa.`);
    }
  }

  /* ---- contra-evidência: bloco separado e obrigatório ---- */

  out += linha('## Contra-evidências (bloco obrigatório)');
  out += linha('');
  const contra = (PAUTA[slug] ?? []).filter(
    (a) => a.categoria === 'Risco' && (a.conf ?? 1) <= 2);
  if (contra.length === 0) {
    out += linha('_Nenhuma contra-evidência registrada._');
    out += linha('Diga isso explicitamente na resposta. Avaliação só com evidência');
    out += linha('positiva é peça de advocacia, e é o que a mesa derruba primeiro.');
  } else {
    for (const c of contra) out += linha(`- ${c.titulo}: ${c.porQueAgora} [${c.refs.join(', ')}]`);
  }
  out += linha('');

  /* ---- o que ficou de fora ---- */

  const om = omitidasDe(slug);
  const omitidos = om.length
    ? [{ quantidade: om.length,
         motivo: 'confidencialidade acima do que uma justificativa de AVD comporta' }]
    : [];

  out += linha('## O que foi omitido deste pacote');
  out += linha('');
  out += linha(om.length
    ? `${om.length} item(ns) foram filtrados por confidencialidade. O conteúdo não está aqui e não deve ser inferido.`
    : 'Nada foi filtrado por confidencialidade neste pacote.');
  out += linha('DNA motivacional foi excluído por desenho: motivação não é argumento');
  out += linha('válido numa avaliação de desempenho.');
  out += linha('');
  out += linha('Você não viu tudo. Qualifique a conclusão de acordo — não escreva');
  out += linha('"não há registro de X" sobre um assunto que pode estar entre os omitidos.');

  if (p.status === 'afastado') {
    avisos.push('Pessoa afastada no período: o tempo de afastamento sai do cálculo.');
  }
  if (!p.elegivel) {
    avisos.push(`Fora do ciclo: ${p.motivoInelegivel ?? 'inelegível'}.`);
  }

  return { prompt: out, contagem, omitidos, avisos };
}

/** Quanto lastro a pessoa tem hoje — a tela ordena por quem está mais pobre. */
export function lastroDe(p: Pessoa): number {
  return evidenciasDe(p.slug).length;
}

export const resumoPessoa = (p: Pessoa) =>
  `${p.cargo}${p.techLead ? ' · Tech Lead' : ''} · ${nivelDe(p)} · ${lastroDe(p)} evidências`;
