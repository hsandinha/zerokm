'use client';

import { useEffect, useRef, useState } from 'react';
import { modalStyles } from '@/components/admin/AdminModal';
import { InlineNotice } from '@/components/ui/Feedback';
import { SearchField, StatusBadge, pageStyles } from '@/components/ui/Page';
import styles from '../FichaConcessionaria.module.css';

type Marca = { id: string; nome: string };
export type MarcasVinculadas = { marcaIds: string[]; marcas: string[] };

/**
 * Marcas que a loja representa: busca e marcação, salvas a cada clique (a rota
 * recebe a lista inteira). Usado na aba Marcas da ficha e no cadastro guiado.
 */
export function MarcasDaLoja({ concessionariaId, inicial, podeEditar = true, onMudou }: {
    concessionariaId: string;
    inicial: MarcasVinculadas;
    podeEditar?: boolean;
    onMudou?: (marcas: MarcasVinculadas) => void;
}) {
    const [catalogo, setCatalogo] = useState<Marca[] | null>(null);
    const [vinculadas, setVinculadas] = useState<MarcasVinculadas>(inicial);
    const [busca, setBusca] = useState('');
    const [erro, setErro] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    // Dois cliques rápidos: o segundo parte da lista já alterada pelo primeiro, e
    // os pedidos saem em fila para o servidor não gravar a lista mais antiga por último.
    const atual = useRef(vinculadas);
    atual.current = vinculadas;
    const fila = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        let vivo = true;
        fetch('/api/tables/marcas')
            .then(res => { if (!res.ok) throw new Error(); return res.json(); })
            .then(data => { if (vivo) setCatalogo(Array.isArray(data) ? data : []); })
            .catch(() => { if (vivo) { setCatalogo([]); setErro('Não foi possível carregar as marcas do catálogo.'); } });
        return () => { vivo = false; };
    }, []);

    const aplicar = (proximo: MarcasVinculadas) => {
        atual.current = proximo;
        setVinculadas(proximo);
    };

    const alternar = (marca: Marca) => {
        const antes = atual.current;
        const tem = antes.marcaIds.includes(marca.id);
        const marcaIds = tem ? antes.marcaIds.filter(id => id !== marca.id) : [...antes.marcaIds, marca.id];
        const nomeDe = (id: string) => catalogo?.find(m => m.id === id)?.nome ?? antes.marcas[antes.marcaIds.indexOf(id)] ?? '';
        aplicar({ marcaIds, marcas: marcaIds.map(nomeDe).filter(Boolean) });
        setErro(null);
        setAviso(null);

        fila.current = fila.current.then(async () => {
            try {
                const res = await fetch(`/api/concessionarias/${concessionariaId}/catalog-brand`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ marcaIds }),
                });
                const data = await res.json().catch(() => ({}));
                if (!res.ok) throw new Error(data.error || 'Erro ao atualizar marcas');
                // O servidor pode ter limpado uma marca que não existe mais: vale a versão dele,
                // a não ser que outro clique já tenha vindo depois deste.
                const doServidor = { marcaIds: (data.marcaIds || []) as string[], marcas: (data.marcas || []) as string[] };
                if (atual.current.marcaIds === marcaIds) aplicar(doServidor);
                onMudou?.(doServidor);
                if (Array.isArray(data.descartadas) && data.descartadas.length > 0) {
                    setAviso(`Removida da loja a marca que não existe mais no cadastro: ${data.descartadas.join(', ')}.`);
                }
            } catch (e) {
                if (atual.current.marcaIds === marcaIds) aplicar(antes);
                setErro(e instanceof Error && e.message !== 'Erro ao atualizar marcas'
                    ? `Não foi possível atualizar as marcas: ${e.message}`
                    : 'Não foi possível atualizar as marcas. A seleção anterior foi mantida.');
            }
        });
    };

    const termo = busca.trim().toLowerCase();
    const filtradas = (catalogo || []).filter(m => m.nome.toLowerCase().includes(termo));
    // Marca vinculada que saiu do cadastro: aparece marcada para poder ser desmarcada.
    const foraDoCadastro = catalogo
        ? vinculadas.marcaIds
            .map((id, i) => ({ id, nome: vinculadas.marcas[i] || 'Marca removida' }))
            .filter(m => !catalogo.some(c => c.id === m.id))
        : [];

    return (
        <div className={modalStyles.stack}>
            {vinculadas.marcaIds.length === 0 ? (
                <InlineNotice tone="warning">
                    Nenhuma marca vinculada. Sem marca a loja não vê nada no painel dela: nenhum modelo do catálogo aparece para ela colocar preço.
                </InlineNotice>
            ) : (
                <div>
                    <span className={modalStyles.groupLabel}>
                        {vinculadas.marcaIds.length === 1 ? '1 marca vinculada' : `${vinculadas.marcaIds.length} marcas vinculadas`}
                    </span>
                    <span className={pageStyles.badgeList}>
                        {vinculadas.marcas.map(nome => <StatusBadge key={nome} tone="accent" dot={false}>{nome}</StatusBadge>)}
                    </span>
                </div>
            )}

            {erro && <InlineNotice>{erro}</InlineNotice>}
            {aviso && <InlineNotice tone="positive">{aviso}</InlineNotice>}

            {podeEditar && (
                <>
                    <SearchField value={busca} onChange={setBusca} placeholder="Buscar marca" label="Buscar marca" />
                    {catalogo === null ? (
                        <p className={pageStyles.muted}>Carregando marcas...</p>
                    ) : (
                        <div className={styles.marcas} role="group" aria-label="Marcas do catálogo">
                            {foraDoCadastro.map(marca => (
                                <label key={marca.id} className={modalStyles.choice} title="Esta marca não existe mais no cadastro. Desmarque para tirar da loja.">
                                    <input type="checkbox" checked onChange={() => alternar(marca)} />
                                    <span>{marca.nome} <span className={pageStyles.muted}>(fora do cadastro)</span></span>
                                </label>
                            ))}
                            {filtradas.map(marca => (
                                <label key={marca.id} className={modalStyles.choice}>
                                    <input type="checkbox" checked={vinculadas.marcaIds.includes(marca.id)} onChange={() => alternar(marca)} />
                                    {marca.nome}
                                </label>
                            ))}
                            {catalogo.length === 0 && <span className={pageStyles.muted}>Nenhuma marca disponível.</span>}
                            {catalogo.length > 0 && filtradas.length === 0 && <span className={pageStyles.muted}>Nenhuma marca encontrada.</span>}
                        </div>
                    )}
                    <p className={`${modalStyles.hint} ${modalStyles.flush}`}>As marcas são salvas assim que você marca ou desmarca.</p>
                </>
            )}
        </div>
    );
}
