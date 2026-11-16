/**
 * Modelo mongoose de mentira, em memória, para testar serviços e rotas sem
 * banco (o MongoMemoryServer não baixa em todo ambiente). Cobre só o que as
 * regras de cobrança usam: igualdade, $exists, $ne, $gt, $in, caminhos com
 * ponto, $set, $unset, $setOnInsert e upsert.
 */
type Doc = Record<string, any>;

export const colecoes: Record<string, Doc[]> = {};

let seq = 0;
export const novoId = () => (++seq).toString(16).padStart(24, 'a');

const ler = (doc: Doc, caminho: string) => caminho.split('.').reduce<any>((v, k) => (v == null ? undefined : v[k]), doc);
function gravar(doc: Doc, caminho: string, valor: unknown) {
    const partes = caminho.split('.');
    let alvo = doc;
    for (const k of partes.slice(0, -1)) alvo = alvo[k] ??= {};
    alvo[partes[partes.length - 1]] = valor;
}
function apagar(doc: Doc, caminho: string) {
    const partes = caminho.split('.');
    const pai = partes.slice(0, -1).reduce<any>((v, k) => (v == null ? undefined : v[k]), doc);
    if (pai) delete pai[partes[partes.length - 1]];
}

const igual = (a: unknown, b: unknown) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : String(a) === String(b));

function casa(doc: Doc, filtro: Doc = {}): boolean {
    return Object.entries(filtro).every(([campo, cond]) => {
        if (campo === '$or') return (cond as Doc[]).some(f => casa(doc, f));
        const valor = ler(doc, campo);
        if (cond && typeof cond === 'object' && !(cond instanceof Date) && Object.keys(cond).some(k => k.startsWith('$'))) {
            return Object.entries(cond).every(([op, alvo]: [string, any]) => {
                if (op === '$exists') return (valor !== undefined) === alvo;
                if (op === '$ne') return alvo === null ? valor != null : !igual(valor, alvo);
                if (op === '$gt') return valor != null && new Date(valor).getTime() > new Date(alvo).getTime();
                if (op === '$in') return (alvo as unknown[]).some(a => igual(valor, a));
                throw new Error(`fakeModel: operador ${op} não suportado`);
            });
        }
        return valor !== undefined && valor !== null && igual(valor, cond);
    });
}

function aplicar(doc: Doc, update: Doc, inserindo: boolean) {
    for (const [k, v] of Object.entries(update.$set || {})) if (v !== undefined) gravar(doc, k, v);
    for (const k of Object.keys(update.$unset || {})) apagar(doc, k);
    if (inserindo) for (const [k, v] of Object.entries(update.$setOnInsert || {})) gravar(doc, k, v);
}

/** Query encadeável (.select().lean().sort().limit()) que resolve no resultado. */
function consulta<T>(resultado: T) {
    const q: any = { then: (ok: any, erro: any) => Promise.resolve(resultado).then(ok, erro), catch: (erro: any) => Promise.resolve(resultado).catch(erro) };
    for (const m of ['select', 'lean', 'sort', 'limit']) q[m] = () => q;
    return q;
}

export function fakeModel(nome: string) {
    const docs = () => (colecoes[nome] ??= []);
    // Cópia com save(), como um documento do mongoose: grava de volta na coleção.
    const copia = (d: Doc | undefined | null) => {
        if (!d) return null;
        const c: Doc = { ...d };
        Object.defineProperty(c, 'save', { enumerable: false, value: async () => { Object.assign(d, c); return c; } });
        return c;
    };
    return {
        find: (filtro: Doc = {}) => consulta(docs().filter(d => casa(d, filtro)).map(d => ({ ...d }))),
        findOne: (filtro: Doc = {}) => consulta(copia(docs().find(d => casa(d, filtro)))),
        findById: (id: unknown) => consulta(copia(docs().find(d => igual(d._id, id)))),
        create: async (dados: Doc) => {
            const doc = { _id: novoId(), createdAt: new Date(), ...dados };
            docs().push(doc);
            return { ...doc };
        },
        findOneAndUpdate: (filtro: Doc, update: Doc, opcoes: Doc = {}) => {
            let doc = docs().find(d => casa(d, filtro));
            const antes = copia(doc);
            if (!doc && opcoes.upsert) {
                doc = { _id: novoId(), createdAt: new Date() };
                for (const [k, v] of Object.entries(filtro)) if (!k.startsWith('$') && (typeof v !== 'object' || v === null)) gravar(doc, k, v);
                aplicar(doc, update, true);
                docs().push(doc);
                return consulta({ ...doc });
            }
            if (!doc) return consulta(null);
            aplicar(doc, update, false);
            return consulta(opcoes.returnDocument === 'after' || opcoes.new ? { ...doc } : antes);
        },
        findByIdAndUpdate: (id: unknown, update: Doc) => {
            const doc = docs().find(d => igual(d._id, id));
            if (doc) aplicar(doc, update, false);
            return consulta(copia(doc));
        },
        updateOne: async (filtro: Doc, update: Doc) => {
            const doc = docs().find(d => casa(d, filtro));
            if (doc) aplicar(doc, update, false);
            return { matchedCount: doc ? 1 : 0 };
        },
        deleteOne: async (filtro: Doc) => {
            const i = docs().findIndex(d => casa(d, filtro));
            if (i >= 0) docs().splice(i, 1);
            return { deletedCount: i >= 0 ? 1 : 0 };
        },
    };
}

export function limparColecoes() {
    for (const k of Object.keys(colecoes)) delete colecoes[k];
}
