// @vitest-environment node
// Estoque do pátio (ficha, situação, cartão, painel, fotos), as ferramentas
// novas da IA da loja, o recurso "agenda" e as tarefas da equipe.
import { describe, expect, it } from 'vitest';
import {
    FILTRO_OFERECIVEL,
    anoDoFormulario,
    cartaoDoCarro,
    painelDoEstoque,
    situacaoDe,
    validarFichaLocal,
    type CarroDoPainel,
} from '@wa/lib/estoque-ficha';
import { medidasReduzidas } from '@wa/lib/foto-no-navegador';
import { assinaturaDaFotoConfere, bytesDaFoto, linkDaFotoEstoque, mimeDaFoto } from '@wa/lib/foto-estoque';
import mongoose from 'mongoose';
import { ofertasParaIa, type Oferta } from '@wa/lib/estoque';
import { toolsDaLoja } from '@wa/lib/ai-loja';
import { lerRecursos } from '@/lib/recursos';
import { filtroDasTarefas, tarefaAtrasada, validarTarefa } from '@wa/lib/tarefas';
import { parseAno } from '@/lib/utils/repasse';

describe('ficha do pátio', () => {
    it('valida placa, portas, sim/não e situação', () => {
        const ok = validarFichaLocal({ placaInterna: 'abc-1d23', portas: '4', unicoDono: 'sim', aceitaTroca: false, situacao: 'reservado', versao: 'ltz 1.0' });
        expect(ok.errors).toEqual([]);
        expect(ok.data).toMatchObject({ placaInterna: 'ABC1D23', portas: 4, unicoDono: true, aceitaTroca: false, situacao: 'reservado', versao: 'LTZ 1.0' });
        const ruim = validarFichaLocal({ placaInterna: 'XYZ', portas: '9', situacao: 'sumiu' });
        expect(ruim.errors).toHaveLength(3);
    });

    it('na edição, só o que veio; vazio apaga', () => {
        const r = validarFichaLocal({ placaInterna: '' }, true);
        expect(r.errors).toEqual([]);
        expect(Object.keys(r.data)).toEqual(['placaInterna']);
        expect(r.data.placaInterna).toBeUndefined();
    });

    it('carro sem situação (antigo) é disponível; o filtro da IA deixa ele passar', () => {
        expect(situacaoDe({})).toBe('disponivel');
        expect(situacaoDe({ situacao: 'vendido' })).toBe('vendido');
        expect(FILTRO_OFERECIVEL.situacao.$nin).toEqual(['reservado', 'vendido', 'pausado']);
    });

    it('os dois anos do formulário viram o ano do repasse', () => {
        expect(parseAno(anoDoFormulario('2021', '2022'))).toMatchObject({ ano: '21/22', anoFabricacao: 2021, anoModelo: 2022 });
        expect(anoDoFormulario('', '2022')).toBe('2022');
        expect(anoDoFormulario('2022', '2022')).toBe('2022');
    });
});

const local: Oferta = {
    ref: 'L1A2B3C',
    origem: 'local',
    titulo: 'CHEVROLET ONIX LTZ',
    ano: '21/22',
    km: 35000,
    cores: ['PRATA'],
    combustivel: 'Flex',
    cambio: 'Automático',
    preco: 79900,
    prazoDias: null,
    opcionais: 'Ar, multimídia',
    observacoes: null,
    fotoIds: ['a', 'b', 'c', 'd'],
    portas: 4,
    unicoDono: true,
    aceitaTroca: true,
};

describe('cartão do carro', () => {
    it('do pátio leva a ficha inteira', () => {
        const c = cartaoDoCarro(local);
        expect(c).toContain('*CHEVROLET ONIX LTZ 21/22*');
        expect(c).toContain('35.000 km · Automático · Flex');
        expect(c).toContain('4 portas');
        expect(c).toContain('Único dono · Aceita troca');
        expect(c).toContain('Opcionais: Ar, multimídia');
        expect(c).toMatch(/R\$\s?79\.900/);
    });

    it('0km continua com o resumo de sempre', () => {
        const c = cartaoDoCarro({ ...local, origem: '0km', km: 0, prazoDias: 20, unicoDono: true });
        expect(c).toContain('0 km');
        expect(c).toContain('Entrega em cerca de 20 dias');
        expect(c).not.toContain('Único dono');
        expect(c).not.toContain('Opcionais');
    });

    it('a IA vê fotos, único dono e aceita troca do carro do pátio', () => {
        const t = ofertasParaIa([local]);
        expect(t).toContain('[L1A2B3C]');
        expect(t).toContain('4 fotos');
        expect(t).toContain('único dono');
        expect(t).toContain('aceita troca');
    });
});

describe('painel do estoque', () => {
    const agora = new Date('2026-11-06T12:00:00Z');
    const dias = (n: number) => new Date(agora.getTime() - n * 86_400_000);
    const carros: CarroDoPainel[] = [
        { id: '1', titulo: 'Onix', marca: 'CHEVROLET', preco: 80000, situacao: 'disponivel', fotos: 3, createdAt: dias(10) },
        { id: '2', titulo: 'Tracker', marca: 'chevrolet', preco: 120000, situacao: 'disponivel', fotos: 0, createdAt: dias(90) },
        { id: '3', titulo: 'HB20', marca: 'HYUNDAI', preco: 70000, situacao: 'reservado', fotos: 0, createdAt: dias(100) },
        { id: '4', titulo: 'Gol', marca: 'VW', preco: 40000, situacao: 'vendido', fotos: 1, createdAt: dias(200) },
    ];
    it('capital parado é só dos disponíveis; marcas juntam grafias', () => {
        const p = painelDoEstoque(carros, agora);
        expect(p.quantidade).toBe(2);
        expect(p.capital).toBe(200000);
        expect(p.porMarca).toEqual([{ marca: 'Chevrolet', quantidade: 2, capital: 200000 }]);
        expect(p.reservados).toBe(1);
    });
    it('mais de 60 dias e sem foto, entre os disponíveis', () => {
        const p = painelDoEstoque(carros, agora);
        expect(p.parados.lista.map(l => l.id)).toEqual(['2']);
        expect(p.parados.capital).toBe(120000);
        expect(p.semFoto.lista.map(l => l.id)).toEqual(['2']);
    });
});

describe('fotos do pátio', () => {
    it('reduz mantendo a proporção, sem aumentar foto pequena', () => {
        expect(medidasReduzidas(4000, 3000)).toEqual({ width: 1600, height: 1200 });
        expect(medidasReduzidas(1200, 2400)).toEqual({ width: 800, height: 1600 });
        expect(medidasReduzidas(800, 600)).toEqual({ width: 800, height: 600 });
    });

    it('confere o tipo pelos bytes', () => {
        expect(mimeDaFoto(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image/jpeg');
        expect(mimeDaFoto(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
        expect(mimeDaFoto(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    });

    it('lê os bytes do Buffer e do Binary que o lean devolve', () => {
        expect([...bytesDaFoto(Buffer.from([1, 2, 3]))]).toEqual([1, 2, 3]);
        expect([...bytesDaFoto(new mongoose.mongo.Binary(Buffer.from([4, 5])))]).toEqual([4, 5]);
        expect(bytesDaFoto(null).length).toBe(0);
    });

    it('link assinado: vale para o id dele, não para outro', () => {
        process.env.APP_ENCRYPTION_KEY ||= 'chave-de-teste';
        const link = linkDaFotoEstoque('https://loja.exemplo', 'abc123');
        expect(link).toMatch(/^https:\/\/loja\.exemplo\/api\/wa\/loja\/estoque\/foto\/abc123\?t=/);
        const t = new URL(link).searchParams.get('t');
        expect(assinaturaDaFotoConfere('abc123', t)).toBe(true);
        expect(assinaturaDaFotoConfere('abc124', t)).toBe(false);
        expect(linkDaFotoEstoque('', 'abc123')).toMatch(/^\/api\/wa\/loja\/estoque\/foto\/abc123\?t=/);
    });
});

describe('ferramentas novas da IA da loja', () => {
    const loja = { financiamento: { ativo: false } } as never;
    it('sem as opções, nada muda', () => {
        const nomes = toolsDaLoja(loja).map(t => t.name);
        expect(nomes).not.toContain('enviar_fotos');
        expect(nomes).not.toContain('horarios_livres');
        expect(nomes).toContain('agendar_visita');
    });
    it('fotos e horários livres só quando liberados', () => {
        const nomes = toolsDaLoja(loja, { fotos: true, agenda: true, horarios: true }).map(t => t.name);
        expect(nomes).toContain('enviar_fotos');
        expect(nomes).toContain('horarios_livres');
        const semHorario = toolsDaLoja(loja, { fotos: false, agenda: true, horarios: false }).map(t => t.name);
        expect(semHorario).not.toContain('horarios_livres');
    });
});

describe('recurso agenda', () => {
    it('ligado por padrão para quem tem atendimento; sem atendimento, desligado', () => {
        expect(lerRecursos({ atendimento: true }, 'lojista').agenda).toBe(true);
        expect(lerRecursos({ atendimento: true }, 'concessionaria').agenda).toBe(true);
        expect(lerRecursos({}, 'lojista').agenda).toBe(false);
        expect(lerRecursos({ atendimento: true, agenda: false }, 'lojista').agenda).toBe(false);
    });
});

describe('tarefas da equipe', () => {
    const agora = new Date('2026-11-06T15:00:00Z');
    it('filtros das abas', () => {
        expect(filtroDasTarefas('minhas', 'Ana@Loja.com', agora)).toEqual({ feita: false, responsavel: 'ana@loja.com' });
        expect(filtroDasTarefas('atrasadas', 'x@y', agora)).toEqual({ feita: false, prazo: { $lt: agora } });
        expect(filtroDasTarefas('feitas', 'x@y', agora)).toEqual({ feita: true });
        expect(filtroDasTarefas('abertas', 'x@y', agora)).toEqual({ feita: false });
    });
    it('prazo sem fuso é Brasília; só o dia vira 18h', () => {
        expect(validarTarefa({ titulo: 'Ligar', prazo: '2026-11-07T10:00' }).data.prazo?.toISOString()).toBe('2026-11-07T13:00:00.000Z');
        expect(validarTarefa({ titulo: 'Ligar', prazo: '2026-11-07' }).data.prazo?.toISOString()).toBe('2026-11-07T21:00:00.000Z');
        expect(validarTarefa({ titulo: '' }).errors).toEqual(['Escreva o que precisa ser feito.']);
    });
    it('atrasada é aberta com prazo vencido', () => {
        expect(tarefaAtrasada({ feita: false, prazo: new Date('2026-11-06T14:00:00Z') }, agora)).toBe(true);
        expect(tarefaAtrasada({ feita: true, prazo: new Date('2026-11-06T14:00:00Z') }, agora)).toBe(false);
        expect(tarefaAtrasada({ feita: false, prazo: null }, agora)).toBe(false);
    });
});
