/**
 * Validates a Brazilian CPF number.
 * Accepts formatted (000.000.000-00) or digits-only.
 */
export function validateCPF(cpf: string): boolean {
    const n = cpf.replace(/\D/g, '');
    if (n.length !== 11 || /^(\d)\1{10}$/.test(n)) return false;

    let sum = 0;
    for (let i = 0; i < 9; i++) sum += parseInt(n[i]) * (10 - i);
    let d1 = 11 - (sum % 11);
    if (d1 >= 10) d1 = 0;
    if (d1 !== parseInt(n[9])) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += parseInt(n[i]) * (11 - i);
    let d2 = 11 - (sum % 11);
    if (d2 >= 10) d2 = 0;
    return d2 === parseInt(n[10]);
}

/**
 * Valida CNPJ pelos dígitos verificadores (módulo 11).
 * Aceita formatado (00.000.000/0000-00) ou só dígitos.
 */
export function validateCNPJ(cnpj: string): boolean {
    const n = cnpj.replace(/\D/g, '');
    if (n.length !== 14 || /^(\d)\1{13}$/.test(n)) return false;

    const digito = (base: string, pesos: number[]) => {
        const soma = base
            .split('')
            .reduce((acc, char, i) => acc + parseInt(char) * pesos[i], 0);
        const resto = soma % 11;
        return resto < 2 ? 0 : 11 - resto;
    };

    const d1 = digito(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    if (d1 !== parseInt(n[12])) return false;

    const d2 = digito(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    return d2 === parseInt(n[13]);
}

/**
 * Valida o documento conforme o tipo de cadastro e devolve a mensagem de erro,
 * ou null quando está correto. Centraliza a regra usada por formulário e API.
 */
export function validateDocumento(tipo: 'pf' | 'pj', documento: string): string | null {
    const n = (documento || '').replace(/\D/g, '');

    if (tipo === 'pj') {
        if (n.length !== 14) return 'CNPJ deve ter 14 dígitos.';
        if (!validateCNPJ(n)) return 'CNPJ inválido — confira os números digitados.';
        return null;
    }

    if (n.length !== 11) return 'CPF deve ter 11 dígitos.';
    if (!validateCPF(n)) return 'CPF inválido — confira os números digitados.';
    return null;
}
