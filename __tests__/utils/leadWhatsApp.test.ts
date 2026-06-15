import { describe, expect, it } from 'vitest';
import { buildLeadWhatsAppUrl } from '@/lib/utils/leadWhatsApp';

describe('leadWhatsApp utils', () => {
    it('builds a seller WhatsApp URL with lead details', () => {
        const url = buildLeadWhatsAppUrl('11926384826', {
            name: 'Maria Silva',
            email: 'maria@example.com',
            phone: '(11) 3333-4444',
            mobile: '(11) 99999-8888',
            document: '123.456.789-00',
            source: 'Cadastro gratis - teste',
        });

        expect(url).toContain('https://wa.me/5511926384826?text=');
        const message = decodeURIComponent(url!.split('text=')[1]);
        expect(message).toContain('Nome: Maria Silva');
        expect(message).toContain('Contato: (11) 99999-8888');
        expect(message).toContain('E-mail: maria@example.com');
        expect(message).toContain('Documento: 123.456.789-00');
    });

    it('keeps numbers that already include DDI', () => {
        const url = buildLeadWhatsAppUrl('5511999999999', {
            name: 'Lead',
            email: 'lead@example.com',
        });

        expect(url).toContain('https://wa.me/5511999999999?text=');
    });
});
