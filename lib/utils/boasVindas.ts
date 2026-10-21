import type { LeadWhatsAppData } from './leadWhatsApp';

const CHAVE = 'cnv:novoCadastro';

/**
 * Dados do cadastro recém-criado, guardados só nesta aba para a mensagem de
 * boas-vindas montar o WhatsApp com nome, telefone e documento. O cadastro não
 * abre mais o WhatsApp sozinho: a pessoa escolhe na primeira tela do sistema.
 */
export function guardarNovoCadastro(lead: LeadWhatsAppData) {
    try {
        sessionStorage.setItem(CHAVE, JSON.stringify(lead));
    } catch {
        /* navegação privada: a mensagem usa os dados da sessão */
    }
}

export function lerNovoCadastro(): LeadWhatsAppData | null {
    try {
        const bruto = sessionStorage.getItem(CHAVE);
        return bruto ? JSON.parse(bruto) as LeadWhatsAppData : null;
    } catch {
        return null;
    }
}

export function esquecerNovoCadastro() {
    try {
        sessionStorage.removeItem(CHAVE);
    } catch {
        /* nada a fazer */
    }
}
