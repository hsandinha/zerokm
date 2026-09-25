/**
 * Calculates profile completion percentage (0–100).
 * Based on 6 key fields: name, phone, cpf, address (street/city/zipCode).
 * O cartão salvo deixou de contar: a aba Pagamento saiu do perfil e o pagamento
 * acontece no checkout do Mercado Pago.
 */
export function calculateProfileCompletion(data: {
    displayName?: string | null;
    phoneNumber?: string | null;
    cpf?: string | null;
    address?: {
        street?: string | null;
        city?: string | null;
        zipCode?: string | null;
    } | null;
    creditCard?: {
        lastFour?: string | null;
    } | null;
}): number {
    const fields = [
        data.displayName,
        data.phoneNumber,
        data.cpf,
        data.address?.street,
        data.address?.city,
        data.address?.zipCode,
    ];
    const filled = fields.filter(f => f && String(f).trim().length > 0).length;
    return Math.round((filled / fields.length) * 100);
}
