/** Server-side FIPE adapter. Only documented, validated paths can reach the provider. */
export type FipeOption = { code: string; name: string };
export type FipeDetail = { brand: string; model: string; modelYear: number; fuel: string; codeFipe: string; referenceMonth: string; price: string };
export const fipeType = (tipo?: string) => tipo === 'moto' ? 'motorcycles' : tipo === 'caminhao' ? 'trucks' : 'cars';
export function normalizeFipeCode(value: string) {
    const digits = value.replace(/[-\s]/g, '');
    if (!/^\d{7}$/.test(digits)) throw new Error('Código FIPE deve conter 7 dígitos (ex.: 002111-3).');
    return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}
export function fipePath(params: URLSearchParams) {
    const type = params.get('type') || 'cars';
    if (!['cars', 'motorcycles', 'trucks'].includes(type)) throw new Error('Tipo de veículo inválido.');
    const brand = params.get('brand'); const model = params.get('model'); const code = params.get('code'); const year = params.get('year');
    if (brand && !/^\d{1,8}$/.test(brand) || model && !/^\d{1,8}$/.test(model) || year && !/^\d{4,5}-\d{1,2}$/.test(year)) throw new Error('Identificador FIPE inválido.');
    if (code) return `${type}/${normalizeFipeCode(code)}/years${year ? `/${year}` : ''}`;
    if (year && (!brand || !model) || model && !brand) throw new Error('Selecione marca e modelo.');
    return `${type}/brands${brand ? `/${brand}/models${model ? `/${model}/years${year ? `/${year}` : ''}` : ''}` : ''}`;
}
export async function queryFipe(params: URLSearchParams): Promise<FipeOption[] | FipeDetail> {
    const path = fipePath(params);
    const response = await fetch(`https://fipe.parallelum.com.br/api/v2/${path}`, {
        headers: process.env.FIPE_API_TOKEN ? { 'X-Subscription-Token': process.env.FIPE_API_TOKEN } : {},
        next: { revalidate: 86400 }, signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(response.status === 429 ? 'Limite de consultas FIPE atingido. Tente mais tarde ou continue manualmente.' : response.status === 404 ? 'Veículo não encontrado na FIPE.' : 'FIPE indisponível. Tente novamente ou continue manualmente.');
    const data = await response.json();
    if (Array.isArray(data) && data.every(item => typeof item.name === 'string' && (typeof item.code === 'string' || typeof item.code === 'number'))) return data.map(item => ({ code: String(item.code), name: item.name }));
    if (typeof data.brand === 'string' && typeof data.model === 'string' && typeof data.codeFipe === 'string' && typeof data.fuel === 'string' && Number.isFinite(data.modelYear)) return data;
    throw new Error('Resposta FIPE inválida. Continue manualmente.');
}
