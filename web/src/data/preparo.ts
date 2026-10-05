/**
 * A preparação de 1:1, buscada por pessoa.
 *
 * Diferente de `PESSOAS` ou `COMPROMISSOS`, este pacote **não** entra na
 * subida. Ele lê o texto de todas as conversas de uma pessoa para detectar
 * tema recorrente e ausente; carregar isso para as vinte e duas na abertura do
 * sistema seria megabytes de markdown para exibir uma tela que trata de uma
 * pessoa por vez.
 *
 * O resultado é escrito nos mesmos Records que as telas já leem de forma
 * síncrona (`PAUTA`, `TEMAS`, `NOVIDADES`, `PROXIMA_CONVERSA`, `NAO_FALAR`).
 * Não é fonte duplicada: esses Records SÃO o cache, exatamente como
 * `REGISTROS` é o cache do índice de conversas. A única diferença é o momento
 * de encher — aqui é sob demanda, e não no boot.
 *
 * Guardar o que já foi buscado evita refazer a consulta quando a tela alterna
 * entre as abas Pauta e Material, que é a interação mais frequente dela.
 */

import { useEffect, useState } from 'react';
import { api, type PreparoAPI } from '../lib/api';
import {
  PAUTA, TEMAS, NOVIDADES, PROXIMA_CONVERSA, NAO_FALAR, COMPROMISSOS,
  type Assunto, type Compromisso, type OrigemAssunto,
} from './mock';

/** Quem já foi buscado nesta sessão. */
const buscados = new Set<string>();

/**
 * Origem do assunto, traduzida para o que a tela conhece.
 *
 * O backend nomeia os gatilhos pelo que eles observam (`regra_tema`,
 * `ata_anterior`); a tela os agrupa pelo que eles significam para quem lê. O
 * fallback é `regra_compromisso` e não um valor novo: um rótulo desconhecido
 * passaria pela tipagem e apareceria como categoria vazia na tela.
 */
function origemDe(s: string): OrigemAssunto {
  switch (s) {
    case 'regra_ausencia': return 'regra_ausencia';
    case 'regra_tema': return 'regra_recorrencia';
    case 'garantia': return 'trava_equilibrio';
    default: return 'regra_compromisso';
  }
}

function aplicar(slug: string, p: PreparoAPI): void {
  PAUTA[slug] = p.assuntos.map((a): Assunto => ({
    id: a.id,
    prioridade: a.prioridade,
    minutos: a.minutos,
    categoria: a.categoria,
    origem: origemDe(a.origem),
    titulo: a.titulo,
    porQueAgora: a.porQueAgora,
    refs: a.refs ?? [],
    pergunta: a.pergunta,
    porQueAssim: a.porQueAssim,
    toca: a.toca ?? [],
    conf: a.conf as Assunto['conf'],
    avisoConf: a.avisoConf,
    herdado: a.herdado,
  }));

  TEMAS[slug] = p.temas;
  NOVIDADES[slug] = p.novidades.map((n) => ({
    tipo: n.tipo, data: n.data,
    conf: (n.conf || 1) as 1 | 2 | 3 | 4,
    texto: n.texto, origem: n.origem, ref: n.ref,
  }));

  if (p.proximaConversa.length > 0) {
    PROXIMA_CONVERSA[slug] = {
      dataOrigem: p.ultimaConversa ?? '',
      itens: p.proximaConversa,
    };
  } else {
    delete PROXIMA_CONVERSA[slug];
  }

  NAO_FALAR[slug] = {
    cicloVigente: p.naoFalar.cicloVigente,
    itens: p.naoFalar.itens.map((i) => ({
      texto: i.texto, conf: (i.conf || 3) as 1 | 2 | 3 | 4, motivo: i.motivo,
    })),
    omitidosNivel4: p.naoFalar.omitidosNivel4,
  };

  // Os compromissos desta pessoa vêm mais frescos que o cache do boot: a
  // mesma consulta rodou agora. Substituir os dela, e só os dela, mantém o
  // board coerente sem descartar o que já estava carregado para os outros.
  const outros = COMPROMISSOS.filter((c) => c.pessoaSlug !== slug);
  const dela = p.compromissos.map((c): Compromisso => ({
    id: c.id,
    pessoa: c.pessoaSlug,
    pessoaSlug: c.pessoaSlug,
    responsavel: c.responsavel === 'ambos' ? 'coordenador' : c.responsavel,
    nomeResp: c.nomeResp,
    descricao: c.descricao,
    prazoTexto: c.prazoTexto,
    prazoDate: c.prazoDate,
    prazoSugerido: c.prazoSugerido,
    natureza: c.natureza,
    venceAgora: c.venceAgora,
    status: c.status as Compromisso['status'],
    origemMeeting: c.origemMeeting,
    herdado: c.herdado,
    prazoVago: c.prazoVago,
    notaHerdado: c.notaHerdado,
  }));
  COMPROMISSOS.length = 0;
  COMPROMISSOS.push(...outros, ...dela);
}

export interface EstadoPreparo {
  carregando: boolean;
  /** A API não respondeu. Distinto de "respondeu e não há nada". */
  offline: boolean;
  /** Muda a cada carga, para a tela re-renderizar com o Record já cheio. */
  versao: number;
}

/**
 * Busca a preparação da pessoa e preenche os Records que as telas leem.
 *
 * Devolve `versao` em vez dos dados: as telas filhas já leem dos Records de
 * forma síncrona, e passar o objeto também criaria dois caminhos para o mesmo
 * dado — que é como eles divergem.
 */
export function usePreparo(slug: string): EstadoPreparo {
  const [estado, setEstado] = useState<EstadoPreparo>({
    carregando: !buscados.has(slug), offline: false, versao: 0,
  });

  useEffect(() => {
    if (!slug) return;
    let vivo = true;

    if (buscados.has(slug)) {
      setEstado((e) => ({ ...e, carregando: false }));
      return;
    }
    setEstado((e) => ({ ...e, carregando: true, offline: false }));

    void api.preparo(slug).then((p) => {
      if (!vivo) return;
      if (!p) {
        setEstado((e) => ({ carregando: false, offline: true, versao: e.versao }));
        return;
      }
      aplicar(slug, p);
      buscados.add(slug);
      setEstado((e) => ({ carregando: false, offline: false, versao: e.versao + 1 }));
    });

    return () => { vivo = false; };
  }, [slug]);

  return estado;
}

/** Esquece o que foi buscado — usado quando a varredura muda o banco. */
export function invalidarPreparo(): void {
  buscados.clear();
}
