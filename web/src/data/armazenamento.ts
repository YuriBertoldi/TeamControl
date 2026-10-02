/**
 * Leitura e escrita no `localStorage`, com migração do nome antigo.
 *
 * O prefixo das chaves mudou quando o projeto foi renomeado. Trocá-lo sem
 * mais nada faria o navegador de quem já usava o sistema voltar ao seed:
 * pessoas cadastradas, ciclos ajustados e leituras de DNA sumiriam sem erro
 * nenhum — o pior tipo de perda, porque parece que nunca existiu.
 *
 * `ler` procura a chave nova; não achando, busca a antiga, copia para a nova e
 * remove a velha. A migração acontece uma vez, na primeira leitura, e some.
 */

const PREFIXO = 'teamcontrol';
/** Prefixo usado antes do rename. Some quando não restar navegador com ele. */
const PREFIXO_ANTIGO = 'timebertoldi';

export const chave = (nome: string) => `${PREFIXO}.${nome}`;

/**
 * Valor cru da chave, migrando do prefixo antigo quando necessário.
 * Devolve `null` quando não existe em nenhum dos dois.
 */
export function ler(nome: string): string | null {
  try {
    const atual = localStorage.getItem(chave(nome));
    if (atual !== null) return atual;

    const antigo = localStorage.getItem(`${PREFIXO_ANTIGO}.${nome}`);
    if (antigo === null) return null;

    localStorage.setItem(chave(nome), antigo);
    localStorage.removeItem(`${PREFIXO_ANTIGO}.${nome}`);
    return antigo;
  } catch {
    // Modo privado do navegador e políticas de armazenamento podem derrubar o
    // acesso. Perder a persistência é aceitável; derrubar a tela, não.
    return null;
  }
}

export function escrever(nome: string, valor: string): void {
  try {
    localStorage.setItem(chave(nome), valor);
  } catch {
    /* sem persistência, o sistema segue com o que está em memória */
  }
}

export function remover(nome: string): void {
  try {
    localStorage.removeItem(chave(nome));
    localStorage.removeItem(`${PREFIXO_ANTIGO}.${nome}`);
  } catch {
    /* idem */
  }
}

/**
 * Lê JSON com padrão de fallback.
 *
 * Armazenamento corrompido — JSON truncado, chave escrita por uma versão
 * anterior do tipo — cai no padrão em vez de derrubar a tela. É o
 * comportamento que os testes de degradação travam.
 */
export function lerJSON<T>(nome: string, padrao: T): T {
  const cru = ler(nome);
  if (cru === null) return padrao;
  try {
    return JSON.parse(cru) as T;
  } catch {
    return padrao;
  }
}

export const escreverJSON = (nome: string, valor: unknown): void =>
  escrever(nome, JSON.stringify(valor));
