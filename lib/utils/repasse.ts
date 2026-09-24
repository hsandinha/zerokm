/**
 * Regras do repasse (usado que a concessionária recebeu na troca e vende para lojista).
 *
 * Vive aqui porque três lugares precisam concordar: o formulário do painel da
 * concessionária, a API que grava e a vitrine que lê. Arquivo puro, sem
 * dependência de servidor, para ser importado pelos dois lados.
 *
 * Por que não é uma linha da tabela de preços do 0KM (DealerVehiclePrice):
 * - o catálogo mestre só tem anos 2024–2027, o usado não existe lá;
 * - a concessionária só enxerga a própria marca, e a troca é de qualquer marca;
 * - o preço 0KM é único por variação + concessionária, e usado é unidade
 *   (dois Onix iguais com km diferente precisam de duas linhas).
 *
 * Placa e fotos não entram: o lojista pede à concessionária pelo WhatsApp,
 * igual ao 0KM.
 */

/**
 * Repasse anunciado só tem um estado: disponível. Vendeu, sai do sistema —
 * o anúncio é removido, não marcado. Guardar "vendido" e "reservado" só criava
 * lista velha para a loja administrar e vitrine com carro que não existe mais.
 */
export const REPASSE_STATUS = ['Disponível'] as const;
export type RepasseStatus = (typeof REPASSE_STATUS)[number];

export const REPASSE_STATUS_VITRINE: RepasseStatus[] = ['Disponível'];

export const REPASSE_TIPOS = ['carro', 'moto'] as const;
export type RepasseTipo = (typeof REPASSE_TIPOS)[number];

export const REPASSE_COMBUSTIVEIS = ['Flex', 'Gasolina', 'Etanol', 'Diesel', 'Elétrico', 'Híbrido'];
export const REPASSE_TRANSMISSOES = ['Manual', 'Automático', 'CVT', 'Automatizado'];

const KM_MAX = 2_000_000;

export type RepasseInput = {
    tipoVeiculo?: unknown;
    marca?: unknown;
    modelo?: unknown;
    ano?: unknown;
    km?: unknown;
    cor?: unknown;
    combustivel?: unknown;
    transmissao?: unknown;
    opcionais?: unknown;
    preco?: unknown;
    observacoes?: unknown;
    status?: unknown;
};

export type RepasseData = {
    tipoVeiculo: RepasseTipo;
    marca: string;
    modelo: string;
    ano: string;
    anoFabricacao?: number;
    anoModelo: number;
    km: number;
    cor?: string;
    combustivel?: string;
    transmissao?: string;
    opcionais?: string;
    preco: number;
    observacoes?: string;
    status: RepasseStatus;
};

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
}

/** "12.500", "12500", "12.500 km" → 12500. */
export function parseKm(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
    const digits = text(value).replace(/[^\d]/g, '');
    if (!digits) return null;
    const n = parseInt(digits, 10);
    return Number.isFinite(n) ? n : null;
}

/** "R$ 85.900,00", "85900", "85.900" → 85900. */
export function parsePreco(value: unknown): number | null {
    if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
    const raw = text(value).replace(/\s/g, '').replace(/R\$/gi, '');
    if (!raw) return null;
    const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(/\.(?=\d{3}(\D|$))/g, '');
    const n = Number(normalized);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function parseYear(part: string): number | undefined {
    const digits = part.replace(/\D/g, '');
    if (!digits) return undefined;
    const year = digits.length === 2 ? 2000 + Number(digits) : Number(digits.slice(0, 4));
    return Number.isFinite(year) ? year : undefined;
}

/** "19/20" → fab 2019, modelo 2020. "2020" → modelo 2020. */
export function parseAno(value: unknown): { ano: string; anoFabricacao?: number; anoModelo?: number } {
    const raw = text(value);
    const parts = raw.split(/[/-]/).map(parseYear).filter((y): y is number => Boolean(y));
    if (parts.length >= 2) {
        return { ano: `${String(parts[0]).slice(-2)}/${String(parts[1]).slice(-2)}`, anoFabricacao: parts[0], anoModelo: parts[1] };
    }
    const single = parseYear(raw);
    return single ? { ano: String(single), anoModelo: single } : { ano: raw };
}

export function formatKm(km: number | null | undefined): string {
    if (typeof km !== 'number') return '-';
    return `${km.toLocaleString('pt-BR')} km`;
}

/**
 * Valida e normaliza. `partial` = edição: só valida o que veio no corpo.
 * Devolve erros legíveis para mostrar na tela da concessionária.
 */
export function validateRepasse(input: RepasseInput, partial = false): { data: Partial<RepasseData>; errors: string[] } {
    const errors: string[] = [];
    const data: Partial<RepasseData> = {};
    const has = (key: keyof RepasseInput) => !partial || Object.prototype.hasOwnProperty.call(input, key);

    if (has('tipoVeiculo')) {
        const tipo = text(input.tipoVeiculo).toLowerCase() || 'carro';
        if ((REPASSE_TIPOS as readonly string[]).includes(tipo)) data.tipoVeiculo = tipo as RepasseTipo;
        else errors.push('Tipo deve ser carro ou moto.');
    }

    if (has('marca')) {
        const marca = text(input.marca).toUpperCase();
        if (marca) data.marca = marca;
        else errors.push('Marca é obrigatória.');
    }

    if (has('modelo')) {
        const modelo = text(input.modelo).toUpperCase();
        if (modelo) data.modelo = modelo;
        else errors.push('Modelo é obrigatório.');
    }

    if (has('ano')) {
        const { ano, anoFabricacao, anoModelo } = parseAno(input.ano);
        const limite = new Date().getFullYear() + 1;
        if (!anoModelo) errors.push('Ano é obrigatório. Use 19/20 ou 2020.');
        else if (anoModelo < 1950 || anoModelo > limite) errors.push(`Ano modelo fora do intervalo 1950–${limite}.`);
        else if (anoFabricacao && (anoFabricacao > anoModelo || anoModelo - anoFabricacao > 1)) errors.push('Ano de fabricação deve ser igual ou um ano antes do ano modelo.');
        else Object.assign(data, { ano, anoFabricacao, anoModelo });
    }

    if (has('km')) {
        const km = parseKm(input.km);
        if (km === null) errors.push('Quilometragem é obrigatória.');
        else if (km < 0 || km > KM_MAX) errors.push('Quilometragem inválida.');
        else data.km = km;
    }

    if (has('preco')) {
        const preco = parsePreco(input.preco);
        if (preco === null) errors.push('Preço é obrigatório e maior que zero.');
        else data.preco = preco;
    }

    if (has('status')) {
        const status = text(input.status) || 'Disponível';
        if (status.toLowerCase() === 'disponível'.toLowerCase()) data.status = 'Disponível';
        else errors.push('Repasse só tem o estado Disponível. Quando vender, remova o anúncio.');
    }

    for (const key of ['cor', 'combustivel', 'transmissao', 'opcionais', 'observacoes'] as const) {
        if (has(key)) {
            const value = text(input[key]);
            (data as any)[key] = key === 'cor' ? value.toUpperCase() || undefined : value || undefined;
        }
    }

    return { data, errors };
}

/**
 * Vínculo FIPE vindo do formulário. Código vazio = sem vínculo (null);
 * código fora do formato 000000-0 é erro. Ausente no corpo = não mexe (undefined).
 */
export function parseRepasseFipe(input: { codigoFipe?: unknown; descricaoFipe?: unknown }): { codigoFipe?: string | null; descricaoFipe?: string | null; error?: string } {
    if (!Object.prototype.hasOwnProperty.call(input || {}, 'codigoFipe')) return {};
    const raw = text(input.codigoFipe);
    if (!raw) return { codigoFipe: null, descricaoFipe: null };
    const digits = raw.replace(/[-\s]/g, '');
    if (!/^\d{7}$/.test(digits)) return { error: 'Código FIPE inválido. Escolha o veículo na lista da FIPE.' };
    return { codigoFipe: `${digits.slice(0, 6)}-${digits.slice(6)}`, descricaoFipe: text(input.descricaoFipe) || null };
}

/** Formato devolvido ao painel da concessionária. */
export function serializeRepasse(doc: any) {
    const obj = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
        id: obj._id?.toString(),
        concessionariaId: obj.concessionariaId?.toString(),
        tipoVeiculo: obj.tipoVeiculo || 'carro',
        marca: obj.marca,
        modelo: obj.modelo,
        ano: obj.ano,
        anoFabricacao: obj.anoFabricacao,
        anoModelo: obj.anoModelo,
        km: obj.km,
        cor: obj.cor || '',
        combustivel: obj.combustivel || '',
        transmissao: obj.transmissao || '',
        opcionais: obj.opcionais || '',
        preco: obj.preco,
        observacoes: obj.observacoes || '',
        foraDoCatalogo: Boolean(obj.foraDoCatalogo),
        codigoFipe: obj.codigoFipe || '',
        descricaoFipe: obj.descricaoFipe || '',
        status: obj.status,
        createdAt: obj.createdAt,
        updatedAt: obj.updatedAt,
    };
}
