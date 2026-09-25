// @vitest-environment node
//
// "Criar banner" a partir da consulta de veículos, de ponta a ponta: o payload
// montado pelo `bannerDoVeiculo` passando pela rota real de criação.
//
// O teste existe porque a alternativa era conferir em produção — e um banner
// criado para testar fica 24 horas visível para todos os lojistas.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const { session } = vi.hoisted(() => ({ session: { current: null as any } }));

vi.mock('next-auth', () => ({ getServerSession: async () => session.current }));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));

import { GET as listarBanners, POST as criarBanner } from '@/app/api/admin/banners/route';
import Banner from '@/models/Banner';
import { bannerDoVeiculo } from '@/lib/utils/bannerDoVeiculo';

const ADMIN = { user: { email: 'admin@cnv.com.br', profile: 'administrador' } };

const VEICULO = {
    id: 'veiculo-1',
    modelo: 'Kwid Zen Mec.',
    ano: '26/26',
    cor: 'Branco Glacier',
    combustivel: 'Flex',
    status: 'A faturar',
    prazo: 0,
    concessionaria: 'Grupo Rizzo',
    telefone: '(11) 97580-0804',
    imagemUrl: 'https://cdn.cnv/kwid.jpg',
};

let srv: MongoMemoryServer;

const post = (body: any) =>
    criarBanner(new Request('http://localhost/api/admin/banners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    }));

beforeAll(async () => {
    srv = await MongoMemoryServer.create();
    await mongoose.connect(srv.getUri());
}, 60_000);

afterAll(async () => {
    await mongoose.disconnect();
    await srv.stop();
});

beforeEach(async () => {
    session.current = ADMIN;
    await Banner.deleteMany({});
});

describe('criar banner a partir de um veículo', () => {
    it('grava o anúncio e o coloca no ar', async () => {
        const res = await post(bannerDoVeiculo(VEICULO, 65990));
        expect(res.status).toBe(200);

        const gravado = await Banner.findOne({ vehicleId: 'veiculo-1' }).lean() as any;
        expect(gravado.title).toBe('KWID ZEN MEC.');
        expect(gravado.vehicleModel).toBe('KWID ZEN MEC.');
        expect(gravado.storeName).toBe('GRUPO RIZZO');
        expect(gravado.imageUrl).toBe('https://cdn.cnv/kwid.jpg');
        expect(gravado.linkUrl).toBe('https://wa.me/5511975800804');
        expect(gravado.badge).toBe('OPORTUNIDADE');
        expect(gravado.delivery).toBe('PRONTA ENTREGA');
        expect(gravado.statusCondition).toBe('A FATURAR');
        expect(gravado.isActive).toBe(true);
        expect(gravado.status).toBe('active');
    });

    it('sai do ar em 24 horas', async () => {
        const antes = Date.now();
        await post(bannerDoVeiculo(VEICULO, 65990));

        const gravado = await Banner.findOne({ vehicleId: 'veiculo-1' }).lean() as any;
        const horas = (new Date(gravado.expiresAt).getTime() - antes) / 3_600_000;
        expect(horas).toBeGreaterThan(23.9);
        expect(horas).toBeLessThan(24.1);
    });

    it('aparece no filtro por modelo da tela de Banners', async () => {
        // É por isso que `title` sai igual ao modelo: o filtro procura nos dois
        // campos, e um banner automático tem que ser achável como os manuais.
        await post(bannerDoVeiculo(VEICULO, 65990));

        const res = await listarBanners(new Request(
            'http://localhost/api/admin/banners?page=1&limit=10&status=all&model=KWID%20ZEN%20MEC.'
        ));
        const body = await res.json();

        expect(body.totalCount).toBe(1);
        expect(body.models).toContain('KWID ZEN MEC.');
    });

    it('dois veículos do mesmo modelo viram dois anúncios, sem sobrescrever', async () => {
        await post(bannerDoVeiculo(VEICULO, 65990));
        await post(bannerDoVeiculo({ ...VEICULO, id: 'veiculo-2', cor: 'Prata Etoile' }, 67000));

        const todos = await Banner.find({}).sort({ order: 1 }).lean() as any[];
        expect(todos).toHaveLength(2);
        expect(todos.map(b => b.color)).toEqual(['BRANCO GLACIER', 'PRATA ETOILE']);
        // Ordens distintas: senão o carrossel ficaria com empate de posição.
        expect(todos[0].order).not.toBe(todos[1].order);
    });

    it('perfil sem permissão não cria anúncio', async () => {
        session.current = { user: { email: 'lojista@x.com', profile: 'cliente' } };

        const res = await post(bannerDoVeiculo(VEICULO, 65990));

        expect(res.status).toBe(401);
        expect(await Banner.countDocuments({})).toBe(0);
    });
});
