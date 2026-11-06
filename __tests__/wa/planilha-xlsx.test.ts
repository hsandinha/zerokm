// Leitor de .xlsx sem biblioteca (wa/lib/audience/xlsx.ts): um arquivo real
// gerado pelo openpyxl (fixtures/contatos.xlsx) e zips montados aqui, para
// cobrir o que o Excel faz e o openpyxl não (strings compartilhadas, texto
// rico, notação científica, data 1904, entrada sem compressão).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { dataDoExcel, formatoEhData, lerXlsx, numeroComoTexto, pareceXlsx, PlanilhaError } from "@wa/lib/audience/xlsx";
import { parseLinhas } from "@wa/lib/audience/csv";
import { textoDoCsv } from "@wa/lib/audience/planilha";

const inflar = async (d: Uint8Array) => new Uint8Array(inflateRawSync(d));

/** Zip mínimo (sem CRC conferido pelo leitor, como o nosso). */
function zip(arquivos: Record<string, string>, comprimir = true): Uint8Array {
  const locais: Buffer[] = [];
  const centrais: Buffer[] = [];
  let offset = 0;
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const bruto = Buffer.from(conteudo, "utf-8");
    const dados = comprimir ? deflateRawSync(bruto) : bruto;
    const nomeBuf = Buffer.from(nome, "utf-8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(comprimir ? 8 : 0, 8);
    local.writeUInt32LE(dados.length, 18);
    local.writeUInt32LE(bruto.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(comprimir ? 8 : 0, 10);
    central.writeUInt32LE(dados.length, 20);
    central.writeUInt32LE(bruto.length, 24);
    central.writeUInt16LE(nomeBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locais.push(local, nomeBuf, dados);
    centrais.push(central, nomeBuf);
    offset += 30 + nomeBuf.length + dados.length;
  }
  const dir = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(Object.keys(arquivos).length, 8);
  fim.writeUInt16LE(Object.keys(arquivos).length, 10);
  fim.writeUInt32LE(dir.length, 12);
  fim.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locais, dir, fim]));
}

const WORKBOOK = (extra = "") =>
  `<workbook xmlns:r="r">${extra}<sheets><sheet name="Base" sheetId="1" r:id="rId7"/></sheets></workbook>`;
const RELS = `<Relationships><Relationship Id="rId7" Type="x" Target="worksheets/base.xml"/></Relationships>`;

describe("lerXlsx: arquivo real do openpyxl", () => {
  const arquivo = new Uint8Array(readFileSync(join(__dirname, "fixtures", "contatos.xlsx")));

  it("lê a primeira aba visível, com telefone numérico inteiro e data em dd/mm/aaaa", async () => {
    const linhas = await lerXlsx(arquivo, inflar);
    expect(linhas[0]).toEqual(["Nome", "Celular", "Nascimento", "Cidade", "Celular"]);
    expect(linhas[1]).toEqual(["João Ávila", "5531999998888", "12/03/1990", "Belo Horizonte", "(31) 98888-7777"]);
    // A linha vazia some; data com hora mantém a hora.
    expect(linhas[2]).toEqual(["Maria & Cia <ltda>", "31 97777-6666", "01/12/1985 14:30", "", "", "sobra"]);
    expect(linhas[3]).toEqual(["Linha\ncom quebra", "31988887777", "", "Contagem"]);
    expect(linhas).toHaveLength(4);
  });

  it("vira o mesmo formato do CSV: cabeçalho repetido ganha sufixo e coluna sem título ganha a letra", async () => {
    const parsed = parseLinhas(await lerXlsx(arquivo, inflar));
    expect(parsed.headers).toEqual(["Nome", "Celular", "Nascimento", "Cidade", "Celular (2)", "Coluna F"]);
    expect(parsed.raw[0]).toMatchObject({ Nome: "João Ávila", Celular: "5531999998888", "Celular (2)": "(31) 98888-7777" });
    expect(parsed.raw[1]["Coluna F"]).toBe("sobra");
    expect(parsed.suggestedMapping).toBeTruthy();
  });

  it("reconhece o zip pelo começo do arquivo", () => {
    expect(pareceXlsx(arquivo.subarray(0, 4))).toBe(true);
    expect(pareceXlsx(new TextEncoder().encode("Nome;Telefone"))).toBe(false);
  });
});

describe("lerXlsx: o que o Excel grava", () => {
  const SHARED = `<sst><si><t>Telefone</t></si><si><r><t>Ana </t></r><r><rPr/><t xml:space="preserve">Lúcia</t></r><rPh><t>fonética</t></rPh></si><si><t>Linha_x000D_
dois</t></si></sst>`;
  const STYLES = `<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="[$-416]d/m/yyyy;@"/><numFmt numFmtId="165" formatCode="&quot;R$&quot; #,##0.00"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="165"/><xf numFmtId="14"/></cellXfs></styleSheet>`;
  const ABA = `<worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="str"><v>Total</v></c></row>
    <row r="2"><c r="A2"><v>5.5319999888800003E+12</v></c><c r="B2" t="s"><v>2</v></c><c r="C2" s="1"><v>32944</v></c><c r="D2" s="2"><v>1234.5600000000001</v></c></row>
    <row r="3"><c r="A3" t="b"><v>1</v></c><c r="B3" t="e"><v>#N/A</v></c><c r="C3" s="3"><v>0</v></c></row>
  </sheetData></worksheet>`;

  it("strings compartilhadas, texto rico sem fonética, _x000D_, notação científica e formato de data próprio", async () => {
    const z = zip({
      "xl/workbook.xml": WORKBOOK(),
      "xl/_rels/workbook.xml.rels": RELS,
      "xl/worksheets/base.xml": ABA,
      "xl/sharedStrings.xml": SHARED,
      "xl/styles.xml": STYLES,
    });
    const linhas = await lerXlsx(z, inflar);
    expect(linhas[0]).toEqual(["Telefone", "Ana Lúcia", "", "Total"]);
    expect(linhas[1]).toEqual(["5531999988880", "Linha\r\ndois", "12/03/1990", "1234.56"]);
    expect(linhas[2]).toEqual(["VERDADEIRO", "#N/A", "30/12/1899"]);
  });

  it("entrada sem compressão e sistema de datas 1904", async () => {
    const z = zip(
      {
        "xl/workbook.xml": WORKBOOK(`<workbookPr date1904="1"/>`),
        "xl/_rels/workbook.xml.rels": RELS,
        "xl/worksheets/base.xml": `<worksheet><sheetData><row><c t="inlineStr"><is><t>Data</t></is></c></row><row><c s="1"><v>0</v></c></row></sheetData></worksheet>`,
        "xl/styles.xml": `<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>`,
      },
      false,
    );
    expect(await lerXlsx(z, inflar)).toEqual([["Data"], ["01/01/1904"]]);
  });

  it("tags com prefixo de namespace (<x:row>, do OpenXML SDK)", async () => {
    const z = zip({
      "xl/workbook.xml": `<x:workbook xmlns:x="m" xmlns:r="r"><x:sheets><x:sheet name="Base" sheetId="1" r:id="rId7"/></x:sheets></x:workbook>`,
      "xl/_rels/workbook.xml.rels": RELS,
      "xl/worksheets/base.xml": `<x:worksheet xmlns:x="m"><x:sheetData><x:row r="1"><x:c r="A1" t="inlineStr"><x:is><x:t>Telefone</x:t></x:is></x:c></x:row><x:row r="2"><x:c r="A2"><x:v>5531999998888</x:v></x:c></x:row></x:sheetData></x:worksheet>`,
    });
    expect(await lerXlsx(z, inflar)).toEqual([["Telefone"], ["5531999998888"]]);
  });

  it("sem os relacionamentos, cai na sheet1.xml", async () => {
    const z = zip({
      "xl/workbook.xml": `<workbook><sheets><sheet name="A" sheetId="1"/></sheets></workbook>`,
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData><row><c t="inlineStr"><is><t>ok</t></is></c></row></sheetData></worksheet>`,
    });
    expect(await lerXlsx(z, inflar)).toEqual([["ok"]]);
  });

  it("arquivo que não é xlsx dá erro legível", async () => {
    await expect(lerXlsx(new TextEncoder().encode("Nome;Telefone\nAna;31999998888"), inflar)).rejects.toBeInstanceOf(PlanilhaError);
    const semWorkbook = zip({ "word/document.xml": "<w/>" });
    await expect(lerXlsx(semWorkbook, inflar)).rejects.toThrow(/Excel/);
  });
});

describe("planilha grande", () => {
  it("200 mil linhas viram registros sem estourar a pilha", () => {
    const linhas: string[][] = [["Telefone", "Nome"]];
    for (let i = 0; i < 200_000; i++) linhas.push([String(5531900000000 + i), `Pessoa ${i}`]);
    const parsed = parseLinhas(linhas);
    expect(parsed.headers).toEqual(["Telefone", "Nome"]);
    expect(parsed.raw).toHaveLength(200_000);
  });
});

describe("conversões", () => {
  it("número como o Excel mostra", () => {
    expect(numeroComoTexto("5531999998888")).toBe("5531999998888");
    expect(numeroComoTexto("5.5319999888800003E+12")).toBe("5531999988880");
    expect(numeroComoTexto("0.30000000000000004")).toBe("0.3");
    expect(numeroComoTexto("-12")).toBe("-12");
  });

  it("formato de data: dia, mês, ano ou hora fora de aspas e colchetes", () => {
    expect(formatoEhData("dd/mm/yyyy")).toBe(true);
    expect(formatoEhData("[$-416]d/m/yyyy;@")).toBe(true);
    expect(formatoEhData('"R$" #,##0.00')).toBe(false);
    expect(formatoEhData("0.00%")).toBe(false);
    expect(formatoEhData("[Red]0")).toBe(false);
  });

  it("série do Excel em data", () => {
    expect(dataDoExcel(32944)).toBe("12/03/1990");
    expect(dataDoExcel(45601.5)).toBe("05/11/2024 12:00");
  });

  it("CSV do Excel em Windows-1252 não estraga o acento", () => {
    const latin1 = new Uint8Array([0x4a, 0x6f, 0xe3, 0x6f]); // "João" em 1252
    expect(textoDoCsv(latin1)).toBe("João");
    expect(textoDoCsv(new TextEncoder().encode("João"))).toBe("João");
  });
});
