// @vitest-environment node
// Automações da loja e follow-up da coluna do funil (wa/lib/automacoes.ts):
// o preenchimento do texto e do template, a janela de 24h, o horário, o
// aniversário de 29/02 e a regra de quem recebe o toque. E o gancho que grava
// a hora do encerramento na conversa (wa/models/wa.ts), base do pós-atendimento.
import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import {
    automaticaRecente,
    diasDeAniversarioDe,
    horarioPermitido,
    janelaAberta,
    motivoParaNaoAvaliar,
    motivoParaNaoTocar,
    normalizarAutomacao,
    normalizarFollowup,
    parametrosDoModelo,
    preencherTexto,
    toquesNaColuna,
} from '@wa/lib/automacoes';
import { WaConversation } from '@wa/models/wa';

const HORA = 3600_000;
const AGORA = Date.parse('2026-11-06T15:00:00Z'); // 12h em Brasília
const ha = (h: number) => new Date(AGORA - h * HORA);

describe('texto e template', () => {
    it('troca os campos e arruma a pontuação do que veio vazio', () => {
        expect(preencherTexto('Oi, {{nome}}! Aqui é da {{loja}}.', { nome: 'Ana', loja: 'Auto Center' })).toBe(
            'Oi, Ana! Aqui é da Auto Center.',
        );
        expect(preencherTexto('Oi, {{nome}}! Tudo bem?', {})).toBe('Oi! Tudo bem?');
        // Campo que não existe fica à vista, para a pessoa corrigir.
        expect(preencherTexto('Oi {{apelido}}', { nome: 'Ana' })).toBe('Oi {{apelido}}');
    });

    it('variável de template nunca vai vazia', () => {
        expect(parametrosDoModelo(['nome', 'loja'], 2, { nome: '', loja: 'Auto Center' })).toEqual([
            'cliente',
            'Auto Center',
        ]);
        // Mais variáveis que campos escolhidos: o resto recebe o nome.
        expect(parametrosDoModelo(['loja'], 2, { nome: 'Ana', loja: 'X' })).toEqual(['X', 'Ana']);
        expect(parametrosDoModelo(['inventado'], 1, { nome: 'Ana' })).toEqual(['Ana']);
    });
});

describe('quando pode mandar', () => {
    it('nada sai de madrugada (horário de Brasília)', () => {
        expect(horarioPermitido(new Date('2026-11-06T13:00:00Z'))).toBe(true); // 10h
        expect(horarioPermitido(new Date('2026-11-06T06:00:00Z'))).toBe(false); // 3h
        expect(horarioPermitido(new Date('2026-11-07T00:30:00Z'))).toBe(false); // 21h30
    });

    it('texto livre só dentro da janela de 24h, com margem', () => {
        expect(janelaAberta(ha(23), AGORA)).toBe(true);
        expect(janelaAberta(new Date(AGORA - 24 * HORA + 5 * 60_000), AGORA)).toBe(false);
        expect(janelaAberta(null, AGORA)).toBe(false);
    });

    it('29/02 comemora no 28/02 quando o ano não é bissexto', () => {
        expect(diasDeAniversarioDe({ ano: 2027, mes: 2, dia: 28 })).toEqual([
            { mes: 2, dia: 28 },
            { mes: 2, dia: 29 },
        ]);
        expect(diasDeAniversarioDe({ ano: 2028, mes: 2, dia: 28 })).toEqual([{ mes: 2, dia: 28 }]);
    });

    it('uma automática não sai em cima da outra', () => {
        expect(automaticaRecente(ha(2), AGORA)).toBe(true);
        expect(automaticaRecente(ha(13), AGORA)).toBe(false);
        expect(automaticaRecente(null, AGORA)).toBe(false);
    });
});

describe('configuração', () => {
    it('follow-up com 24h ou mais precisa de template (a janela já fechou)', () => {
        expect(normalizarFollowup({ ativo: true, horas: 48, texto: 'oi' }).erro).toMatch(/template/);
        expect(normalizarFollowup({ ativo: true, horas: 48, texto: 'oi', template: 'retomada' }).erro).toBeNull();
        expect(normalizarFollowup({ ativo: true, horas: 4, modo: 'texto', texto: '' }).erro).toMatch(/texto/);
        // No modo IA o texto é só orientação: pode ficar vazio.
        expect(normalizarFollowup({ ativo: true, horas: 4, modo: 'ia', texto: '' }).erro).toBeNull();
        // Desligado não confere nada.
        expect(normalizarFollowup({ ativo: false, horas: 48 }).erro).toBeNull();
    });

    it('limites e campos inválidos', () => {
        const { config } = normalizarFollowup({ horas: 9999, maximo: 0, modo: 'x', template: 'Nome Com Espaço', templateVars: ['nome', 'xxx'] });
        expect(config.horas).toBe(720);
        expect(config.maximo).toBe(1);
        expect(config.modo).toBe('texto');
        expect(config.template).toBeNull();
        expect(config.templateVars).toEqual(['nome', 'nome']);
    });

    it('pós-atendimento com o link no texto exige o link', () => {
        const base = { ativa: true, texto: 'Avalie: {{link_avaliacao}}' };
        expect(normalizarAutomacao('pos_atendimento', base).erro).toMatch(/link/);
        expect(normalizarAutomacao('pos_atendimento', { ...base, linkAvaliacao: 'g.page/x' }).erro).toMatch(/https/);
        expect(normalizarAutomacao('pos_atendimento', { ...base, linkAvaliacao: 'https://g.page/r/abc' }).erro).toBeNull();
        expect(normalizarAutomacao('pos_venda', { ativa: true, texto: 'oi', espera: 500 }).config.espera).toBe(90);
        expect(normalizarAutomacao('aniversario', { ativa: true, texto: 'oi', hora: 3 }).config.hora).toBe(9);
    });
});

describe('quem recebe o follow-up da coluna', () => {
    const cfg = { horas: 24, maximo: 2 };
    const COL = 'col-1';
    const parada = { status: 'ai_active', lastMessageAt: ha(30), lastInboundAt: ha(31) };

    it('conversa parada na nossa mensagem, além do prazo: recebe', () => {
        expect(motivoParaNaoTocar(parada, cfg, COL, AGORA)).toBeNull();
    });

    it('o cliente falou por último: a equipe é que deve a resposta', () => {
        expect(motivoParaNaoTocar({ ...parada, lastInboundAt: ha(30) }, cfg, COL, AGORA)).toMatch(/cliente/);
    });

    it('encerrada, esperando a equipe, no prazo ou antiga demais: não recebe', () => {
        expect(motivoParaNaoTocar({ ...parada, status: 'closed' }, cfg, COL, AGORA)).toBeTruthy();
        expect(motivoParaNaoTocar({ ...parada, status: 'waiting_human' }, cfg, COL, AGORA)).toBeTruthy();
        expect(motivoParaNaoTocar({ ...parada, lastMessageAt: ha(10) }, cfg, COL, AGORA)).toMatch(/prazo/);
        expect(motivoParaNaoTocar({ ...parada, lastMessageAt: ha(24 * 40), lastInboundAt: ha(24 * 41) }, cfg, COL, AGORA)).toMatch(/tempo/);
    });

    it('conta os toques da coluna; em outra coluna, recomeça', () => {
        const tocada = { ...parada, followupCount: 2, followupColunaId: COL, followupLastAt: ha(26) };
        expect(motivoParaNaoTocar(tocada, cfg, COL, AGORA)).toMatch(/máximo/);
        expect(toquesNaColuna(tocada, 'col-2')).toBe(0);
        expect(motivoParaNaoTocar(tocada, cfg, 'col-2', AGORA)).toBeNull();
    });

    it('o próximo toque espera o prazo desde o último toque', () => {
        const umToque = { ...parada, followupCount: 1, followupColunaId: COL, followupLastAt: ha(5) };
        expect(motivoParaNaoTocar(umToque, cfg, COL, AGORA)).toMatch(/prazo/);
    });

    it('outra mensagem automática há pouco: espera', () => {
        expect(motivoParaNaoTocar({ ...parada, ultimoAutomaticoAt: ha(1) }, cfg, COL, AGORA)).toMatch(/automática/);
    });

    it('o toque anterior da própria coluna não conta como outra automática', () => {
        const curto = { horas: 4, maximo: 3 };
        const toque = new Date(AGORA - 5 * HORA);
        const depoisDoToque = {
            ...parada,
            lastMessageAt: toque,
            followupCount: 1,
            followupColunaId: COL,
            followupLastAt: toque,
            ultimoAutomaticoAt: new Date(toque.getTime() + 2000),
        };
        expect(motivoParaNaoTocar(depoisDoToque, curto, COL, AGORA)).toBeNull();
    });
});

describe('quem recebe o pós-atendimento', () => {
    const DIA = 24 * HORA;
    const atendimento = { closedAt: ha(26), lastInboundAt: ha(27) };

    it('atendimento de verdade, sem pedido recente: recebe', () => {
        expect(motivoParaNaoAvaliar(atendimento, AGORA)).toBeNull();
    });

    it('conversa parada há meses encerrada agora (em lote) não pede avaliação', () => {
        expect(motivoParaNaoAvaliar({ closedAt: ha(3), lastInboundAt: ha(24 * 90) }, AGORA)).toMatch(/7 dias/);
    });

    it('o "obrigado" ao pedido reabre e encerra de novo: não repete em 30 dias', () => {
        // Pedido há 3 dias, o cliente respondeu e a conversa foi encerrada de novo.
        const pedido = new Date(AGORA - 3 * DIA);
        const reaberta = { closedAt: ha(26), lastInboundAt: new Date(pedido.getTime() + HORA) };
        expect(motivoParaNaoAvaliar({ ...reaberta, ultimaAvaliacaoEm: pedido }, AGORA)).toMatch(/30 dias/);
        // Passados os 30 dias, um atendimento novo pede de novo.
        expect(motivoParaNaoAvaliar({ ...atendimento, ultimaAvaliacaoEm: new Date(AGORA - 31 * DIA) }, AGORA)).toBeNull();
    });

    it('quem só respondeu ao aniversário não recebe; quem já conversava, sim', () => {
        const parabens = new Date(AGORA - 2 * DIA);
        const resposta = { closedAt: ha(26), lastInboundAt: new Date(parabens.getTime() + HORA), ultimaAutomacaoEm: parabens };
        expect(motivoParaNaoAvaliar(resposta, AGORA)).toMatch(/automática/);
        // Cliente que escreveu meses antes também: o parabéns é que reabriu.
        expect(motivoParaNaoAvaliar({ ...resposta, clienteAntesDaAutomacaoEm: ha(24 * 60) }, AGORA)).toMatch(/automática/);
        // O cliente estava no meio de uma conversa quando o parabéns saiu.
        expect(motivoParaNaoAvaliar({ ...resposta, clienteAntesDaAutomacaoEm: new Date(parabens.getTime() - HORA) }, AGORA)).toBeNull();
        // Automação antiga, de antes deste atendimento, não conta.
        expect(motivoParaNaoAvaliar({ ...atendimento, ultimaAutomacaoEm: new Date(AGORA - 20 * DIA) }, AGORA)).toBeNull();
    });
});

describe('hora do encerramento na conversa', () => {
    // O gancho é o pre-hook de update do schema; roda-se a função dele sobre a
    // consulta montada (sem banco).
    function rodarGancho(op: string, q: mongoose.Query<unknown, unknown>) {
        const pres = (WaConversation.schema as unknown as { s: { hooks: { _pres: Map<string, Array<{ fn: Function }>> } } }).s
            .hooks._pres.get(op);
        const gancho = pres?.find((p) => p.fn.name === 'marcarEncerramento');
        expect(gancho).toBeTruthy();
        gancho!.fn.call(q);
        return q.getUpdate() as Record<string, any>;
    }
    const id = new mongoose.Types.ObjectId();

    it('quem encerra só grava o status; o closedAt vem junto', () => {
        const u = rodarGancho('updateOne', WaConversation.updateOne({ _id: id }, { status: 'closed', waitingSince: null }));
        expect(u.$set.closedAt).toBeInstanceOf(Date);
        const v = rodarGancho('findOneAndUpdate', WaConversation.findByIdAndUpdate(id, { $set: { status: 'closed' } }));
        expect(v.$set.closedAt).toBeInstanceOf(Date);
    });

    it('reabrir não mexe no closedAt', () => {
        const u = rodarGancho('updateOne', WaConversation.updateOne({ _id: id }, { $set: { status: 'ai_active' } }));
        expect(u.$set.closedAt).toBeUndefined();
    });
});
