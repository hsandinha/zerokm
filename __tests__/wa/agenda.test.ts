// @vitest-environment node
// Agenda de visita e test drive: datas em Brasília, horários livres, pedido
// da IA, lembrete da véspera e validação (wa/lib/agenda.ts, puro).
import { describe, expect, it } from 'vitest';
import {
    CONFIG_PADRAO,
    calcularHorariosLivres,
    conflitoDoHorario,
    dataLocal,
    horaLocal,
    horarioCabe,
    horariosParaIa,
    inicioDaSemana,
    inicioDoPedido,
    instanteLocal,
    lerDataHoraIso,
    lerDia,
    lerQuando,
    ocupacoesDe,
    proximoDiaDoMes,
    proximosDiasAbertos,
    textoDoLembrete,
    validarAgendamento,
    validarConfig,
    variaveisDoLembrete,
    type ConfigAgenda,
} from '@wa/lib/agenda';

// 2026-11-09 é uma segunda-feira.
const SEGUNDA = '2026-11-09';
const config = (parte: Partial<ConfigAgenda> = {}): ConfigAgenda => ({
    ...CONFIG_PADRAO,
    dias: CONFIG_PADRAO.dias.map(d => (d.dia === 1 ? { dia: 1, ativo: true, inicio: '09:00', fim: '12:00' } : { ...d, ativo: false })),
    duracaoMin: 60,
    intervaloMin: 0,
    simultaneas: 1,
    antecedenciaMin: 0,
    ...parte,
});
const antes = instanteLocal('2026-11-08', '12:00');

describe('datas em Brasília', () => {
    it('ISO sem fuso é Brasília; com fuso vale o que veio', () => {
        expect(lerDataHoraIso('2026-11-12T15:00')?.toISOString()).toBe('2026-11-12T18:00:00.000Z');
        expect(lerDataHoraIso('2026-11-12T15:00:00Z')?.toISOString()).toBe('2026-11-12T15:00:00.000Z');
        expect(lerDataHoraIso('amanhã')).toBeNull();
    });

    it('data e hora locais de um instante', () => {
        const t = Date.parse('2026-11-13T01:30:00Z'); // 22h30 do dia 12 em Brasília
        expect(dataLocal(t)).toBe('2026-11-12');
        expect(horaLocal(t)).toBe('22:30');
    });

    it('dia da semana, "amanhã", dd/mm e a semana de segunda a domingo', () => {
        expect(lerDia('sábado', SEGUNDA)).toBe('2026-11-14');
        expect(lerDia('segunda-feira', SEGUNDA)).toBe(SEGUNDA);
        expect(lerDia('amanhã', SEGUNDA)).toBe('2026-11-10');
        expect(lerDia('02/01', SEGUNDA)).toBe('2027-01-02');
        expect(inicioDaSemana('2026-11-15')).toBe(SEGUNDA); // domingo volta para a segunda
    });

    it('lê o "quando" em texto livre', () => {
        expect(lerQuando('12/11 às 15h', SEGUNDA)).toEqual({ data: '2026-11-12', hora: '15:00', periodo: null });
        expect(lerQuando('amanhã 10h30', SEGUNDA)).toMatchObject({ data: '2026-11-10', hora: '10:30' });
        expect(lerQuando('sábado de manhã', SEGUNDA)).toEqual({ data: '2026-11-14', hora: null, periodo: 'manha' });
    });
});

describe('horários livres', () => {
    it('anda de hora em hora e a visita termina até o fechamento', () => {
        const livres = calcularHorariosLivres({ config: config(), data: SEGUNDA, agora: antes, ocupacoes: [] });
        expect(livres).toEqual(['09:00', '10:00', '11:00']);
    });

    it('o intervalo entra no passo', () => {
        const livres = calcularHorariosLivres({ config: config({ intervaloMin: 30 }), data: SEGUNDA, agora: antes, ocupacoes: [] });
        expect(livres).toEqual(['09:00', '10:30']);
    });

    it('ocupado tira o horário; com duas visitas ao mesmo tempo, sobra vaga', () => {
        const ocup = ocupacoesDe([
            { inicio: new Date(instanteLocal(SEGUNDA, '10:00')), duracaoMin: 60, status: 'confirmado' },
            { inicio: new Date(instanteLocal(SEGUNDA, '09:00')), duracaoMin: 60, status: 'cancelado' },
        ]);
        expect(calcularHorariosLivres({ config: config(), data: SEGUNDA, agora: antes, ocupacoes: ocup })).toEqual(['09:00', '11:00']);
        expect(calcularHorariosLivres({ config: config({ simultaneas: 2 }), data: SEGUNDA, agora: antes, ocupacoes: ocup })).toEqual([
            '09:00',
            '10:00',
            '11:00',
        ]);
    });

    it('hoje, só depois de agora mais a antecedência; dia fechado não tem horário', () => {
        const agora = instanteLocal(SEGUNDA, '09:10');
        expect(calcularHorariosLivres({ config: config({ antecedenciaMin: 60 }), data: SEGUNDA, agora, ocupacoes: [] })).toEqual(['11:00']);
        expect(calcularHorariosLivres({ config: config(), data: '2026-11-10', agora: antes, ocupacoes: [] })).toEqual([]);
    });

    it('próximos dias abertos pulam o dia fechado e o de hoje que já acabou', () => {
        expect(proximosDiasAbertos(config(), antes, 2)).toEqual([SEGUNDA, '2026-11-16']);
        expect(proximosDiasAbertos(config(), instanteLocal(SEGUNDA, '11:30'), 1)).toEqual(['2026-11-16']);
    });

    it('confere se um horário cabe na agenda', () => {
        const ocup = ocupacoesDe([{ inicio: new Date(instanteLocal(SEGUNDA, '10:00')), duracaoMin: 60, status: 'a_confirmar' }]);
        const c = config();
        expect(horarioCabe({ config: c, inicio: new Date(instanteLocal(SEGUNDA, '09:00')), duracaoMin: 60, ocupacoes: ocup })).toBe(true);
        expect(horarioCabe({ config: c, inicio: new Date(instanteLocal(SEGUNDA, '10:30')), duracaoMin: 60, ocupacoes: ocup })).toBe(false);
        expect(horarioCabe({ config: c, inicio: new Date(instanteLocal(SEGUNDA, '11:30')), duracaoMin: 60, ocupacoes: [] })).toBe(false);
    });

    it('diz por que não cabe: fora do horário de visita ou lotado', () => {
        const ocup = ocupacoesDe([{ inicio: new Date(instanteLocal(SEGUNDA, '10:00')), duracaoMin: 60, status: 'confirmado' }]);
        const em = (dia: string, h: string) => new Date(instanteLocal(dia, h));
        expect(conflitoDoHorario({ config: config(), inicio: em(SEGUNDA, '10:00'), duracaoMin: 60, ocupacoes: ocup })).toBe('lotado');
        expect(conflitoDoHorario({ config: config({ simultaneas: 2 }), inicio: em(SEGUNDA, '10:00'), duracaoMin: 60, ocupacoes: ocup })).toBeNull();
        expect(conflitoDoHorario({ config: config(), inicio: em(SEGUNDA, '14:00'), duracaoMin: 60, ocupacoes: [] })).toBe('fechado');
        expect(conflitoDoHorario({ config: config(), inicio: em('2026-11-10', '10:00'), duracaoMin: 60, ocupacoes: [] })).toBe('fechado');
    });

    it('o texto para a IA traz a data em ISO e avisa quando o dia pedido não tem vaga', () => {
        const txt = horariosParaIa(
            [
                { data: SEGUNDA, horas: [] },
                { data: '2026-11-16', horas: ['09:00', '14:00'] },
            ],
            'manha',
            SEGUNDA,
        );
        expect(txt).toContain('Sem horário livre em segunda-feira, 09/11');
        expect(txt).toContain('(2026-11-16): 09:00');
        expect(txt).not.toContain('14:00');
        expect(horariosParaIa([], null)).toMatch(/Nenhum horário livre/);
    });
});

describe('pedido da IA', () => {
    it('usa a data_iso (Brasília) quando vem', () => {
        const r = inicioDoPedido({ data_iso: '2026-11-12T15:00', quando: 'quinta 15h' }, null, antes);
        expect(r).toEqual({ inicio: new Date('2026-11-12T18:00:00Z'), aproximado: false });
    });

    it('sem data_iso, lê o texto; sem hora, marca como aproximado', () => {
        const r = inicioDoPedido({ quando: 'sábado de manhã' }, null, antes);
        expect(r.aproximado).toBe(true);
        expect(dataLocal(r.inicio)).toBe('2026-11-14');
        expect(horaLocal(r.inicio)).toBe('09:00');
    });

    it('"dia 15" sem mês é o próximo dia 15, não amanhã', () => {
        // antes = 08/11: o dia 15 ainda vem neste mês; o dia 5, só no próximo.
        const r = inicioDoPedido({ quando: 'dia 15 às 14h' }, null, antes);
        expect(r).toEqual({ inicio: new Date(instanteLocal('2026-11-15', '14:00')), aproximado: false });
        expect(dataLocal(inicioDoPedido({ quando: 'pode ser dia 5' }, null, antes).inicio)).toBe('2026-12-05');
        expect(lerQuando('20 de novembro as 10h', '2026-11-08')).toMatchObject({ data: '2026-11-20', hora: '10:00' });
        expect(lerQuando('dia 15 de janeiro', '2026-11-08').data).toBe('2027-01-15');
        // 31 em mês de 30 dias pula para o próximo mês que tem.
        expect(proximoDiaDoMes(31, '2026-11-08')).toBe('2026-12-31');
        expect(proximoDiaDoMes(8, '2026-11-08')).toBe('2026-11-08');
        expect(proximoDiaDoMes(32, '2026-11-08')).toBeNull();
    });

    it('sem dia nenhum, fica no próximo dia de visita, aproximado', () => {
        const r = inicioDoPedido({ quando: 'qualquer dia' }, config(), antes);
        expect(r.aproximado).toBe(true);
        expect(dataLocal(r.inicio)).toBe(SEGUNDA);
        expect(horaLocal(r.inicio)).toBe('09:00');
    });
});

describe('lembrete da véspera', () => {
    const dados = {
        nome: 'Carlos Souza',
        tipo: 'test_drive',
        inicio: new Date(instanteLocal('2026-11-13', '15:00')),
        loja: 'Auto Center',
        veiculo: 'Onix LTZ',
    };
    it('texto com primeiro nome, dia, hora e carro', () => {
        const t = textoDoLembrete(dados);
        expect(t).toContain('Oi, Carlos!');
        expect(t).toContain('do seu test drive');
        expect(t).toContain('sexta-feira, 13/11, às 15:00');
        expect(t).toContain('Onix LTZ');
    });
    it('variáveis do template na ordem e nenhuma vazia', () => {
        expect(variaveisDoLembrete(dados)).toEqual(['Carlos', 'sexta-feira, 13/11', '15:00', 'Auto Center', 'Onix LTZ']);
        const vazias = variaveisDoLembrete({ ...dados, nome: null, veiculo: null, tipo: 'visita', loja: '' });
        expect(vazias.every(v => v.trim().length > 0)).toBe(true);
    });
});

describe('validação', () => {
    it('configuração: fim antes do início é erro; o que falta fica no padrão', () => {
        const ruim = validarConfig({ dias: [{ dia: 1, ativo: true, inicio: '18:00', fim: '09:00' }] });
        expect(ruim.errors[0]).toMatch(/segunda-feira/);
        const ok = validarConfig({ duracaoMin: 45, lembrete: { ativo: true, templateName: 'lembrete_visita' } });
        expect(ok.errors).toEqual([]);
        expect(ok.config.duracaoMin).toBe(45);
        expect(ok.config.dias).toHaveLength(7);
        expect(ok.config.lembrete).toEqual({ ativo: true, templateName: 'lembrete_visita', templateLanguage: 'pt_BR' });
    });

    it('agendamento: dia e hora em Brasília, status e responsável', () => {
        const { data, errors } = validarAgendamento({ data: '2026-11-12', hora: '15:00', status: 'confirmado', responsavel: 'Ana@Loja.com' });
        expect(errors).toEqual([]);
        expect(data.inicio?.toISOString()).toBe('2026-11-12T18:00:00.000Z');
        expect(data.status).toBe('confirmado');
        expect(data.responsavel).toBe('ana@loja.com');
        expect(validarAgendamento({ data: '2026-11-12' }).errors).toContain('Escolha o dia e o horário.');
        expect(validarAgendamento({ status: 'talvez' }, true).errors).toEqual(['Status inválido.']);
    });
});
