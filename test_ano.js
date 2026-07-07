function parseYear(value) {
    const digits = value.replace(/\D/g, '');
    if (!digits) return undefined;
    const year = digits.length === 2 ? 2000 + Number(digits) : Number(digits.slice(0, 4));
    return Number.isFinite(year) && year >= 1900 && year <= 2100 ? year : undefined;
}

function parseAnoComposto(value) {
    const parts = value.split(/[/-]/).map(part => parseYear(part)).filter(year => Boolean(year));
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

console.log('25/25:', parseAnoComposto('25/25'));
console.log('25/26:', parseAnoComposto('25/26'));
