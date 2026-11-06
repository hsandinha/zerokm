// Coleção falsa em memória com o pedaço da API do mongoose que a fila e a
// atribuição de campanha usam. Este ambiente não tem mongod (o
// mongodb-memory-server não baixa), e a regra que importa testar é o filtro
// de cada update: quem casa, quem não casa, quantas vezes conta.
//
// Suporta: igualdade (ObjectId/Date/string comparados pelo valor), null casa
// com ausente, $in, $nin, $ne, $gt, $gte, $lt, $lte, $exists, $or, $and; e
// nos updates $set, $inc, $unset, $currentDate (ou objeto puro = $set).

import mongoose from 'mongoose';

type Doc = Record<string, any>;

function norm(v: unknown): unknown {
    if (v instanceof mongoose.Types.ObjectId) return v.toHexString();
    if (v instanceof Date) return v.getTime();
    return v;
}

function igual(a: unknown, b: unknown): boolean {
    if (b === null) return a === null || a === undefined;
    if (Array.isArray(a)) return a.some((x) => igual(x, b));
    return norm(a) === norm(b);
}

function cmp(a: unknown, b: unknown): number | null {
    if (a === undefined || a === null) return null;
    const x = norm(a) as any;
    const y = norm(b) as any;
    return x < y ? -1 : x > y ? 1 : 0;
}

function casaCampo(valor: unknown, cond: unknown): boolean {
    if (
        cond &&
        typeof cond === 'object' &&
        !(cond instanceof Date) &&
        !(cond instanceof mongoose.Types.ObjectId) &&
        !Array.isArray(cond) &&
        Object.keys(cond).some((k) => k.startsWith('$'))
    ) {
        return Object.entries(cond as Record<string, unknown>).every(([op, arg]) => {
            switch (op) {
                case '$in':
                    return (arg as unknown[]).some((x) => igual(valor, x));
                case '$nin':
                    return !(arg as unknown[]).some((x) => igual(valor, x));
                case '$ne':
                    return !igual(valor, arg);
                case '$gt': {
                    const c = cmp(valor, arg);
                    return c !== null && c > 0;
                }
                case '$gte': {
                    const c = cmp(valor, arg);
                    return c !== null && c >= 0;
                }
                case '$lt': {
                    const c = cmp(valor, arg);
                    return c !== null && c < 0;
                }
                case '$lte': {
                    const c = cmp(valor, arg);
                    return c !== null && c <= 0;
                }
                case '$exists':
                    return (valor !== undefined) === Boolean(arg);
                case '$regex':
                    return typeof valor === 'string' && new RegExp(arg as RegExp | string).test(valor);
                default:
                    throw new Error(`operador não suportado no fake: ${op}`);
            }
        });
    }
    return igual(valor, cond);
}

export function casa(doc: Doc, filtro: Record<string, unknown>): boolean {
    return Object.entries(filtro).every(([k, cond]) => {
        if (k === '$or') return (cond as Doc[]).some((f) => casa(doc, f));
        if (k === '$and') return (cond as Doc[]).every((f) => casa(doc, f));
        return casaCampo(doc[k], cond);
    });
}

function aplicar(doc: Doc, update: Record<string, any>): void {
    const ops = Object.keys(update).some((k) => k.startsWith('$')) ? update : { $set: update };
    for (const [op, campos] of Object.entries(ops)) {
        for (const [k, v] of Object.entries(campos as Doc)) {
            if (op === '$set') doc[k] = v;
            else if (op === '$inc') doc[k] = (doc[k] ?? 0) + (v as number);
            else if (op === '$unset') delete doc[k];
            else if (op === '$currentDate') doc[k] = new Date();
            else throw new Error(`update não suportado no fake: ${op}`);
        }
    }
}

function ordenar(docs: Doc[], sort?: Record<string, 1 | -1>): Doc[] {
    if (!sort) return docs;
    return [...docs].sort((a, b) => {
        for (const [k, dir] of Object.entries(sort)) {
            const c = cmp(a[k], b[k]) ?? (a[k] == null ? (b[k] == null ? 0 : -1) : 1);
            if (c !== 0) return c * dir;
        }
        return 0;
    });
}

/** Consulta encadeável (sort/limit/select/lean) que resolve como Promise. */
class Consulta<T> implements PromiseLike<T> {
    private _sort?: Record<string, 1 | -1>;
    private _limit?: number;
    constructor(private readonly rodar: (sort?: Record<string, 1 | -1>, limit?: number) => T) {}
    sort(s: Record<string, 1 | -1>) {
        this._sort = s;
        return this;
    }
    limit(n: number) {
        this._limit = n;
        return this;
    }
    select() {
        return this;
    }
    lean() {
        return this;
    }
    distinct(campo: string) {
        return Promise.resolve(
            ((this.rodar(this._sort, this._limit) as unknown as Doc[]) ?? []).map((d) => d[campo]),
        );
    }
    then<A = T, B = never>(ok?: ((v: T) => A | PromiseLike<A>) | null, erro?: ((e: unknown) => B | PromiseLike<B>) | null) {
        return Promise.resolve()
            .then(() => this.rodar(this._sort, this._limit))
            .then(ok, erro);
    }
}

export class FakeModel {
    docs: Doc[] = [];

    reset(docs: Doc[] = []) {
        this.docs = docs.map((d) => ({ _id: new mongoose.Types.ObjectId(), ...d }));
        return this.docs;
    }

    byId(id: unknown): Doc | undefined {
        return this.docs.find((d) => igual(d._id, id));
    }

    find(filtro: Doc = {}) {
        return new Consulta((sort, limit) => {
            const achados = ordenar(this.docs.filter((d) => casa(d, filtro)), sort);
            return (limit ? achados.slice(0, limit) : achados).map((d) => ({ ...d }));
        });
    }

    findOne(filtro: Doc = {}) {
        return new Consulta((sort) => {
            const d = ordenar(this.docs.filter((x) => casa(x, filtro)), sort)[0];
            return d ? { ...d } : null;
        });
    }

    async findOneAndUpdate(filtro: Doc, update: Doc, opts: { new?: boolean; sort?: Record<string, 1 | -1> } = {}) {
        const d = ordenar(this.docs.filter((x) => casa(x, filtro)), opts.sort)[0];
        if (!d) return null;
        const antes = { ...d };
        aplicar(d, update);
        return opts.new ? { ...d } : antes;
    }

    async updateOne(filtro: Doc, update: Doc) {
        const d = this.docs.find((x) => casa(x, filtro));
        if (!d) return { matchedCount: 0, modifiedCount: 0 };
        aplicar(d, update);
        return { matchedCount: 1, modifiedCount: 1 };
    }

    async updateMany(filtro: Doc, update: Doc) {
        const alvo = this.docs.filter((x) => casa(x, filtro));
        alvo.forEach((d) => aplicar(d, update));
        return { matchedCount: alvo.length, modifiedCount: alvo.length };
    }

    async exists(filtro: Doc) {
        const d = this.docs.find((x) => casa(x, filtro));
        return d ? { _id: d._id } : null;
    }

    async countDocuments(filtro: Doc = {}) {
        return this.docs.filter((x) => casa(x, filtro)).length;
    }

    async create(doc: Doc) {
        const d = { _id: new mongoose.Types.ObjectId(), ...doc };
        this.docs.push(d);
        return { ...d };
    }

    async insertMany(docs: Doc[]) {
        const novos = docs.map((d) => ({ _id: new mongoose.Types.ObjectId(), ...d }));
        this.docs.push(...novos);
        return novos;
    }

    async deleteMany(filtro: Doc) {
        const antes = this.docs.length;
        this.docs = this.docs.filter((x) => !casa(x, filtro));
        return { deletedCount: antes - this.docs.length };
    }
}
