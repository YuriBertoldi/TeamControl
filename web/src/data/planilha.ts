/**
 * Planilha de entrada e saída.
 *
 * **CSV, não XLSX, e isso é decisão.** Ler `.xlsx` exigiria uma biblioteca de
 * ~1 MB para interpretar um formato binário — num sistema cujo princípio é ser
 * local, auditável e sem dependência que ninguém revisa. CSV o Excel abre e
 * salva em um clique, e o arquivo continua legível em qualquer editor se algo
 * der errado na importação.
 *
 * O preço é um passo explícito: quem preencher no Excel precisa "Salvar como →
 * CSV". O modelo que o sistema gera já vem no formato certo, então o caminho
 * natural é baixar, preencher e devolver — sem conversão nenhuma.
 *
 * Três detalhes que fazem o arquivo abrir certo no Excel em português:
 *
 * 1. **BOM UTF-8** no começo. Sem ele, o Excel lê como Latin-1 e "João" vira
 *    "JoÃ£o" — e aí os nomes não casam com o cadastro na volta.
 * 2. **Ponto e vírgula** como separador. O Excel em pt-BR usa vírgula como
 *    separador decimal, então um CSV com vírgula cai tudo numa coluna só.
 * 3. **CRLF** nas quebras, que é o que o Excel escreve de volta.
 *
 * A leitura aceita os dois separadores, porque o arquivo pode vir de qualquer
 * lugar — inclusive do Google Sheets, que exporta com vírgula.
 */

const BOM = '﻿';

/** Monta um CSV que o Excel em pt-BR abre com as colunas separadas. */
export function gerarCSV(colunas: string[], linhas: (string | number)[][]): string {
  const campo = (v: string | number) => {
    const s = String(v ?? '');
    // Aspas só quando preciso: campo com separador, aspas ou quebra. Aspar
    // tudo deixa o arquivo ilegível a olho nu, que é metade da vantagem do CSV.
    return /[";\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const corpo = [colunas, ...linhas].map((l) => l.map(campo).join(';')).join('\r\n');
  return BOM + corpo + '\r\n';
}

/**
 * Lê um CSV em linhas de campos.
 *
 * Escrito à mão, e não com `split(';')`, porque campo entre aspas pode conter
 * o separador e quebra de linha — e descrição de critério de trilha contém as
 * duas coisas o tempo todo. Um split ingênuo partiria a linha no meio e a
 * importação gravaria metade de uma frase como se fosse um registro.
 */
export function lerCSV(texto: string): string[][] {
  let t = texto.startsWith(BOM) ? texto.slice(1) : texto;
  t = t.replace(/\r\n?/g, '\n');

  // O separador é descoberto pela primeira linha: quem exporta do Google
  // Sheets manda vírgula, quem salva do Excel pt-BR manda ponto e vírgula.
  const cabecalho = t.slice(0, t.indexOf('\n') + 1 || undefined);
  const sep = (cabecalho.match(/;/g)?.length ?? 0) >= (cabecalho.match(/,/g)?.length ?? 0) ? ';' : ',';

  const linhas: string[][] = [];
  let campo = '';
  let linha: string[] = [];
  let aspas = false;

  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (aspas) {
      if (c === '"') {
        if (t[i + 1] === '"') { campo += '"'; i++; } else { aspas = false; }
      } else { campo += c; }
      continue;
    }
    if (c === '"') { aspas = true; continue; }
    if (c === sep) { linha.push(campo); campo = ''; continue; }
    if (c === '\n') { linha.push(campo); linhas.push(linha); linha = []; campo = ''; continue; }
    campo += c;
  }
  if (campo !== '' || linha.length > 0) { linha.push(campo); linhas.push(linha); }

  // Linha totalmente vazia é lixo de fim de arquivo, não registro em branco.
  return linhas.filter((l) => l.some((c) => c.trim() !== ''));
}

/**
 * Entrega o arquivo ao usuário.
 *
 * `Blob` e âncora temporária em vez de `data:` URI: o `data:` estoura em
 * arquivos grandes em alguns navegadores, e a matriz de 22 pessoas × 20 skills
 * já passa de 400 linhas.
 */
export function baixar(nome: string, conteudo: string, tipo = 'text/csv;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revogar na hora cancela o download em alguns navegadores; um tick depois é
  // o suficiente para a navegação já ter começado.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Lê o arquivo escolhido como texto. */
export function lerArquivo(f: File): Promise<string> {
  return new Promise((ok, erro) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result ?? ''));
    r.onerror = () => erro(new Error(`não consegui ler ${f.name}`));
    // UTF-8 explícito: sem isso o navegador adivinha pelo conteúdo e erra em
    // arquivo curto só com acento no meio.
    r.readAsText(f, 'utf-8');
  });
}

/** Casa o cabeçalho do arquivo com as colunas esperadas, por nome. */
export function indicesDe(cabecalho: string[], colunas: string[]): Record<string, number> {
  const norm = (s: string) =>
    s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const mapa: Record<string, number> = {};
  colunas.forEach((c) => {
    // Por NOME e não por posição: quem preenche no Excel reordena coluna sem
    // perceber, e importar por posição gravaria nível no campo de interesse
    // sem nada reclamar.
    mapa[c] = cabecalho.findIndex((h) => norm(h) === norm(c));
  });
  return mapa;
}
