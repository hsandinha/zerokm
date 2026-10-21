import { describe, expect, it } from 'vitest';
import { chaveDaMarca, marcasParecidas, pareceData } from '@/lib/utils/marcasCatalogo';

describe('chaveDaMarca', () => {
    it('junta as grafias da Chevrolet', () => {
        expect(chaveDaMarca('GM - Chevrolet')).toBe('CHEVROLET');
        expect(chaveDaMarca('GM')).toBe('CHEVROLET');
        expect(chaveDaMarca('chevrolet')).toBe('CHEVROLET');
    });

    it('junta as grafias da Volkswagen', () => {
        expect(chaveDaMarca('VW - VolksWagen')).toBe('VOLKSWAGEN');
        expect(chaveDaMarca('VW')).toBe('VOLKSWAGEN');
        expect(chaveDaMarca('Volkswagen')).toBe('VOLKSWAGEN');
    });

    it('trata Mercedes-Benz, Land Rover e Caoa Chery', () => {
        expect(chaveDaMarca('Mercedes-Benz')).toBe(chaveDaMarca('MERCEDES'));
        expect(chaveDaMarca('Land Rover')).toBe(chaveDaMarca('LAND-ROVER'));
        expect(chaveDaMarca('Caoa Chery')).toBe(chaveDaMarca('CHERY'));
    });

    it('não mistura cadastros separados de propósito', () => {
        expect(chaveDaMarca('HONDA MOTOS')).not.toBe(chaveDaMarca('HONDA'));
        expect(chaveDaMarca('Fiat')).toBe(chaveDaMarca('FIAT'));
        expect(chaveDaMarca('Fiat')).not.toBe(chaveDaMarca('Ford'));
    });
});

describe('pareceData', () => {
    it('reconhece datas e números usados como nome', () => {
        expect(pareceData('2026-01-15')).toBe(true);
        expect(pareceData('15/01/2026')).toBe(true);
        expect(pareceData('45678')).toBe(true);
        expect(pareceData('2026-01-15T03:00:00.000Z')).toBe(true);
        expect(pareceData('Thu Jan 15 2026 00:00:00 GMT-0300')).toBe(true);
    });

    it('não marca nomes de marca', () => {
        for (const nome of ['BYD', 'Ford', 'GM - Chevrolet', 'Peugeot', 'RAM', 'JAC', 'Mitsubishi', 'GWM']) {
            expect(pareceData(nome)).toBe(false);
        }
    });
});

describe('marcasParecidas', () => {
    it('aponta as duplicadas de cada marca', () => {
        const marcas = [
            { id: '1', nome: 'GM' },
            { id: '2', nome: 'GM - Chevrolet' },
            { id: '3', nome: 'Fiat' },
            { id: '4', nome: 'VW' },
            { id: '5', nome: 'VW - VolksWagen' },
        ];
        const parecidas = marcasParecidas(marcas);
        expect(parecidas.get('1')?.map(m => m.nome)).toEqual(['GM - Chevrolet']);
        expect(parecidas.get('5')?.map(m => m.nome)).toEqual(['VW']);
        expect(parecidas.has('3')).toBe(false);
    });
});
