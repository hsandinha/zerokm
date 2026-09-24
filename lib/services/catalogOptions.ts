/**
 * Opções de modelo e cor a partir do catálogo (variações + repasse), a mesma base
 * padronizada pela FIPE. Substitui as antigas tabelas manuais de Modelos e Cores.
 */
export async function fetchCatalogOptions(field: 'modelo' | 'cor', signal?: AbortSignal): Promise<string[]> {
    const res = await fetch(`/api/vehicles/suggestions?fields=${field}&limit=5000`, { signal });
    if (!res.ok) throw new Error(`Falha ao carregar opções de ${field}`);
    const data = await res.json();
    const list: unknown = data?.suggestions?.[field] ?? data?.suggestions;
    const values = Array.isArray(list) ? list.map(String).map(v => v.trim()).filter(Boolean) : [];
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
