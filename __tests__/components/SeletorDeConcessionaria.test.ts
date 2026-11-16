// Busca de concessionária do Estoque (components/admin/SeletorDeConcessionaria).
import { describe, expect, it } from 'vitest';
import { filtrarLojas, rotuloDaLoja } from '@/components/admin/SeletorDeConcessionaria';

const lojas = [
    { id: '1', nome: 'FORD BRASAL EPIA', ativo: true, marcas: ['FORD'], cidade: 'Brasília', uf: 'DF', cnpj: '38.072.872/0004-80' },
    { id: '2', nome: 'GRUPO BRASAL SEMINOVOS', ativo: true, marcas: [], cidade: 'Brasília', uf: 'DF', cnpj: '29.525.970/0001-92', razaoSocial: 'BRASAL VEICULOS LTDA' },
    { id: '3', nome: 'Toyota São João', ativo: true, marca: 'TOYOTA', cidade: 'Belo Horizonte', uf: 'MG' },
] as any[];

describe('busca de concessionária', () => {
    it('sem busca devolve todas', () => {
        expect(filtrarLojas(lojas, '  ')).toHaveLength(3);
    });

    it('casa nome, razão social, cidade e marca, sem acento e em qualquer ordem', () => {
        expect(filtrarLojas(lojas, 'brasal').map(l => l.id)).toEqual(['1', '2']);
        expect(filtrarLojas(lojas, 'veiculos ltda').map(l => l.id)).toEqual(['2']);
        expect(filtrarLojas(lojas, 'sao joao').map(l => l.id)).toEqual(['3']);
        expect(filtrarLojas(lojas, 'df ford').map(l => l.id)).toEqual(['1']);
        expect(filtrarLojas(lojas, 'toyota mg').map(l => l.id)).toEqual(['3']);
    });

    it('quem começa pelo termo vem antes', () => {
        expect(filtrarLojas(lojas, 'grupo')[0].id).toBe('2');
        expect(filtrarLojas(lojas, 'bra').map(l => l.id)).toEqual(['1', '2']);
    });

    it('só números busca no CNPJ, com ou sem pontuação', () => {
        expect(filtrarLojas(lojas, '29525970').map(l => l.id)).toEqual(['2']);
        expect(filtrarLojas(lojas, '29.525.970/0001').map(l => l.id)).toEqual(['2']);
        expect(filtrarLojas(lojas, '999999')).toHaveLength(0);
    });

    it('rótulo mostra marca e cidade; sem marca avisa', () => {
        expect(rotuloDaLoja(lojas[0])).toBe('FORD · Brasília/DF');
        expect(rotuloDaLoja(lojas[1])).toBe('Sem marca · Brasília/DF');
    });
});
