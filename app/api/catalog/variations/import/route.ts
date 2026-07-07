import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/authOptions';
import connectDB from '@/lib/mongodb';
import Marca from '@/models/Marca';
import VehicleVariation from '@/models/VehicleVariation';

const MASTER_CATALOG_PROFILES = new Set(['admin', 'administrador', 'administrativo', 'gerente', 'operador', 'operator']);
const MAX_IMPORT_ROWS = 2500;

type ImportStatus = 'new' | 'existing' | 'duplicate' | 'invalid';
type TipoVeiculo = 'carro' | 'moto' | 'caminhao' | 'utilitario';

type ParsedImportItem = {
    rowNumber: number;
    marcaId?: string;
    marca: string;
    modelo: string;
    codigoFipe?: string;
    tipoVeiculo: TipoVeiculo;
    ano?: string;
    anoModelo?: number;
    anoFabricacao?: number;
    combustivel?: string;
    cor?: string;
    transmissao?: string;
    motor?: string;
    carroceria?: string;
    portas?: number;
    opcionais?: string;
    opcionaisPadrao: string[];
    preco?: number;
    statusVeiculo?: string;
    observacoes?: string;
    cidade?: string;
    estado?: string;
    frete?: number;
    telefone?: string;
    concessionaria?: string;
    nomeContato?: string;
    operador?: string;
    ativo: boolean;
    status: ImportStatus;
    errors: string[];
    warnings: string[];
    rawError?: string;
    errorCode?: string | number;
    duplicateKey: string;
};

const FIELD_ALIASES = {
    marca: ['marca', 'brand'],
    modelo: ['modelo', 'model', 'veiculo', 'veículo', 'nome'],
    codigoFipe: ['codigofipe', 'codigo fipe', 'código fipe', 'fipe', 'cod fipe'],
    tipoVeiculo: ['tipo', 'tipo veiculo', 'tipo veículo', 'categoria'],
    ano: ['ano'],
    anoModelo: ['anomodelo', 'ano modelo'],
    anoFabricacao: ['anofabricacao', 'ano fabricação', 'ano fabricacao', 'ano fab'],
    combustivel: ['combustivel', 'combustível'],
    cor: ['cor', 'color'],
    transmissao: ['transmissao', 'transmissão', 'cambio', 'câmbio'],
    motor: ['motor'],
    carroceria: ['carroceria', 'body'],
    portas: ['portas', 'porta'],
    opcionaisPadrao: ['opcionais', 'opcionaispadrao', 'opcionais padrão', 'itens', 'equipamentos'],
    preco: ['preco', 'preço', 'valor', 'valor venda'],
    statusVeiculo: ['status', 'situacao', 'situação'],
    observacoes: ['observacoes', 'observações', 'obs', 'observacao', 'observação'],
    cidade: ['cidade'],
    estado: ['estado', 'uf'],
    frete: ['frete'],
    telefone: ['telefone', 'fone', 'celular'],
    concessionaria: ['concessionaria', 'concessionária', 'dealer'],
    nomeContato: ['nomecontato', 'nome contato', 'contato'],
    operador: ['operador'],
} as const;

function normalizeText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeHeader(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

function normalizeKeyPart(value: unknown) {
    if (value === undefined || value === null) return '';
    return String(value)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');
}

function buildDuplicateKey(item: Pick<ParsedImportItem, 'marca' | 'modelo' | 'anoFabricacao' | 'anoModelo' | 'combustivel' | 'cor' | 'transmissao' | 'opcionais'>) {
    return [
        item.marca,
        item.modelo,
        item.anoFabricacao,
        item.anoModelo,
        item.combustivel,
        item.cor,
        item.transmissao,
        item.opcionais,
    ].map(normalizeKeyPart).join('|');
}

function countDelimiterOutsideQuotes(line: string, delimiter: string) {
    let count = 0;
    let quoted = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        const next = line[index + 1];

        if (char === '"' && quoted && next === '"') {
            index += 1;
            continue;
        }

        if (char === '"') quoted = !quoted;
        if (!quoted && char === delimiter) count += 1;
    }

    return count;
}

function detectDelimiter(csv: string) {
    const firstLine = csv.replace(/^\uFEFF/, '').split(/\r?\n/).find(line => line.trim()) || '';
    const candidates = [',', ';', '\t'];
    return candidates.reduce((best, current) => (
        countDelimiterOutsideQuotes(firstLine, current) > countDelimiterOutsideQuotes(firstLine, best) ? current : best
    ), ',');
}

function parseCsv(csv: string) {
    const delimiter = detectDelimiter(csv);
    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let quoted = false;
    const input = csv.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        const next = input[index + 1];

        if (char === '"' && quoted && next === '"') {
            field += '"';
            index += 1;
            continue;
        }

        if (char === '"') {
            quoted = !quoted;
            continue;
        }

        if (!quoted && char === delimiter) {
            row.push(field.trim());
            field = '';
            continue;
        }

        if (!quoted && char === '\n') {
            row.push(field.trim());
            if (row.some(value => value.trim())) rows.push(row);
            row = [];
            field = '';
            continue;
        }

        field += char;
    }

    row.push(field.trim());
    if (row.some(value => value.trim())) rows.push(row);

    if (rows.length < 2) {
        throw new Error('CSV sem dados para importar.');
    }

    const headers = rows[0].map(header => normalizeHeader(header));
    return rows.slice(1, MAX_IMPORT_ROWS + 1).map((values, index) => {
        const record: Record<string, string> = {};
        headers.forEach((header, headerIndex) => {
            if (header) record[header] = values[headerIndex] || '';
        });

        return {
            rowNumber: index + 2,
            record,
        };
    });
}

function getField(record: Record<string, string>, aliases: readonly string[]) {
    for (const alias of aliases) {
        const value = record[normalizeHeader(alias)];
        if (value !== undefined && value !== '') return value.trim();
    }

    return '';
}

function parseYear(value: string) {
    const digits = value.replace(/\D/g, '');
    if (!digits) return undefined;
    const year = digits.length === 2 ? 2000 + Number(digits) : Number(digits.slice(0, 4));
    return Number.isFinite(year) && year >= 1900 && year <= 2100 ? year : undefined;
}

function parseAnoComposto(value: string) {
    const parts = value.split(/[/-]/).map(part => parseYear(part)).filter((year): year is number => Boolean(year));
    if (parts.length >= 2) {
        return {
            anoFabricacao: parts[0],
            anoModelo: parts[1],
        };
    }

    const year = parseYear(value);
    return {
        anoFabricacao: undefined,
        anoModelo: year,
    };
}

function parseNumber(value: string) {
    const normalized = value.replace(/[^\d.,-]/g, '').replace(/\./g, '').replace(',', '.');
    if (!normalized) return undefined;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function parseNumberish(value: unknown) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    return parseNumber(normalizeText(value));
}

function normalizeTipoVeiculo(value: string): TipoVeiculo {
    const normalized = normalizeKeyPart(value);
    if (normalized.includes('moto')) return 'moto';
    if (normalized.includes('caminhao') || normalized.includes('caminhonete')) return 'caminhao';
    if (normalized.includes('utilitario') || normalized.includes('suv')) return 'utilitario';
    return 'carro';
}

function parseOptionals(value: string) {
    if (!value.trim()) return [];
    return value
        .split(/[|;]/)
        .map(option => option.trim())
        .filter(Boolean);
}

function buildGoogleSheetsCsvUrl(rawUrl: string) {
    const match = rawUrl.match(/\/spreadsheets\/d\/([^/]+)/);
    if (!match) return rawUrl;

    const gid =
        rawUrl.match(/[?&]gid=(\d+)/)?.[1] ||
        rawUrl.match(/#gid=(\d+)/)?.[1] ||
        '0';

    return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
}

async function fetchCsvFromUrl(rawUrl: string) {
    const csvUrl = buildGoogleSheetsCsvUrl(rawUrl);
    const response = await fetch(csvUrl, {
        redirect: 'follow',
        headers: {
            'User-Agent': 'Mozilla/5.0',
        },
    });
    const text = await response.text();
    const contentType = response.headers.get('content-type') || '';
    const trimmed = text.trim().toLowerCase();

    if (!response.ok) {
        throw new Error(`Não foi possível ler a planilha. HTTP ${response.status}.`);
    }

    if (contentType.includes('text/html') || trimmed.startsWith('<!doctype html') || trimmed.startsWith('<html')) {
        throw new Error('O link não retornou CSV. Verifique se a planilha está compartilhada para qualquer pessoa com o link ou publicada como CSV.');
    }

    return { csvText: text, csvUrl };
}

async function assertCanManageCatalog() {
    const session = await getServerSession(authOptions);
    const profile = session?.user?.profile;

    if (!session) {
        return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
    }

    if (!profile || !MASTER_CATALOG_PROFILES.has(profile)) {
        return { error: NextResponse.json({ error: 'Acesso negado ao catálogo' }, { status: 403 }) };
    }

    return { session };
}

async function resolveDefaultBrand(defaultMarcaId?: string, defaultMarca?: string) {
    const marcaId = normalizeText(defaultMarcaId);
    if (marcaId) {
        const marca = await Marca.findById(marcaId);
        if (!marca) throw new Error('Marca padrão não encontrada.');
        return {
            marcaId: marca._id.toString(),
            marca: marca.nome,
        };
    }

    const marca = normalizeText(defaultMarca);
    return marca ? { marca } : null;
}

function normalizeItem(rowNumber: number, record: Record<string, string>, defaultBrand: { marcaId?: string; marca: string } | null): ParsedImportItem {
    const rawAno = getField(record, FIELD_ALIASES.ano);
    const rawOpcionais = getField(record, FIELD_ALIASES.opcionaisPadrao);
    const anoComposto = parseAnoComposto(rawAno);
    const anoModelo = parseNumber(getField(record, FIELD_ALIASES.anoModelo)) || anoComposto.anoModelo;
    const anoFabricacao = parseNumber(getField(record, FIELD_ALIASES.anoFabricacao)) || anoComposto.anoFabricacao;
    const marcaFromRow = getField(record, FIELD_ALIASES.marca);
    const item: ParsedImportItem = {
        rowNumber,
        marcaId: marcaFromRow ? undefined : defaultBrand?.marcaId,
        marca: marcaFromRow || defaultBrand?.marca || '',
        modelo: getField(record, FIELD_ALIASES.modelo),
        codigoFipe: getField(record, FIELD_ALIASES.codigoFipe) || undefined,
        tipoVeiculo: normalizeTipoVeiculo(getField(record, FIELD_ALIASES.tipoVeiculo)),
        ano: rawAno || undefined,
        anoModelo,
        anoFabricacao,
        combustivel: getField(record, FIELD_ALIASES.combustivel) || undefined,
        cor: getField(record, FIELD_ALIASES.cor) || undefined,
        transmissao: getField(record, FIELD_ALIASES.transmissao) || undefined,
        motor: getField(record, FIELD_ALIASES.motor) || undefined,
        carroceria: getField(record, FIELD_ALIASES.carroceria) || undefined,
        portas: parseNumber(getField(record, FIELD_ALIASES.portas)),
        opcionais: rawOpcionais || undefined,
        opcionaisPadrao: parseOptionals(rawOpcionais),
        preco: parseNumber(getField(record, FIELD_ALIASES.preco)),
        statusVeiculo: getField(record, FIELD_ALIASES.statusVeiculo) || undefined,
        observacoes: getField(record, FIELD_ALIASES.observacoes) || undefined,
        cidade: getField(record, FIELD_ALIASES.cidade) || undefined,
        estado: getField(record, FIELD_ALIASES.estado) || undefined,
        frete: parseNumber(getField(record, FIELD_ALIASES.frete)),
        telefone: getField(record, FIELD_ALIASES.telefone) || undefined,
        concessionaria: getField(record, FIELD_ALIASES.concessionaria) || undefined,
        nomeContato: getField(record, FIELD_ALIASES.nomeContato) || undefined,
        operador: getField(record, FIELD_ALIASES.operador) || undefined,
        ativo: true,
        status: 'new',
        errors: [],
        warnings: [],
        duplicateKey: '',
    };

    if (!item.marca) item.errors.push('Marca ausente.');
    if (!item.modelo) item.errors.push('Modelo ausente.');
    if (item.anoModelo && !Number.isInteger(item.anoModelo)) item.errors.push('Ano modelo inválido.');
    if (item.anoFabricacao && !Number.isInteger(item.anoFabricacao)) item.errors.push('Ano fabricação inválido.');

    item.duplicateKey = buildDuplicateKey(item);
    if (item.errors.length > 0) item.status = 'invalid';

    return item;
}

function buildSummary(rows: ParsedImportItem[]) {
    return rows.reduce((summary, row) => {
        summary.total += 1;
        summary[row.status] += 1;
        if (row.status === 'new') summary.importable += 1;
        return summary;
    }, {
        total: 0,
        new: 0,
        existing: 0,
        duplicate: 0,
        invalid: 0,
        importable: 0,
    });
}

async function markExistingRows(rows: ParsedImportItem[]) {
    const validRows = rows.filter(row => row.status !== 'invalid');
    const marcas = Array.from(new Set(validRows.map(row => row.marca).filter(Boolean)));

    if (marcas.length === 0) return rows;

    const existing = await VehicleVariation.find({
        ativo: true,
        marca: { $in: marcas },
    }).select('marca modelo ano anoFabricacao anoModelo combustivel cor transmissao opcionais');

    const existingKeys = new Set(existing.map((variation: any) => {
        let { anoFabricacao, anoModelo } = variation;
        
        if ((!anoFabricacao || !anoModelo) && variation.ano) {
            const composto = parseAnoComposto(variation.ano);
            anoFabricacao = anoFabricacao || composto.anoFabricacao;
            anoModelo = anoModelo || composto.anoModelo;
        }

        return buildDuplicateKey({
            marca: variation.marca,
            modelo: variation.modelo,
            anoFabricacao,
            anoModelo,
            combustivel: variation.combustivel,
            cor: variation.cor,
            transmissao: variation.transmissao,
            opcionais: variation.opcionais,
        });
    }));

    const seen = new Set<string>();
    return rows.map(row => {
        if (row.status === 'invalid') return row;

        if (seen.has(row.duplicateKey)) {
            return {
                ...row,
                status: 'duplicate' as ImportStatus,
                warnings: [...row.warnings, 'Duplicado dentro da planilha.'],
            };
        }

        seen.add(row.duplicateKey);

        if (existingKeys.has(row.duplicateKey)) {
            return {
                ...row,
                status: 'existing' as ImportStatus,
                warnings: [...row.warnings, 'Já existe no catálogo.'],
            };
        }

        return row;
    });
}

async function buildPreview(body: any) {
    await connectDB();
    try {
        await VehicleVariation.syncIndexes();
    } catch (e) {
        console.error("Erro ao sincronizar índices:", e);
    }
    const sourceType = body.sourceType === 'googleSheets' ? 'googleSheets' : 'csv';
    const defaultBrand = await resolveDefaultBrand(body.defaultMarcaId, body.defaultMarca);
    let csvText = normalizeText(body.csvText);
    let sourceUrl: string | undefined;

    if (sourceType === 'googleSheets') {
        const sheetUrl = normalizeText(body.sheetUrl);
        if (!sheetUrl) throw new Error('Informe o link do Google Sheets.');
        const fetched = await fetchCsvFromUrl(sheetUrl);
        csvText = fetched.csvText;
        sourceUrl = fetched.csvUrl;
    }

    if (!csvText) throw new Error('Informe um CSV ou um link de planilha.');

    const parsed = parseCsv(csvText);
    const rows = parsed.map(row => normalizeItem(row.rowNumber, row.record, defaultBrand));
    const markedRows = await markExistingRows(rows);

    return {
        rows: markedRows,
        summary: buildSummary(markedRows),
        sourceUrl,
        truncated: parsed.length >= MAX_IMPORT_ROWS,
    };
}

function sanitizeCommitItem(rawItem: any): ParsedImportItem {
    const rawOpcionais = normalizeText(rawItem.opcionais);
    const item: ParsedImportItem = {
        rowNumber: Number(rawItem.rowNumber) || 0,
        marcaId: normalizeText(rawItem.marcaId) || undefined,
        marca: normalizeText(rawItem.marca),
        modelo: normalizeText(rawItem.modelo),
        codigoFipe: normalizeText(rawItem.codigoFipe) || undefined,
        tipoVeiculo: normalizeTipoVeiculo(rawItem.tipoVeiculo),
        ano: normalizeText(rawItem.ano) || undefined,
        anoModelo: parseNumberish(rawItem.anoModelo),
        anoFabricacao: parseNumberish(rawItem.anoFabricacao),
        combustivel: normalizeText(rawItem.combustivel) || undefined,
        cor: normalizeText(rawItem.cor) || undefined,
        transmissao: normalizeText(rawItem.transmissao) || undefined,
        motor: normalizeText(rawItem.motor) || undefined,
        carroceria: normalizeText(rawItem.carroceria) || undefined,
        portas: parseNumberish(rawItem.portas),
        opcionais: rawOpcionais || undefined,
        opcionaisPadrao: Array.isArray(rawItem.opcionaisPadrao)
            ? rawItem.opcionaisPadrao.map(normalizeText).filter(Boolean)
            : parseOptionals(rawOpcionais),
        preco: parseNumberish(rawItem.preco),
        statusVeiculo: normalizeText(rawItem.statusVeiculo) || undefined,
        observacoes: normalizeText(rawItem.observacoes) || undefined,
        cidade: normalizeText(rawItem.cidade) || undefined,
        estado: normalizeText(rawItem.estado) || undefined,
        frete: parseNumberish(rawItem.frete),
        telefone: normalizeText(rawItem.telefone) || undefined,
        concessionaria: normalizeText(rawItem.concessionaria) || undefined,
        nomeContato: normalizeText(rawItem.nomeContato) || undefined,
        operador: normalizeText(rawItem.operador) || undefined,
        ativo: true,
        status: 'new',
        errors: [],
        warnings: [],
        duplicateKey: '',
    };

    if (!item.marca) item.errors.push('Marca ausente.');
    if (!item.modelo) item.errors.push('Modelo ausente.');
    item.duplicateKey = buildDuplicateKey(item);
    if (item.errors.length > 0) item.status = 'invalid';
    return item;
}

async function commitRows(rawItems: any[], createdBy?: string | null) {
    await connectDB();
    try {
        await VehicleVariation.syncIndexes();
    } catch (e) {
        console.error("Erro ao sincronizar índices:", e);
    }
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
        throw new Error('Nenhuma linha enviada para importação.');
    }

    const sanitized = rawItems.slice(0, MAX_IMPORT_ROWS).map(sanitizeCommitItem);
    const checked = await markExistingRows(sanitized);
    const importable = checked.filter(row => row.status === 'new');
    const imported: ParsedImportItem[] = [];
    const skipped = checked.filter(row => row.status !== 'new');

    for (const row of importable) {
        try {
            const marca = row.marcaId
                ? await Marca.findById(row.marcaId)
                : await Marca.findOneAndUpdate(
                    { nome: row.marca },
                    { $setOnInsert: { nome: row.marca } },
                    { new: true, upsert: true }
                );

            if (!marca) {
                skipped.push({
                    ...row,
                    status: 'invalid',
                    errors: [...row.errors, 'Marca não encontrada.'],
                });
                continue;
            }

            await VehicleVariation.create({
                marcaId: marca._id,
                marca: marca.nome,
                modelo: row.modelo,
                codigoFipe: row.codigoFipe,
                tipoVeiculo: row.tipoVeiculo,
                ano: row.ano,
                anoModelo: row.anoModelo,
                anoFabricacao: row.anoFabricacao,
                combustivel: row.combustivel,
                cor: row.cor,
                transmissao: row.transmissao,
                motor: row.motor,
                carroceria: row.carroceria,
                portas: row.portas,
                opcionais: row.opcionais,
                opcionaisPadrao: row.opcionaisPadrao,
                preco: row.preco,
                status: row.statusVeiculo,
                observacoes: row.observacoes,
                cidade: row.cidade,
                estado: row.estado,
                frete: row.frete,
                telefone: row.telefone,
                concessionaria: row.concessionaria,
                nomeContato: row.nomeContato,
                operador: row.operador,
                ativo: true,
                createdBy: createdBy || undefined,
            });

            imported.push(row);
        } catch (error: any) {
            console.error('ERRO AO IMPORTAR:', error);
            require('fs').appendFileSync('/tmp/import_error.log', JSON.stringify({ row: row.modelo, error: error?.message, code: error?.code }) + '\n');
            skipped.push({
                ...row,
                status: error?.code === 11000 ? 'existing' : 'invalid',
                errors: [...row.errors, error?.code === 11000 ? 'Já existe no catálogo.' : (error?.message || 'Erro ao importar.')],
                rawError: error?.message,
                errorCode: error?.code,
            });
        }
    }

    return {
        imported,
        skipped,
        summary: {
            received: rawItems.length,
            imported: imported.length,
            skipped: skipped.length,
        },
    };
}

export async function POST(request: Request) {
    try {
        const access = await assertCanManageCatalog();
        if (access.error) return access.error;

        await connectDB();

        const body = await request.json();
        const action = body.action === 'commit' ? 'commit' : 'preview';

        if (action === 'commit') {
            const result = await commitRows(body.items, access.session?.user?.email);
            return NextResponse.json(result);
        }

        const preview = await buildPreview(body);
        return NextResponse.json(preview);
    } catch (error: any) {
        console.error('Erro na importação do catálogo:', error);
        return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
    }
}
