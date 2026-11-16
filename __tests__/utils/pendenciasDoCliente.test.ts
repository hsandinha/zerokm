import { describe, expect, it } from 'vitest';
import { camposQueFaltam, pendenciasDoCliente, temPendencia, type ClienteParaPendencias } from '@/lib/utils/pendenciasDoCliente';

const emDia: ClienteParaPendencias = {
    firebaseUid: 'uid-1',
    displayName: 'Alfa Motors',
    phoneNumber: '31999999999',
    cpf: '12345678000190',
    address: { city: 'Belo Horizonte', state: 'MG' },
    profileType: 'cliente',
    status: 'active',
    planType: 'monthly',
    credits: 0,
    freeTrialExpired: false,
    isInvitee: false,
};

const codigos = (c: ClienteParaPendencias) => pendenciasDoCliente(c).map(p => p.codigo);

describe('pendenciasDoCliente', () => {
    it('não aponta nada para o lojista em dia', () => {
        expect(pendenciasDoCliente(emDia)).toEqual([]);
        expect(temPendencia(emDia)).toBe(false);
    });

    it('aponta "Sem login" sem vínculo de login', () => {
        const [p] = pendenciasDoCliente({ ...emDia, firebaseUid: null });
        expect(p.rotulo).toBe('Sem login');
        expect(p.aba).toBe('acessos');
    });

    it('aponta "Sem login" com o login desativado, quando a ficha sabe', () => {
        expect(codigos({ ...emDia, loginDesativado: true })).toEqual(['sem_login']);
        // A lista não consulta o Firebase: sem a informação, não acusa.
        expect(codigos({ ...emDia, loginDesativado: null })).toEqual([]);
    });

    it('aponta "Sem plano" para quem nunca teve plano nem teste vencido', () => {
        const ps = pendenciasDoCliente({ ...emDia, profileType: 'gratis', status: 'no_plan', planType: null });
        expect(ps.map(p => p.rotulo)).toEqual(['Sem plano']);
        expect(ps[0].aba).toBe('planos');
    });

    it('troca "Sem plano" por "Teste vencido" quando o teste grátis acabou', () => {
        const ps = pendenciasDoCliente({ ...emDia, profileType: 'gratis', status: 'no_plan', planType: null, freeTrialExpired: true });
        expect(ps.map(p => p.rotulo)).toEqual(['Teste vencido']);
    });

    it('aponta "Plano vencido" para assinatura expirada', () => {
        const ps = pendenciasDoCliente({ ...emDia, status: 'expired' });
        expect(ps.map(p => p.rotulo)).toEqual(['Plano vencido']);
        expect(ps[0].tom).toBe('negative');
    });

    it('plano de créditos vale enquanto houver saldo', () => {
        expect(codigos({ ...emDia, status: 'no_plan', planType: 'credits', credits: 3 })).toEqual([]);
        expect(codigos({ ...emDia, status: 'no_plan', planType: 'credits', credits: 0 })).toEqual(['sem_creditos']);
    });

    it('tela extra não tem pendência de plano: o plano é da conta principal', () => {
        expect(codigos({ ...emDia, isInvitee: true, profileType: 'gratis', status: 'no_plan', freeTrialExpired: true })).toEqual([]);
    });

    it('aponta "Cadastro incompleto" com a lista do que falta', () => {
        const incompleto = { ...emDia, phoneNumber: '', cpf: ' ', address: { city: 'Belo Horizonte', state: '' } };
        expect(camposQueFaltam(incompleto)).toEqual(['telefone', 'CPF ou CNPJ', 'UF']);
        const [p] = pendenciasDoCliente(incompleto);
        expect(p.rotulo).toBe('Cadastro incompleto');
        expect(p.detalhe).toBe('Falta telefone, CPF ou CNPJ, UF.');
        expect(p.aba).toBe('dados');
    });

    it('rua e CEP não entram na pendência de cadastro', () => {
        expect(camposQueFaltam({ ...emDia, address: { city: 'Contagem', state: 'MG' } })).toEqual([]);
        expect(camposQueFaltam({ ...emDia, address: null })).toEqual(['cidade', 'UF']);
    });

    it('acumula as pendências na ordem login, plano, cadastro', () => {
        expect(codigos({ firebaseUid: '', profileType: 'gratis', status: 'no_plan', displayName: 'X' }))
            .toEqual(['sem_login', 'sem_plano', 'cadastro_incompleto']);
    });
});
