/** Preserve the catalog's color/equipment variants while detecting renamed FIPE duplicates. */
export function catalogFipeIdentity(item: Record<string, any>) {
    const code = String(item.codigoFipe || '').replace(/\D/g, '');
    if (code.length !== 7 || !item.anoModelo) return null;
    return {
        ativo: true,
        codigoFipe: { $in: [code, `${code.slice(0, 6)}-${code.slice(6)}`] },
        anoModelo: Number(item.anoModelo),
        anoFabricacao: item.anoFabricacao || { $in: [null, ''] },
        ...Object.fromEntries(['combustivel', 'cor', 'transmissao', 'opcionais'].map(field => [field, item[field] || { $in: [null, ''] }])),
    };
}
