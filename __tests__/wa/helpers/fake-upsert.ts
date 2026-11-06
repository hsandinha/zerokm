// FakeModel com o que as iscas precisam a mais: upsert ($setOnInsert),
// índice único (o 11000 que o código trata) e deleteOne. O create devolve
// algo com toObject(), como o documento do mongoose.

import mongoose from 'mongoose';
import { FakeModel, casa } from './fake-model';

type Doc = Record<string, any>;

function chaveDe(d: Doc, campos: string[]): string | null {
    const valores = campos.map((c) => d[c]);
    // Índice esparso: documento sem o campo não entra na unicidade.
    if (campos.length === 1 && (valores[0] === undefined || valores[0] === null)) return null;
    return JSON.stringify(
        valores.map((v) => (v instanceof mongoose.Types.ObjectId ? v.toHexString() : v ?? null)),
    );
}

/** Igualdades simples do filtro: viram campos do documento inserido no upsert. */
function igualdades(filtro: Doc): Doc {
    return Object.fromEntries(
        Object.entries(filtro).filter(
            ([k, v]) =>
                !k.startsWith('$') &&
                (v === null ||
                    typeof v !== 'object' ||
                    v instanceof mongoose.Types.ObjectId ||
                    v instanceof Date ||
                    !Object.keys(v).some((x) => x.startsWith('$'))),
        ),
    );
}

export class FakeComUpsert extends FakeModel {
    constructor(private readonly unicos: Array<string | string[]> = []) {
        super();
    }

    private conferirUnico(novo: Doc, ignorar?: Doc) {
        for (const u of this.unicos) {
            const campos = Array.isArray(u) ? u : [u];
            const chave = chaveDe(novo, campos);
            if (chave === null) continue;
            if (this.docs.some((d) => d !== ignorar && chaveDe(d, campos) === chave)) {
                throw Object.assign(new Error(`E11000 duplicate key (${campos.join(',')})`), { code: 11000 });
            }
        }
    }

    findById(id: unknown) {
        return this.findOne({ _id: id });
    }

    async create(doc: Doc) {
        const d = { _id: new mongoose.Types.ObjectId(), createdAt: new Date(), ...doc };
        this.conferirUnico(d);
        this.docs.push(d);
        const copia = { ...d };
        return { ...copia, toObject: () => ({ ...copia }) };
    }

    async findOneAndUpdate(
        filtro: Doc,
        update: Doc,
        opts: { new?: boolean; upsert?: boolean; sort?: Record<string, 1 | -1> } = {},
    ) {
        const { $setOnInsert, ...resto } = update as { $setOnInsert?: Doc } & Doc;
        const existe = this.docs.find((d) => casa(d, filtro));
        if (existe) return super.findOneAndUpdate(filtro, resto, opts);
        if (!opts.upsert) return null;
        const novo: Doc = {
            _id: new mongoose.Types.ObjectId(),
            ...igualdades(filtro),
            ...($setOnInsert ?? {}),
            ...((resto.$set as Doc | undefined) ?? {}),
        };
        this.conferirUnico(novo);
        this.docs.push(novo);
        return opts.new ? { ...novo } : null;
    }

    async deleteOne(filtro: Doc) {
        const i = this.docs.findIndex((d) => casa(d, filtro));
        if (i < 0) return { deletedCount: 0 };
        this.docs.splice(i, 1);
        return { deletedCount: 1 };
    }
}
