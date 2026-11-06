// Leitor de planilha do Excel (.xlsx) sem biblioteca: o arquivo é um zip de
// XMLs, e para importar contatos basta a primeira aba visível, como texto.
//
// Roda no navegador (o arquivo nunca sobe inteiro, igual ao CSV): o zip é
// aberto aqui e cada parte é descompactada pelo DecompressionStream do
// próprio navegador. Nos testes, quem chama passa o inflate do zlib.
//
// O que importa para a base de contatos e foi tratado:
// - telefone digitado como número (5531999998888) não pode virar 5,53E+12;
// - célula de data vem como número de série do Excel: sai como dd/mm/aaaa,
//   que é o que a ficha entende no aniversário;
// - texto com quebra, acento e caracteres de controle (_x000D_) do Excel.
// Fora do escopo: fórmulas (vale o último valor calculado, que o Excel grava
// junto), mesclagem e mais de uma aba.

/** Descompacta um trecho "deflate" cru (método 8 do zip). */
export type Inflar = (dados: Uint8Array) => Promise<Uint8Array>;

export class PlanilhaError extends Error {}

/** Limite de segurança: planilha de contatos maior que isso não é planilha de contatos. */
const MAX_DESCOMPACTADO = 80 * 1024 * 1024;

// ── Zip ──────────────────────────────────────────────────────

type EntradaDoZip = { nome: string; metodo: number; tamanho: number; tamanhoReal: number; inicio: number };

function u16(b: Uint8Array, i: number): number {
  return b[i] | (b[i + 1] << 8);
}
function u32(b: Uint8Array, i: number): number {
  return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0;
}

/** Índice do zip (diretório central). Sem ele, não é um .xlsx. */
function entradasDoZip(b: Uint8Array): Map<string, EntradaDoZip> {
  // Fim do diretório central: assinatura 0x06054b50, nos últimos 64 KB.
  let fim = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (u32(b, i) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new PlanilhaError("O arquivo não é uma planilha .xlsx válida.");
  const total = u16(b, fim + 10);
  let p = u32(b, fim + 16);
  const decoder = new TextDecoder("utf-8");
  const mapa = new Map<string, EntradaDoZip>();
  for (let n = 0; n < total; n++) {
    if (p + 46 > b.length || u32(b, p) !== 0x02014b50) {
      throw new PlanilhaError("O arquivo .xlsx está corrompido.");
    }
    const metodo = u16(b, p + 10);
    const tamanho = u32(b, p + 20);
    const tamanhoReal = u32(b, p + 24);
    const nomeLen = u16(b, p + 28);
    const extraLen = u16(b, p + 30);
    const comentarioLen = u16(b, p + 32);
    const local = u32(b, p + 42);
    const nome = decoder.decode(b.subarray(p + 46, p + 46 + nomeLen));
    // O cabeçalho local tem nome e "extra" próprios: os dados começam depois deles.
    if (local + 30 > b.length || u32(b, local) !== 0x04034b50) {
      throw new PlanilhaError("O arquivo .xlsx está corrompido.");
    }
    const inicio = local + 30 + u16(b, local + 26) + u16(b, local + 28);
    mapa.set(nome.replace(/^\/+/, ""), { nome, metodo, tamanho, tamanhoReal, inicio });
    p += 46 + nomeLen + extraLen + comentarioLen;
  }
  return mapa;
}

async function lerEntrada(b: Uint8Array, e: EntradaDoZip, inflar: Inflar): Promise<string> {
  if (e.tamanhoReal > MAX_DESCOMPACTADO) throw new PlanilhaError("A planilha é grande demais. Divida em arquivos menores.");
  const dados = b.subarray(e.inicio, e.inicio + e.tamanho);
  let bruto: Uint8Array;
  if (e.metodo === 0) bruto = dados;
  else if (e.metodo === 8) bruto = await inflar(dados);
  else throw new PlanilhaError("A planilha usa uma compressão que não conseguimos abrir. Salve de novo como .xlsx ou CSV.");
  return semPrefixo(new TextDecoder("utf-8").decode(bruto));
}

/** Tira o prefixo de namespace dos nomes de elemento (<x:row> → <row>), que o
 *  OpenXML SDK e alguns exportadores usam. Atributos (r:id) ficam como estão. */
export function semPrefixo(xml: string): string {
  return xml.replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, "<$1");
}

/** O inflate do navegador ("deflate-raw": Chrome 103+, Safari 16.4+, Firefox 113+). */
export const inflarNoNavegador: Inflar = async (dados) => {
  const semSuporte = new PlanilhaError("Este navegador não abre .xlsx. Atualize o navegador ou salve a planilha como CSV.");
  if (typeof DecompressionStream === "undefined") throw semSuporte;
  try {
    const copia = new Uint8Array(dados);
    const stream = new Blob([copia]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch (err) {
    // Navegador sem "deflate-raw" recusa no construtor (TypeError); dado
    // corrompido falha na leitura.
    if (err instanceof TypeError && /deflate-raw|format|unsupported/i.test(err.message)) throw semSuporte;
    throw new PlanilhaError("O arquivo .xlsx está corrompido. Abra no Excel e salve de novo.");
  }
};

// ── XML ──────────────────────────────────────────────────────

function textoDoXml(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, ent: string) => {
      const e = ent.toLowerCase();
      if (e === "amp") return "&";
      if (e === "lt") return "<";
      if (e === "gt") return ">";
      if (e === "quot") return '"';
      if (e === "apos") return "'";
      const cod = e.startsWith("#x") ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cod) ? String.fromCodePoint(cod) : "";
    })
    // O Excel escreve caracteres de controle como _xHHHH_ (o _x000D_ do \r).
    .replace(/_x([0-9a-fA-F]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function atributo(tag: string, nome: string): string | null {
  const m = tag.match(new RegExp(`\\s${nome}\\s*=\\s*("([^"]*)"|'([^']*)')`));
  return m ? textoDoXml(m[2] ?? m[3] ?? "") : null;
}

/** Texto de um <si> ou <is>: todos os <t>, menos a fonética (<rPh>). */
function textoRico(xml: string): string {
  const semFonetica = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let out = "";
  for (const m of semFonetica.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) out += textoDoXml(m[1] ?? "");
  return out;
}

function stringsCompartilhadas(xml: string | null): string[] {
  if (!xml) return [];
  return Array.from(xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g), (m) => textoRico(m[1] ?? ""));
}

// ── Datas ────────────────────────────────────────────────────

/** Formatos de data embutidos no Excel (numFmtId). */
const FORMATOS_DE_DATA = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

/** Código de formato com dia, mês, ano ou hora fora de aspas e colchetes. */
export function formatoEhData(codigo: string): boolean {
  const limpo = codigo.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, "").replace(/\\./g, "");
  return /[dmyhs]/i.test(limpo) && !/^[#0.,%\s]*$/.test(limpo);
}

/** Para cada estilo de célula (o índice "s"), se ele mostra data. */
function estilosDeData(xml: string | null): boolean[] {
  if (!xml) return [];
  const proprios = new Map<number, string>();
  for (const m of xml.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = Number(atributo(m[0], "numFmtId"));
    const codigo = atributo(m[0], "formatCode");
    if (Number.isFinite(id) && codigo !== null) proprios.set(id, codigo);
  }
  const xfs = xml.match(/<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "";
  return Array.from(xfs.matchAll(/<xf\b[^>]*>/g), (m) => {
    const id = Number(atributo(m[0], "numFmtId") ?? 0);
    const proprio = proprios.get(id);
    return proprio !== undefined ? formatoEhData(proprio) : FORMATOS_DE_DATA.has(id);
  });
}

const doisDigitos = (n: number) => String(n).padStart(2, "0");

/** Número de série do Excel → dd/mm/aaaa (com hh:mm quando tem hora). */
export function dataDoExcel(serie: number, sistema1904 = false): string {
  // 1900: o Excel conta 29/02/1900, que não existiu; daí a base em 30/12/1899
  // (vale para toda data a partir de março de 1900, que é o que importa aqui).
  const base = sistema1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms = Math.round(serie * 86_400_000);
  const d = new Date(base + ms);
  const data = `${doisDigitos(d.getUTCDate())}/${doisDigitos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  const temHora = Math.abs(serie - Math.trunc(serie)) > 1e-9;
  return temHora ? `${data} ${doisDigitos(d.getUTCHours())}:${doisDigitos(d.getUTCMinutes())}` : data;
}

/** Número como o Excel mostra: inteiro sem notação científica, 15 dígitos significativos. */
export function numeroComoTexto(bruto: string): string {
  const n = Number(bruto);
  if (!Number.isFinite(n)) return bruto.trim();
  const arredondado = Number(n.toPrecision(15));
  if (Number.isInteger(arredondado) && Math.abs(arredondado) < 1e21) {
    return BigInt(arredondado).toString();
  }
  return String(arredondado);
}

// ── Planilha ─────────────────────────────────────────────────

/** "AB" → 27 (base 0 = 26). */
function indiceDaColuna(ref: string | null, padrao: number): number {
  const letras = ref?.match(/^([A-Z]+)/i)?.[1]?.toUpperCase();
  if (!letras) return padrao;
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function resolverAlvo(alvo: string): string {
  if (alvo.startsWith("/")) return alvo.slice(1);
  const partes = `xl/${alvo}`.split("/");
  const out: string[] = [];
  for (const p of partes) {
    if (p === "..") out.pop();
    else if (p && p !== ".") out.push(p);
  }
  return out.join("/");
}

/** Caminho da primeira aba visível, pelo workbook e pelos relacionamentos. */
function caminhoDaPrimeiraAba(workbook: string | null, rels: string | null): string | null {
  if (!workbook) return null;
  const abas = Array.from(workbook.matchAll(/<sheet\b[^>]*>/g), (m) => m[0]);
  const aba = abas.find((t) => !/state\s*=\s*["'](hidden|veryHidden)["']/.test(t)) ?? abas[0];
  if (!aba || !rels) return null;
  const rid = atributo(aba, "r:id");
  if (!rid) return null;
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    if (atributo(m[0], "Id") === rid) {
      const alvo = atributo(m[0], "Target");
      return alvo ? resolverAlvo(alvo) : null;
    }
  }
  return null;
}

/**
 * As linhas da primeira aba visível, cada uma como lista de textos (células
 * vazias viram ""). Linhas totalmente vazias ficam de fora.
 */
export async function lerXlsx(arquivo: ArrayBuffer | Uint8Array, inflar: Inflar = inflarNoNavegador): Promise<string[][]> {
  const b = arquivo instanceof Uint8Array ? arquivo : new Uint8Array(arquivo);
  const zip = entradasDoZip(b);
  const ler = async (caminho: string): Promise<string | null> => {
    const e = zip.get(caminho);
    return e ? lerEntrada(b, e, inflar) : null;
  };

  const workbook = await ler("xl/workbook.xml");
  if (!workbook) throw new PlanilhaError("O arquivo não é uma planilha do Excel (.xlsx).");
  const caminho =
    caminhoDaPrimeiraAba(workbook, await ler("xl/_rels/workbook.xml.rels")) ??
    (zip.has("xl/worksheets/sheet1.xml") ? "xl/worksheets/sheet1.xml" : null);
  const aba = caminho ? await ler(caminho) : null;
  if (!aba) throw new PlanilhaError("Não achei a primeira aba da planilha.");

  const compartilhadas = stringsCompartilhadas(await ler("xl/sharedStrings.xml"));
  const ehData = estilosDeData(await ler("xl/styles.xml"));
  const sistema1904 = /<workbookPr\b[^>]*date1904\s*=\s*["'](1|true)["']/.test(workbook);

  const linhas: string[][] = [];
  const dadosDaAba = aba.match(/<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/)?.[1] ?? "";
  for (const linha of dadosDaAba.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const celulas: string[] = [];
    let proxima = 0;
    for (const c of (linha[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const tag = `<c${c[1]}>`;
      const corpo = c[2] ?? "";
      const col = indiceDaColuna(atributo(tag, "r"), proxima);
      proxima = col + 1;
      const tipo = atributo(tag, "t") ?? "n";
      const v = corpo.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      let texto = "";
      if (tipo === "s") texto = compartilhadas[Number(v)] ?? "";
      else if (tipo === "inlineStr") texto = textoRico(corpo.match(/<is\b[^>]*>([\s\S]*?)<\/is>/)?.[1] ?? "");
      else if (tipo === "b") texto = v === "1" ? "VERDADEIRO" : v === "0" ? "FALSO" : "";
      else if (tipo === "str" || tipo === "e" || tipo === "d") texto = textoDoXml(v ?? "");
      else if (v !== undefined && v.trim() !== "") {
        const estilo = Number(atributo(tag, "s") ?? 0);
        const serie = Number(v);
        texto = ehData[estilo] && Number.isFinite(serie) ? dataDoExcel(serie, sistema1904) : numeroComoTexto(textoDoXml(v));
      }
      while (celulas.length < col) celulas.push("");
      celulas[col] = texto;
    }
    if (celulas.some((t) => t.trim() !== "")) linhas.push(celulas);
  }
  return linhas;
}

/** O começo do arquivo diz se é zip (xlsx), independente do nome. */
export function pareceXlsx(inicio: Uint8Array): boolean {
  return inicio.length >= 4 && inicio[0] === 0x50 && inicio[1] === 0x4b && inicio[2] === 0x03 && inicio[3] === 0x04;
}
