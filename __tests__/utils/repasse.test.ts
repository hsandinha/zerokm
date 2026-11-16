import { describe, expect, it } from 'vitest';
import { parseAno, parseKm, parsePreco, validateRepasse, formatKm, escolherAnoFipe, parseRepassePrecoFipe, referenciaFipeTitulo, rotuloFipe, serializeRepasse } from '@/lib/utils/repasse';

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
        expect(validateRepasse({ ...valido, status: 'A faturar' }).errors[0]).toMatch(/só tem o estado Disponível/);
        // Vendido não é estado: o anúncio é removido.
        expect(validateRepasse({ ...valido, status: 'Vendido' }).errors[0]).toMatch(/remova o anúncio/);
        expect(validateRepasse({ ...valido, ano: '18/20' }).errors[0]).toMatch(/fabricação/);
        expect(validateRepasse({ ...valido, ano: '1940' }).errors[0]).toMatch(/fora do intervalo/);
    });

    it('status aceita qualquer caixa e grava o canônico', () => {
        expect(validateRepasse({ ...valido, status: 'disponível' }).data.status).toBe('Disponível');
        expect(validateRepasse(valido).data.status).toBe('Disponível');
    });

    it('edição parcial só valida o que veio', () => {
        const { data, errors } = validateRepasse({ km: '51.000' }, true);
        expect(errors).toEqual([]);
        expect(data).toEqual({ km: 51000 });
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

describe('repasse: FIPE de referência abaixo do preço', () => {
    it('lê o preço FIPE do formulário no formato que a FIPE devolve', () => {
        expect(parseRepassePrecoFipe({ precoFipe: 'R$ 58.000,00', referenciaFipe: ' setembro de 2026 ' }))
            .toEqual({ precoFipe: 58000, referenciaFipe: 'setembro de 2026' });
        expect(parseRepassePrecoFipe({ precoFipe: 85900.5 })).toEqual({ precoFipe: 85900.5, referenciaFipe: null });
    });

    it('ausente não mexe; vazio ou inválido limpa, sem virar erro de cadastro', () => {
        expect(parseRepassePrecoFipe({})).toEqual({});
        expect(parseRepassePrecoFipe({ precoFipe: '' })).toEqual({ precoFipe: null, referenciaFipe: null });
        expect(parseRepassePrecoFipe({ precoFipe: 'abc', referenciaFipe: 'x' })).toEqual({ precoFipe: null, referenciaFipe: null });
    });

    it('escolhe o ano-modelo do carro entre os anos da FIPE', () => {
        const anos = [{ code: '32000-1' }, { code: '2021-1' }, { code: '2020-1' }, { code: '2020-3' }];
        expect(escolherAnoFipe(anos, 2021, 'Flex')).toBe('2021-1');
        // Dois combustíveis no mesmo ano: desempata pelo do cadastro.
        expect(escolherAnoFipe(anos, 2020, 'Diesel')).toBe('2020-3');
        expect(escolherAnoFipe(anos, 2020, 'Flex')).toBe('2020-1');
        // Sem como desempatar, ou ano que a FIPE não tem: fica sem FIPE.
        expect(escolherAnoFipe(anos, 2020, 'Elétrico')).toBeNull();
        expect(escolherAnoFipe(anos, 2020, '')).toBeNull();
        expect(escolherAnoFipe(anos, 2018, 'Flex')).toBeNull();
        expect(escolherAnoFipe(anos, undefined, 'Flex')).toBeNull();
    });

    it('zero km da FIPE (32000) nunca serve para usado', () => {
        expect(escolherAnoFipe([{ code: '32000-1' }], 32000, 'Flex')).toBe('32000-1'); // só se o ano for mesmo esse código
        expect(escolherAnoFipe([{ code: '32000-1' }], 2026, 'Flex')).toBeNull();
    });

    it('rótulo da segunda linha: só existe quando há FIPE', () => {
        expect(rotuloFipe(85000)).toMatch(/^FIPE R\$\s85\.000$/);
        expect(rotuloFipe(58123.4)).toMatch(/^FIPE R\$\s58\.123$/);
        expect(rotuloFipe(null)).toBeNull();
        expect(rotuloFipe(undefined)).toBeNull();
        expect(rotuloFipe(0)).toBeNull();
        expect(referenciaFipeTitulo('setembro de 2026')).toContain('setembro de 2026');
        expect(referenciaFipeTitulo('')).toContain('Tabela FIPE');
        // Texto novo que o usuário vê: sem travessão.
        expect(referenciaFipeTitulo('setembro de 2026')).not.toContain('—');
    });

    it('a listagem da concessionária devolve a FIPE', () => {
        const base = { _id: 'a1', marca: 'FIAT', modelo: 'ARGO', anoModelo: 2020, km: 10, preco: 50000, status: 'Disponível' };
        expect(serializeRepasse({ ...base, precoFipe: 58000, referenciaFipe: 'setembro de 2026' }))
            .toMatchObject({ precoFipe: 58000, referenciaFipe: 'setembro de 2026' });
        expect(serializeRepasse(base)).toMatchObject({ precoFipe: null, referenciaFipe: '' });
    });
});
