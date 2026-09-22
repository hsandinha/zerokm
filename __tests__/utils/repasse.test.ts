import { describe, expect, it } from 'vitest';
import { parseAno, parseKm, parsePreco, validateRepasse, formatKm } from '@/lib/utils/repasse';

describe('repasse — parsers', () => {
    it('km aceita formatos que a concessionária digita', () => {
        expect(parseKm('48.500')).toBe(48500);
        expect(parseKm('48500 km')).toBe(48500);
        expect(parseKm(12000)).toBe(12000);
        expect(parseKm('')).toBeNull();
        expect(parseKm('abc')).toBeNull();
    });

    it('preço entende milhar com ponto e centavos com vírgula', () => {
        expect(parsePreco('R$ 72.900,00')).toBe(72900);
        expect(parsePreco('72.900')).toBe(72900);
        expect(parsePreco('72900.50')).toBe(72900.5);
        expect(parsePreco('0')).toBeNull();
        expect(parsePreco('')).toBeNull();
    });

    it('ano composto vira fabricação e modelo', () => {
        expect(parseAno('19/20')).toEqual({ ano: '19/20', anoFabricacao: 2019, anoModelo: 2020 });
        expect(parseAno('2019/2020')).toEqual({ ano: '19/20', anoFabricacao: 2019, anoModelo: 2020 });
        expect(parseAno('2021')).toEqual({ ano: '2021', anoModelo: 2021 });
    });

    it('formatKm', () => {
        expect(formatKm(48500)).toBe('48.500 km');
        expect(formatKm(undefined)).toBe('-');
    });
});

describe('repasse — validateRepasse', () => {
    const valido = { marca: 'chevrolet', modelo: 'onix lt', ano: '19/20', km: '48.500', preco: '72.900,00' };

    it('cadastro completo normaliza os campos', () => {
        const { data, errors } = validateRepasse({ ...valido, cor: 'prata' });
        expect(errors).toEqual([]);
        expect(data).toMatchObject({
            tipoVeiculo: 'carro', marca: 'CHEVROLET', modelo: 'ONIX LT', anoModelo: 2020, anoFabricacao: 2019,
            km: 48500, preco: 72900, cor: 'PRATA', status: 'Disponível',
        });
    });

    it('km e preço são obrigatórios no cadastro', () => {
        const { errors } = validateRepasse({ marca: 'FIAT', modelo: 'ARGO', ano: '2022' });
        expect(errors).toContain('Quilometragem é obrigatória.');
        expect(errors).toContain('Preço é obrigatório e maior que zero.');
    });

    it('recusa status fora da lista e ano incoerente', () => {
        expect(validateRepasse({ ...valido, status: 'A faturar' }).errors).toContain('Status deve ser Disponível, Reservado ou Vendido.');
        expect(validateRepasse({ ...valido, ano: '18/20' }).errors[0]).toMatch(/fabricação/);
        expect(validateRepasse({ ...valido, ano: '1940' }).errors[0]).toMatch(/fora do intervalo/);
    });

    it('status aceita qualquer caixa e grava o canônico', () => {
        expect(validateRepasse({ ...valido, status: 'vendido' }).data.status).toBe('Vendido');
    });

    it('edição parcial só valida o que veio', () => {
        const { data, errors } = validateRepasse({ status: 'Reservado' }, true);
        expect(errors).toEqual([]);
        expect(data).toEqual({ status: 'Reservado' });
    });

    it('edição com observação vazia remove a observação', () => {
        const { data } = validateRepasse({ observacoes: '' }, true);
        expect(Object.prototype.hasOwnProperty.call(data, 'observacoes')).toBe(true);
        expect(data.observacoes).toBeUndefined();
    });

    it('placa não é aceita: vai pelo WhatsApp', () => {
        const { data } = validateRepasse({ ...valido, placa: 'ABC1D23' } as any);
        expect(data).not.toHaveProperty('placa');
    });
});
