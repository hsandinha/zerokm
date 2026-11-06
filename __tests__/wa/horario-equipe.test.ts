// Horário da loja e regras da equipe (funções puras de wa/lib/horario.ts e
// wa/lib/equipe.ts). O fuso é o de Brasília, fixo em UTC-3: 12:00Z = 9h.

import { describe, expect, it } from 'vitest';
import {
    avisoDeTransferenciaFora,
    estadoDoHorario,
    horarioPadrao,
    normalizarHorario,
    resumoDoHorario,
    textoForaDoHorario,
    validarHorario,
    type HorarioLoja,
} from '@wa/lib/horario';
import { escolherNoRodizio, slaValido, statusEfetivo, SINAL_MAX_MS } from '@wa/lib/equipe';
import { intervaloDoPeriodo, media, mediana } from '@wa/lib/periodo';

// 2026-11-06 é uma sexta-feira.
const sexta = (hhmm: string) => new Date(`2026-11-06T${hhmm}:00-03:00`);

function ligado(extra: Partial<HorarioLoja> = {}): HorarioLoja {
    return { ...horarioPadrao(), ativo: true, ...extra };
}

describe('estadoDoHorario', () => {
    it('desligado: sempre aberto', () => {
        expect(estadoDoHorario(horarioPadrao(), sexta('03:00')).aberto).toBe(true);
    });

    it('dentro da faixa: aberto', () => {
        const e = estadoDoHorario(ligado(), sexta('09:30'));
        expect(e).toEqual({ aberto: true, quandoVolta: '', proximaAbertura: null });
    });

    it('antes de abrir: volta hoje', () => {
        const e = estadoDoHorario(ligado(), sexta('07:10'));
        expect(e.aberto).toBe(false);
        expect(e.quandoVolta).toBe('hoje às 8h');
        expect(e.proximaAbertura?.toISOString()).toBe('2026-11-06T11:00:00.000Z');
    });

    it('fechou na sexta: volta amanhã (sábado)', () => {
        const e = estadoDoHorario(ligado(), sexta('18:00'));
        expect(e.aberto).toBe(false);
        expect(e.quandoVolta).toBe('amanhã a partir das 8h');
    });

    it('sábado à tarde: pula o domingo e volta segunda', () => {
        const e = estadoDoHorario(ligado(), new Date('2026-11-07T15:00:00-03:00'));
        expect(e.quandoVolta).toBe('segunda-feira a partir das 8h');
        expect(e.proximaAbertura?.toISOString()).toBe('2026-11-09T11:00:00.000Z');
    });

    it('intervalo de almoço: volta hoje à tarde', () => {
        const h = ligado();
        h.dias[5] = { dia: 5, faixas: [{ abre: '08:00', fecha: '12:00' }, { abre: '13:30', fecha: '18:00' }] };
        const e = estadoDoHorario(h, sexta('12:15'));
        expect(e.aberto).toBe(false);
        expect(e.quandoVolta).toBe('hoje às 13h30');
        expect(estadoDoHorario(h, sexta('14:00')).aberto).toBe(true);
    });

    it('feriado: fechado o dia todo e volta no próximo dia aberto', () => {
        const h = ligado({ feriados: [{ data: '2026-11-06', nome: 'Inventário' }, { data: '2026-11-07' }] });
        const e = estadoDoHorario(h, sexta('10:00'));
        expect(e.aberto).toBe(false);
        expect(e.quandoVolta).toBe('segunda-feira a partir das 8h');
    });

    it('recesso longo: diz a data', () => {
        const feriados = Array.from({ length: 10 }, (_, i) => ({
            data: new Date(Date.UTC(2026, 10, 6 + i)).toISOString().slice(0, 10),
        }));
        const e = estadoDoHorario(ligado({ feriados }), sexta('10:00'));
        expect(e.quandoVolta).toBe('em 16/11 a partir das 8h');
    });

    it('nenhum dia aberto: fechado, sem previsão', () => {
        const h = ligado({ dias: Array.from({ length: 7 }, (_, dia) => ({ dia, faixas: [] })) });
        expect(estadoDoHorario(h, sexta('10:00'))).toEqual({ aberto: false, quandoVolta: '', proximaAbertura: null });
        expect(textoForaDoHorario(h, sexta('10:00'))).toContain('assim que possível');
    });
});

describe('textos', () => {
    it('resumo da semana', () => {
        expect(resumoDoHorario(ligado())).toBe('Seg a Sex 8h às 18h, Sáb 8h às 13h, Dom fechado');
    });

    it('mensagem padrão e personalizada com marcadores', () => {
        const h = ligado();
        expect(textoForaDoHorario(h, sexta('19:00'))).toContain('Nossa equipe responde amanhã a partir das 8h');
        h.mensagem = 'Voltamos {{volta}}. Horário: {{ horario }}';
        expect(textoForaDoHorario(h, sexta('19:00'))).toBe(
            'Voltamos amanhã a partir das 8h. Horário: Seg a Sex 8h às 18h, Sáb 8h às 13h, Dom fechado',
        );
        expect(avisoDeTransferenciaFora(h, sexta('19:00'))).toContain('volta amanhã a partir das 8h');
    });

    it('texto novo sem travessão', () => {
        const h = ligado();
        for (const t of [textoForaDoHorario(h, sexta('19:00')), avisoDeTransferenciaFora(h, sexta('19:00')), resumoDoHorario(h)]) {
            expect(t).not.toContain('—');
        }
    });
});

describe('normalizar e validar', () => {
    it('completa os sete dias, ordena faixas e descarta as inválidas', () => {
        const h = normalizarHorario({
            ativo: true,
            dias: [{ dia: 1, faixas: [{ abre: '14:00', fecha: '18:00' }, { abre: '8:00', fecha: '12:00' }, { abre: '19:00', fecha: '18:00' }] }],
            feriados: [{ data: '2026-12-25' }, { data: '2026-12-25' }, { data: '2026-02-30' }],
            intervaloHoras: 0,
        });
        expect(h.dias).toHaveLength(7);
        expect(h.dias[1].faixas).toEqual([{ abre: '08:00', fecha: '12:00' }, { abre: '14:00', fecha: '18:00' }]);
        expect(h.dias[0].faixas).toEqual([]);
        expect(h.feriados).toEqual([{ data: '2026-12-25' }]);
        expect(h.intervaloHoras).toBe(12);
    });

    it('sem nada salvo: padrão desligado', () => {
        expect(normalizarHorario(undefined)).toEqual(horarioPadrao());
    });

    it('recusa fim antes do início e faixas sobrepostas', () => {
        expect(validarHorario({ dias: [{ dia: 2, faixas: [{ abre: '18:00', fecha: '08:00' }] }] })).toContain('Terça-feira');
        expect(
            validarHorario({ dias: [{ dia: 3, faixas: [{ abre: '08:00', fecha: '12:00' }, { abre: '11:00', fecha: '15:00' }] }] }),
        ).toContain('sobrepõem');
        expect(validarHorario(horarioPadrao())).toBeNull();
    });
});

describe('equipe', () => {
    it('sem sinal há mais de 3 minutos conta como Ausente', () => {
        const agora = Date.now();
        expect(statusEfetivo({ status: 'online', vistoEm: new Date(agora - 30_000) }, agora)).toBe('online');
        expect(statusEfetivo({ status: 'online', vistoEm: new Date(agora - SINAL_MAX_MS - 1) }, agora)).toBe('ausente');
        expect(statusEfetivo({ status: 'pausa', vistoEm: new Date(agora) }, agora)).toBe('pausa');
        expect(statusEfetivo(null, agora)).toBe('ausente');
    });

    it('rodízio: quem nunca recebeu primeiro, depois quem recebeu há mais tempo', () => {
        const lista = [
            { email: 'a@x', ultimaAtribuicaoEm: new Date('2026-11-06T10:00:00Z'), vistoEm: new Date() },
            { email: 'b@x', ultimaAtribuicaoEm: null, vistoEm: new Date() },
            { email: 'c@x', ultimaAtribuicaoEm: new Date('2026-11-06T09:00:00Z'), vistoEm: new Date() },
        ];
        expect(escolherNoRodizio(lista)?.email).toBe('b@x');
        expect(escolherNoRodizio(lista, 'b@x')?.email).toBe('c@x');
        expect(escolherNoRodizio([lista[0]], 'a@x')).toBeNull();
    });

    it('SLA da loja: padrão 15, limitado a 1 dia', () => {
        expect(slaValido(undefined)).toBe(15);
        expect(slaValido(0)).toBe(15);
        expect(slaValido(30)).toBe(30);
        expect(slaValido(99999)).toBe(1440);
    });
});

describe('período dos Resultados (dia de Brasília)', () => {
    // 06/11/2026 01:30 em Brasília = 04:30Z: em UTC já é dia 6, e às 23h de
    // Brasília do dia 5 (02:00Z do dia 6) ainda é dia 5 para a loja.
    it('hoje começa à meia-noite de Brasília', () => {
        const agora = new Date('2026-11-06T02:00:00Z'); // 23h do dia 5 em Brasília
        expect(intervaloDoPeriodo('hoje', {}, agora).de.toISOString()).toBe('2026-11-05T03:00:00.000Z');
    });

    it('7 dias, este mês e mês passado', () => {
        const agora = new Date('2026-11-06T15:00:00Z');
        expect(intervaloDoPeriodo('7d', {}, agora).de.toISOString()).toBe('2026-10-31T03:00:00.000Z');
        expect(intervaloDoPeriodo('mes', {}, agora).de.toISOString()).toBe('2026-11-01T03:00:00.000Z');
        const passado = intervaloDoPeriodo('mes_passado', {}, agora);
        expect(passado.de.toISOString()).toBe('2026-10-01T03:00:00.000Z');
        expect(passado.ate.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    });

    it('datas escolhidas: inclui o último dia e nunca passa de agora', () => {
        const agora = new Date('2026-11-06T15:00:00Z');
        const i = intervaloDoPeriodo('datas', { de: '2026-10-01', ate: '2026-10-15' }, agora);
        expect(i.de.toISOString()).toBe('2026-10-01T03:00:00.000Z');
        expect(i.ate.toISOString()).toBe('2026-10-16T03:00:00.000Z');
        expect(i.rotulo).toBe('01/10 a 15/10');
        expect(intervaloDoPeriodo('datas', { de: '2026-11-01', ate: '2026-12-31' }, agora).ate).toEqual(agora);
    });

    it('mediana e média', () => {
        expect(mediana([])).toBeNull();
        expect(mediana([5, 1, 3])).toBe(3);
        expect(mediana([4, 1, 3, 2])).toBe(2.5);
        expect(media([1, 2, 3])).toBe(2);
    });
});
