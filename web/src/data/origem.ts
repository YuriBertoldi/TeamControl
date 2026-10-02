/**
 * De onde o sistema lê e para onde escreve.
 *
 * O dado de verdade mora no Postgres. O `localStorage` deixa de ser a fonte e
 * vira **cache local**: na subida, `conectar()` busca da API e grava no
 * armazenamento; daí em diante as telas leem do cache, de forma síncrona,
 * exatamente como antes.
 *
 * O desenho é esse por um motivo prático: as telas acessam `PESSOAS` em tempo
 * de módulo. Transformar tudo em `async` tocaria todas as telas de uma vez, a
 * troco de nada — o volume aqui é de dezenas de registros, não de milhares, e
 * cabe inteiro em memória.
 *
 * **Sem API, o sistema continua funcionando** com o último estado conhecido.
 * Não é tolerância a falha por elegância: o backend pode simplesmente não ter
 * sido subido, e travar a tela nesse caso seria hostil. Mas a tela precisa
 * dizer em que modo está — ver `estaOnline()`.
 */

import { api } from '../lib/api';
import { escreverJSON, lerJSON, escrever } from './armazenamento';

let online = false;
let tentouConectar = false;

/** Se a última conexão com a API funcionou. */
export const estaOnline = () => online;

/** Se `conectar()` já rodou — distingue "offline" de "ainda não tentou". */
export const jaTentou = () => tentouConectar;

/**
 * Busca o estado do banco e preenche o cache local.
 *
 * Roda uma vez, antes do primeiro render. Falha não interrompe a subida: o
 * sistema abre com o que estiver no cache.
 */
export async function conectar(): Promise<boolean> {
  tentouConectar = true;
  const s = await api.saude();
  online = s.ok;
  if (!online) return false;

  // Em paralelo: são consultas independentes e pequenas. O índice de registros
  // cabe aqui porque NÃO traz texto — só contagem e metadado. A transcrição e
  // o markdown vêm por `api.registro(id)` quando a conversa é aberta; as 52
  // fontes somam quase 1 MB e não têm por que viajar na abertura da tela.
  const [pessoas, tribos, squads, registros, importacoes] = await Promise.all([
    api.pessoas(), api.tribos(), api.squads(), api.registros(), api.importacoes(),
  ]);

  // Só sobrescreve o cache do que a API de fato devolveu. Uma consulta que
  // falhou sozinha não pode zerar o que o navegador já tinha.
  if (pessoas) escreverJSON('pessoas', pessoas);
  if (tribos) escreverJSON('tribos', tribos);
  if (registros) escreverJSON('registros', registros);
  if (importacoes) escreverJSON('importacoes', importacoes);

  // O caminho vai para chave própria, e não para dentro da config: a config só
  // é persistida quando alguém a edita, então gravar nela aqui criaria um
  // objeto parcial que sobrescreveria o padrão.
  if (s.pasta) escrever("pastaBackend", s.pasta);

  // Squads moram dentro da config, e não numa chave própria. A gravação é
  // feita direto no armazenamento em vez de passar por `salvarConfig` para
  // não criar ciclo de import entre config.ts e este módulo.
  if (squads) {
    const atual = lerJSON<Record<string, unknown>>('config', {});
    escreverJSON('config', { ...atual, squads });
  }

  return true;
}

/**
 * Empurra para a API o que acabou de ser salvo no cache.
 *
 * Dispara sem bloquear a tela — o cache já foi atualizado e a interface já
 * reagiu. Mas a falha **não é engolida**: ela vai para o console e marca o
 * sistema como offline, para a tela parar de prometer persistência que não
 * está acontecendo.
 */
export function sincronizar(
  entidade: 'pessoas' | 'tribos' | 'squads',
  lista: unknown[],
): void {
  if (!online) return;

  const envio = entidade === 'pessoas' ? api.salvarPessoas
              : entidade === 'tribos' ? api.salvarTribos
              : api.salvarSquads;

  void (envio as (l: never) => Promise<unknown>)(lista as never).catch((e: unknown) => {
    online = false;
    console.error(
      `[teamcontrol] falha ao gravar ${entidade} no banco — o sistema passou ` +
      'a trabalhar só com o cache local. O que você salvou está no navegador, ' +
      'não no Postgres.', e);
  });
}
