const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const texto = (value: string | null) => (value || '').trim();

/**
 * Filtro da lista do Catálogo (busca, marca, tipo, ativas). A lista e a
 * exportação usam o mesmo filtro, para o arquivo trazer o que está na tela.
 */
export function filtroDoCatalogo(searchParams: URLSearchParams) {
    const search = texto(searchParams.get('search'));
    const marca = texto(searchParams.get('marca'));
    const marcaId = texto(searchParams.get('marcaId'));
    const tipo = texto(searchParams.get('tipo'));
    const activeParam = searchParams.get('active');

    const query: Record<string, any> = {};
    if (tipo && tipo !== 'todos') query.tipoVeiculo = tipo;
    if (activeParam !== 'all') query.ativo = activeParam === 'false' ? false : true;
    if (marcaId) query.marcaId = marcaId;
    if (marca) query.marca = { $regex: `^${escapeRegex(marca)}$`, $options: 'i' };
    if (search) {
        const regex = { $regex: escapeRegex(search), $options: 'i' };
        query.$or = [
            { marca: regex },
            { modelo: regex },
            { codigoFipe: regex },
            { cor: regex },
            { status: regex },
            { cidade: regex },
            { estado: regex },
            { concessionaria: regex },
            { nomeContato: regex },
            { operador: regex },
            { opcionais: regex },
        ];
    }
    return query;
}

/** Ordem da lista; o _id no fim deixa a paginação estável entre páginas. */
export const ORDEM_DO_CATALOGO = { marca: 1, modelo: 1, cor: 1, anoModelo: -1, _id: 1 } as const;
