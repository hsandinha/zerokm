// Telas da operação da equipe: a seção de horário e distribuição da
// Configuração e a página de Resultados renderizam com o que a API devolve
// (fetch falso), e a seção recusa faixa com o fim antes do início.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OperacaoDaLoja } from '@wa/components/operacao-config';
import { Resultados } from '@wa/components/resultados';
import { horarioPadrao, MENSAGEM_FORA_PADRAO } from '@wa/lib/horario';

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

function responder(corpo: unknown) {
    const fn = vi.fn(async () => ({ ok: true, json: async () => corpo }));
    vi.stubGlobal('fetch', fn);
    return fn;
}

describe('OperacaoDaLoja', () => {
    it('mostra a semana e recusa salvar faixa invertida', async () => {
        const fetch = responder({
            horario: { ...horarioPadrao(), ativo: true },
            distribuicao: 'rodizio',
            slaMinutos: 15,
            defaults: { mensagem: MENSAGEM_FORA_PADRAO, intervaloHoras: 12, slaMinutos: 15, slaMin: 1, slaMax: 1440 },
        });
        render(<OperacaoDaLoja />);
        expect(await screen.findByText('Horário de atendimento')).toBeInTheDocument();
        expect(screen.getAllByText(/Seg a Sex 8h às 18h, Sáb 8h às 13h, Dom fechado/).length).toBeGreaterThan(0);

        fireEvent.change(screen.getByLabelText('Segunda-feira: abre'), { target: { value: '19:00' } });
        expect(screen.getAllByText(/Segunda-feira: o fim/).length).toBeGreaterThan(0);
        fireEvent.click(screen.getByText('Salvar horário e distribuição'));
        // Só o GET inicial: o PUT não sai com erro na tela.
        expect(fetch).toHaveBeenCalledTimes(1);
    });
});

describe('Resultados', () => {
    it('renderiza números e desempenho do gestor', async () => {
        const tempo = { mediana: 42, media: 50, n: 3 };
        responder({
            gestor: true,
            resultados: {
                periodo: { id: '7d', rotulo: 'Últimos 7 dias', de: new Date().toISOString(), ate: new Date().toISOString() },
                agora: {
                    fila: 3,
                    semResponsavel: 1,
                    slaViolado: 2,
                    comEquipe: 4,
                    comIa: 9,
                    aguardandoAbertura: 0,
                    slaMinutos: 15,
                    horario: { ativo: true, aberto: false, quandoVolta: 'amanhã a partir das 8h' },
                },
                conversas: { hoje: 5, semana: 30, mes: 80, periodo: 30 },
                leadsNovos: 12,
                visitasPedidas: 4,
                transferencias: 7,
                vendas: 2,
                resposta: { ia: tempo, equipe: { ...tempo, semResposta: 1 } },
                mensagensMes: { total: 100, ia: 60, equipe: 30, automaticas: 5, campanhas: 5 },
                campanhasMes: { total: 1, enviadas: 50, entregues: 48, lidas: 30, respondidas: 10 },
                porCanal: [{ canal: 'whatsapp', rotulo: 'WhatsApp', conversas: 30, leads: 12, vendas: 2 }],
            },
            desempenho: {
                comAutor: false,
                pessoas: [
                    {
                        email: 'ana@loja.com',
                        nome: 'Ana',
                        papel: 'atendente',
                        status: 'online',
                        statusDesde: new Date().toISOString(),
                        pausaMotivo: null,
                        assumidas: 6,
                        resolvidas: 3,
                        vendas: 1,
                        respostaMedia: 120,
                        respostaN: 6,
                        mensagens: null,
                        agora: [{ conversationId: 'c1', cliente: 'Marina', status: 'waiting_human', desde: new Date().toISOString(), espera: true }],
                    },
                ],
            },
        });
        render(<Resultados />);
        expect(await screen.findByText('Na fila da equipe')).toBeInTheDocument();
        expect(screen.getByText(/a equipe volta amanhã a partir das 8h/)).toBeInTheDocument();
        expect(screen.getByText('Marina')).toBeInTheDocument();
        expect(screen.getAllByText('Ana').length).toBeGreaterThan(0);
        await waitFor(() => expect(screen.getAllByText('42 s')).toHaveLength(2));
        // Sem autor gravado nas mensagens, a coluna de mensagens não aparece.
        expect(screen.queryByText('Mensagens')).not.toBeInTheDocument();
    });
});
