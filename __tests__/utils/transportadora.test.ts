import { describe, expect, it } from 'vitest';
import {
    TRANSPORTADORA_PARCEIRA,
    telefoneTransportadora,
    whatsappTransportadora,
} from '@/lib/utils/transportadora';

describe('transportadora parceira', () => {
    it('guarda o nome e o telefone informados', () => {
        expect(TRANSPORTADORA_PARCEIRA.nome).toBe('Primo Transportes');
        expect(TRANSPORTADORA_PARCEIRA.telefone).toBe('11910359987');
    });

    it('exibe o telefone com máscara de celular', () => {
        expect(telefoneTransportadora()).toBe('(11) 91035-9987');
    });

    it('monta o link do WhatsApp com DDI', () => {
        const url = whatsappTransportadora();
        expect(url).toContain('https://wa.me/5511910359987?text=');
        expect(decodeURIComponent(url.split('text=')[1])).toBe('Olá! Preciso de uma cotação de frete.');
    });

    it('inclui o veículo na mensagem quando informado', () => {
        const url = whatsappTransportadora('VW NIVUS branco para SP');
        expect(decodeURIComponent(url.split('text=')[1]))
            .toBe('Olá! Preciso de uma cotação de frete para: VW NIVUS branco para SP');
    });
});
