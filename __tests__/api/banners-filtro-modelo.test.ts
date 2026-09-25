// @vitest-environment node
//
// Filtro por modelo do veículo na listagem de banners do administrador.
//
// O caso que justifica o teste: banner comprado pela concessionária no
// checkout grava só `title` — `vehicleModel` fica vazio. Um filtro que olhasse
// apenas `vehicleModel` deixaria invisíveis justamente os anúncios em
// "Aprovação" e "Aguardando pagamento", que são os que o administrador
// precisa achar. Hoje nenhum banner em produção está nessa situação, então o
// caminho só é exercitado aqui.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

const { session } = vi.hoisted(() => ({ session: { current: null as any } }));

vi.mock('next-auth', () => ({ getServerSession: async () => session.current }));
vi.mock('@/lib/authOptions', () => ({ authOptions: {} }));
vi.mock('@/lib/mongodb', () => ({ default: async () => undefined }));

import { GET as listarBanners } from '@/app/api/admin/banners/route';
import Banner from '@/models/Banner';

const ADMIN = { user: { email: 'admin@cnv.com.br', profile: 'administrador' } };

let srv: MongoMemoryServer;

const listar = async (query: string) => {
    const res = await listarBanners(new Request(`http://localhost/api/admin/banners?${query}`));
    return { status: res.status, body: await res.json() };
};

const titulos = (body: any) => (body.banners as any[]).map(b => b.title).sort();

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
    await Banner.create([
        // Criados pelo administrador: têm `vehicleModel`.
        { title: 'TORO VOLCANO DIESEL', vehicleModel: 'TORO VOLCANO DIESEL', imageUrl: 'x', isActive: true, status: 'active' },
        { title: 'TORO VOLCANO DIESEL', vehicleModel: 'TORO VOLCANO DIESEL', imageUrl: 'x', isActive: false, status: 'active' },
        { title: 'MOBI LIKE', vehicleModel: 'MOBI LIKE', imageUrl: 'x', isActive: true, status: 'active' },
        // Comprado no checkout da concessionária: só `title`.
        { title: 'RANGER XLT', imageUrl: 'x', isActive: false, status: 'awaiting_payment' },
        // Enviado para aprovação, também sem `vehicleModel`.
        { title: 'MOBI LIKE', imageUrl: 'x', isActive: false, status: 'pending' },
    ]);
});

describe('GET /api/admin/banners — filtro por modelo', () => {
    it('sem filtro, devolve todos e lista os modelos disponíveis', async () => {
        const { status, body } = await listar('page=1&limit=10&status=all');

        expect(status).toBe(200);
        expect(body.totalCount).toBe(5);
        // Os modelos saem ordenados e sem repetição, e incluem o banner que
        // só tem `title` — senão ele não teria como ser escolhido no seletor.
        expect(body.models).toEqual(['MOBI LIKE', 'RANGER XLT', 'TORO VOLCANO DIESEL']);
    });

    it('filtra pelos banners que têm o modelo em vehicleModel', async () => {
        const { body } = await listar('page=1&limit=10&status=all&model=TORO%20VOLCANO%20DIESEL');

        expect(body.totalCount).toBe(2);
        expect(titulos(body)).toEqual(['TORO VOLCANO DIESEL', 'TORO VOLCANO DIESEL']);
    });

    it('acha o banner da concessionária, que só tem o modelo no título', async () => {
        const { body } = await listar('page=1&limit=10&status=all&model=RANGER%20XLT');

        expect(body.totalCount).toBe(1);
        expect(body.banners[0].title).toBe('RANGER XLT');
        expect(body.banners[0].vehicleModel).toBeUndefined();
    });

    it('junta os dois casos quando o mesmo modelo aparece das duas formas', async () => {
        const { body } = await listar('page=1&limit=10&status=all&model=MOBI%20LIKE');

        // Um com vehicleModel preenchido, outro só com title.
        expect(body.totalCount).toBe(2);
        expect(body.banners.map((b: any) => b.status).sort()).toEqual(['active', 'pending']);
    });

    it('combina modelo e situação em vez de um substituir o outro', async () => {
        const { body } = await listar('page=1&limit=10&status=pending&model=MOBI%20LIKE');

        expect(body.totalCount).toBe(1);
        expect(body.banners[0].status).toBe('pending');
    });

    it('modelo sem banner devolve lista vazia, não erro', async () => {
        const { status, body } = await listar('page=1&limit=10&status=all&model=NAO%20EXISTE');

        expect(status).toBe(200);
        expect(body.totalCount).toBe(0);
        expect(body.banners).toEqual([]);
        // O seletor continua com todas as opções, para dar caminho de volta.
        expect(body.models).toHaveLength(3);
    });

    it('a paginação conta só os banners do modelo escolhido', async () => {
        const { body } = await listar('page=1&limit=1&status=all&model=TORO%20VOLCANO%20DIESEL');

        expect(body.totalCount).toBe(2);
        expect(body.totalPages).toBe(2);
        expect(body.banners).toHaveLength(1);
    });

    it('continua exigindo sessão de administrador', async () => {
        session.current = { user: { email: 'lojista@x.com', profile: 'cliente' } };
        const { status } = await listar('page=1&limit=10&status=all&model=MOBI%20LIKE');

        expect(status).toBe(401);
    });
});
