import { describe, expect, it } from 'vitest';
import { classifyLeadTags, normalizeMessage, LEAD_TAGS } from '@/lib/utils/leadTags';

describe('classifyLeadTags', () => {
    it('reconhece as três frases exatas do briefing', () => {
        expect(classifyLeadTags('Olá! Vim do anúncio e gostaria de criar minha conta no CNV'))
            .toEqual([LEAD_TAGS.META_ABERTO]);

        expect(classifyLeadTags('Olá! Gostaria de criar minha conta no CNV que vi no anúncio'))
            .toEqual([LEAD_TAGS.META_SEGMENTADO]);

        expect(classifyLeadTags('Olá, vim pelo site e gostaria de criar minha conta na plataforma'))
            .toEqual([LEAD_TAGS.GOOGLE_LP]);
    });

    // As duas frases da Meta são quase idênticas; o que as separa é "vim do" vs "vi no".
    it('não confunde público aberto com público segmentado', () => {
        const aberto = classifyLeadTags('Vim do anúncio');
        const segmentado = classifyLeadTags('Vi no anúncio');

        expect(aberto).toEqual([LEAD_TAGS.META_ABERTO]);
        expect(segmentado).toEqual([LEAD_TAGS.META_SEGMENTADO]);
        expect(aberto).not.toEqual(segmentado);
    });

    it('tolera acento, caixa e pontuação, como o WhatsApp entrega', () => {
        expect(classifyLeadTags('OLA!!! VIM DO ANUNCIO, quero conta')).toEqual([LEAD_TAGS.META_ABERTO]);
        expect(classifyLeadTags('ola   vim   pelo   site...')).toEqual([LEAD_TAGS.GOOGLE_LP]);
    });

    it('devolve lista vazia para mensagem desconhecida, vazia ou ausente', () => {
        expect(classifyLeadTags('Bom dia, queria saber o preço do Onix')).toEqual([]);
        expect(classifyLeadTags('')).toEqual([]);
        expect(classifyLeadTags(null)).toEqual([]);
        expect(classifyLeadTags(undefined)).toEqual([]);
    });
});

describe('normalizeMessage', () => {
    it('remove acentos e colapsa espaços', () => {
        expect(normalizeMessage('  Olá!  ANÚNCIO  ')).toBe('ola anuncio');
    });
});
