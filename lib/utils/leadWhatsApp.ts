const FALLBACK_SALES_WHATSAPP = '11926384826';

export interface LeadWhatsAppData {
    name: string;
    email: string;
    phone?: string;
    mobile?: string;
    document?: string;
    source?: string;
}

function onlyDigits(value?: string | null) {
    return (value || '').replace(/\D/g, '');
}

function normalizeBrazilWhatsAppNumber(value?: string | null) {
    const digits = onlyDigits(value);
    if (digits.length === 10 || digits.length === 11) return `55${digits}`;
    return digits;
}

export function buildLeadWhatsAppUrl(salesNumber: string | undefined | null, lead: LeadWhatsAppData) {
    const number = normalizeBrazilWhatsAppNumber(salesNumber || FALLBACK_SALES_WHATSAPP);
    if (!number) return null;

    const contact = lead.mobile?.trim() || lead.phone?.trim() || 'Nao informado';
    const lines = [
        'Novo lead cadastrado na CNV',
        `Nome: ${lead.name || 'Nao informado'}`,
        `Contato: ${contact}`,
        `E-mail: ${lead.email || 'Nao informado'}`,
        lead.document ? `Documento: ${lead.document}` : null,
        lead.source ? `Origem: ${lead.source}` : 'Origem: Cadastro gratis',
    ].filter(Boolean);

    return `https://wa.me/${number}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export async function openSalesWhatsAppForLead(lead: LeadWhatsAppData, targetWindow?: Window | null) {
    let salesNumber = FALLBACK_SALES_WHATSAPP;

    try {
        const res = await fetch('/api/config/contato');
        if (res.ok) {
            const data = await res.json();
            salesNumber = data?.whatsapp || salesNumber;
        }
    } catch {
        // Fallback number keeps the lead handoff available if config fetch fails.
    }

    const url = buildLeadWhatsAppUrl(salesNumber, lead);
    if (!url) {
        targetWindow?.close();
        return;
    }

    try {
        if (targetWindow && !targetWindow.closed) {
            targetWindow.location.href = url;
            return;
        }

        window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
        targetWindow?.close();
    }
}
