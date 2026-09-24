'use client';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Carros monitorados pelo cliente (marca + modelo). Estado único para a página:
 * o coração na consulta, a bolinha do menu e a aba Favoritos leem o mesmo store.
 *
 * API: GET    /api/user/favoritos                 -> { favoritos, totalNovos }
 *      POST   /api/user/favoritos { marca, modelo } -> monitora
 *      DELETE /api/user/favoritos?marca=&modelo=    -> para de monitorar
 *      POST   /api/user/favoritos/visto            -> zera as novidades
 */
export interface FavoritoResumo {
    id: string;
    marca: string;
    modelo: string;
    tipoVeiculo?: string;
    imagemUrl?: string;
    disponiveis: number;
    novos: number;
    lastSeenAt: string;
}

type Estado = { favoritos: FavoritoResumo[]; totalNovos: number; loaded: boolean };
type VeiculoFavoritavel = { marca?: string; modelo?: string; tipoVeiculo?: string; imagemUrl?: string };

const chave = (marca?: string, modelo?: string) => `${(marca || '').trim()}|${(modelo || '').trim()}`;
const ATUALIZAR_A_CADA_MS = 5 * 60 * 1000;

let estado: Estado = { favoritos: [], totalNovos: 0, loaded: false };
const ouvintes = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let carregando: Promise<void> | null = null;

function definir(novo: Partial<Estado>) {
    estado = { ...estado, ...novo };
    ouvintes.forEach(ouvir => ouvir());
}

function recalcularTotal(favoritos: FavoritoResumo[]) {
    return favoritos.reduce((soma, f) => soma + f.novos, 0);
}

export function carregarFavoritos() {
    if (carregando) return carregando;
    carregando = fetch('/api/user/favoritos')
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
            if (data && Array.isArray(data.favoritos)) definir({ favoritos: data.favoritos, totalNovos: Number(data.totalNovos) || 0, loaded: true });
            else definir({ loaded: true });
        })
        .catch(() => definir({ loaded: true }))
        .finally(() => { carregando = null; });
    return carregando;
}

function aoVoltarParaAba() {
    if (document.visibilityState === 'visible') void carregarFavoritos();
}

function assinar(ouvir: () => void) {
    ouvintes.add(ouvir);
    if (ouvintes.size === 1) {
        // Novas ofertas chegam sem o cliente recarregar a página.
        timer = setInterval(() => { void carregarFavoritos(); }, ATUALIZAR_A_CADA_MS);
        document.addEventListener('visibilitychange', aoVoltarParaAba);
    }
    return () => {
        ouvintes.delete(ouvir);
        if (ouvintes.size === 0) {
            if (timer) clearInterval(timer);
            timer = null;
            document.removeEventListener('visibilitychange', aoVoltarParaAba);
        }
    };
}

const vazio: Estado = { favoritos: [], totalNovos: 0, loaded: false };

export function useFavoritos(enabled = true) {
    const snapshot = useSyncExternalStore(enabled ? assinar : () => () => {}, () => (enabled ? estado : vazio), () => vazio);

    useEffect(() => {
        if (enabled && !estado.loaded) void carregarFavoritos();
    }, [enabled]);

    const isFavorite = useCallback(
        (vehicle: VeiculoFavoritavel) => snapshot.favoritos.some(f => chave(f.marca, f.modelo) === chave(vehicle.marca, vehicle.modelo)),
        [snapshot.favoritos],
    );

    /** Otimista: muda na hora, confirma com a API e recarrega as contagens. */
    const toggle = useCallback(async (vehicle: VeiculoFavoritavel) => {
        if (!vehicle.marca || !vehicle.modelo) return;
        const k = chave(vehicle.marca, vehicle.modelo);
        const anterior = estado.favoritos;
        const era = anterior.some(f => chave(f.marca, f.modelo) === k);
        const proximos = era
            ? anterior.filter(f => chave(f.marca, f.modelo) !== k)
            : [{ id: `tmp-${k}`, marca: vehicle.marca, modelo: vehicle.modelo, tipoVeiculo: vehicle.tipoVeiculo, imagemUrl: vehicle.imagemUrl, disponiveis: 0, novos: 0, lastSeenAt: new Date().toISOString() }, ...anterior];
        definir({ favoritos: proximos, totalNovos: recalcularTotal(proximos) });
        try {
            const res = era
                ? await fetch(`/api/user/favoritos?marca=${encodeURIComponent(vehicle.marca)}&modelo=${encodeURIComponent(vehicle.modelo)}`, { method: 'DELETE' })
                : await fetch('/api/user/favoritos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ marca: vehicle.marca, modelo: vehicle.modelo, tipoVeiculo: vehicle.tipoVeiculo, imagemUrl: vehicle.imagemUrl }),
                });
            if (!res.ok) throw new Error('Falha ao salvar favorito');
            await carregarFavoritos();
        } catch {
            definir({ favoritos: anterior, totalNovos: recalcularTotal(anterior) });
        }
    }, []);

    /** O cliente abriu Favoritos: tudo que está lá passa a ser visto. */
    const markSeen = useCallback(async () => {
        if (!estado.totalNovos) return;
        const semNovos = estado.favoritos.map(f => ({ ...f, novos: 0 }));
        definir({ favoritos: semNovos, totalNovos: 0 });
        await fetch('/api/user/favoritos/visto', { method: 'POST' }).catch(() => { /* reaparece na próxima atualização */ });
    }, []);

    return {
        favoritos: snapshot.favoritos,
        totalNovos: snapshot.totalNovos,
        loading: enabled && !snapshot.loaded,
        isFavorite,
        toggle,
        markSeen,
        refresh: carregarFavoritos,
        count: snapshot.favoritos.length,
    };
}
