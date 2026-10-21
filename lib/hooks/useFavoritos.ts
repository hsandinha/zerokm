'use client';
import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Favoritos do cliente. Estado único para a página: o coração na consulta, a
 * bolinha do menu e a aba Favoritos leem o mesmo store.
 *
 * O favorito é o veículo específico da linha (a oferta), não o modelo. Os
 * favoritos antigos por modelo continuam aparecendo até o cliente removê-los.
 *
 * API: GET    /api/user/favoritos                    -> { veiculos, favoritos, totalNovos }
 *      POST   /api/user/favoritos { veiculoId, ... } -> favorita o veículo
 *      DELETE /api/user/favoritos?veiculoId=         -> tira o veículo
 *      DELETE /api/user/favoritos?marca=&modelo=     -> remove favorito antigo por modelo
 *      POST   /api/user/favoritos/visto              -> zera as novidades
 */
export interface FavoritoVeiculoResumo {
    id: string;
    veiculoId: string;
    origem: 'novo' | 'repasse';
    marca: string;
    modelo: string;
    ano?: string;
    cor?: string;
    tipoVeiculo?: string;
    imagemUrl?: string;
    disponivel: boolean;
    atualizado: boolean;
    lastSeenAt: string;
}

/** Favorito antigo, por modelo. */
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

type Estado = { veiculos: FavoritoVeiculoResumo[]; modelos: FavoritoResumo[]; totalNovos: number; loaded: boolean };
type VeiculoFavoritavel = {
    id?: string;
    origem?: 'novo' | 'repasse';
    marca?: string;
    modelo?: string;
    ano?: string;
    cor?: string;
    tipoVeiculo?: string;
    imagemUrl?: string;
};

const chaveModelo = (marca?: string, modelo?: string) => `${(marca || '').trim()}|${(modelo || '').trim()}`;
const ATUALIZAR_A_CADA_MS = 5 * 60 * 1000;

let estado: Estado = { veiculos: [], modelos: [], totalNovos: 0, loaded: false };
const ouvintes = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let carregando: Promise<void> | null = null;

function definir(novo: Partial<Estado>) {
    estado = { ...estado, ...novo };
    ouvintes.forEach(ouvir => ouvir());
}

function recalcularTotal(veiculos: FavoritoVeiculoResumo[], modelos: FavoritoResumo[]) {
    return veiculos.filter(v => v.atualizado).length + modelos.reduce((soma, f) => soma + f.novos, 0);
}

export function carregarFavoritos() {
    if (carregando) return carregando;
    carregando = fetch('/api/user/favoritos')
        .then(res => (res.ok ? res.json() : null))
        .then(data => {
            if (data && (Array.isArray(data.veiculos) || Array.isArray(data.favoritos))) {
                definir({
                    veiculos: Array.isArray(data.veiculos) ? data.veiculos : [],
                    modelos: Array.isArray(data.favoritos) ? data.favoritos : [],
                    totalNovos: Number(data.totalNovos) || 0,
                    loaded: true,
                });
            } else definir({ loaded: true });
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
        // Alterações chegam sem o cliente recarregar a página.
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

const vazio: Estado = { veiculos: [], modelos: [], totalNovos: 0, loaded: false };

export function useFavoritos(enabled = true) {
    const snapshot = useSyncExternalStore(enabled ? assinar : () => () => {}, () => (enabled ? estado : vazio), () => vazio);

    useEffect(() => {
        if (enabled && !estado.loaded) void carregarFavoritos();
    }, [enabled]);

    /** O coração da linha: só o veículo específico. */
    const isFavorite = useCallback(
        (vehicle: VeiculoFavoritavel) => Boolean(vehicle.id) && snapshot.veiculos.some(f => f.veiculoId === vehicle.id),
        [snapshot.veiculos],
    );

    /** Oferta de um modelo monitorado no formato antigo (também entra na aba Favoritos). */
    const isModeloMonitorado = useCallback(
        (vehicle: VeiculoFavoritavel) => snapshot.modelos.some(f => chaveModelo(f.marca, f.modelo) === chaveModelo(vehicle.marca, vehicle.modelo)),
        [snapshot.modelos],
    );

    /** Otimista: muda na hora, confirma com a API e recarrega as contagens. */
    const toggle = useCallback(async (vehicle: VeiculoFavoritavel) => {
        if (!vehicle.id) return;
        const veiculoId = vehicle.id;
        const anterior = estado.veiculos;
        const era = anterior.some(f => f.veiculoId === veiculoId);
        const proximos: FavoritoVeiculoResumo[] = era
            ? anterior.filter(f => f.veiculoId !== veiculoId)
            : [{
                id: `tmp-${veiculoId}`,
                veiculoId,
                origem: vehicle.origem === 'repasse' ? 'repasse' : 'novo',
                marca: vehicle.marca || '',
                modelo: vehicle.modelo || '',
                ano: vehicle.ano,
                cor: vehicle.cor,
                tipoVeiculo: vehicle.tipoVeiculo,
                imagemUrl: vehicle.imagemUrl,
                disponivel: true,
                atualizado: false,
                lastSeenAt: new Date().toISOString(),
            }, ...anterior];
        definir({ veiculos: proximos, totalNovos: recalcularTotal(proximos, estado.modelos) });
        try {
            const res = era
                ? await fetch(`/api/user/favoritos?veiculoId=${encodeURIComponent(veiculoId)}`, { method: 'DELETE' })
                : await fetch('/api/user/favoritos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        veiculoId,
                        origem: vehicle.origem === 'repasse' ? 'repasse' : 'novo',
                        marca: vehicle.marca,
                        modelo: vehicle.modelo,
                        ano: vehicle.ano,
                        cor: vehicle.cor,
                        tipoVeiculo: vehicle.tipoVeiculo,
                        imagemUrl: vehicle.imagemUrl,
                    }),
                });
            if (!res.ok) throw new Error('Falha ao salvar favorito');
            await carregarFavoritos();
        } catch {
            definir({ veiculos: anterior, totalNovos: recalcularTotal(anterior, estado.modelos) });
        }
    }, []);

    /** Remove um favorito do formato antigo (por modelo). */
    const removerModelo = useCallback(async (marca: string, modelo: string) => {
        const anterior = estado.modelos;
        const proximos = anterior.filter(f => chaveModelo(f.marca, f.modelo) !== chaveModelo(marca, modelo));
        definir({ modelos: proximos, totalNovos: recalcularTotal(estado.veiculos, proximos) });
        try {
            const res = await fetch(`/api/user/favoritos?marca=${encodeURIComponent(marca)}&modelo=${encodeURIComponent(modelo)}`, { method: 'DELETE' });
            if (!res.ok) throw new Error();
        } catch {
            definir({ modelos: anterior, totalNovos: recalcularTotal(estado.veiculos, anterior) });
        }
    }, []);

    /** O cliente abriu Favoritos: tudo que está lá passa a ser visto. */
    const markSeen = useCallback(async () => {
        if (!estado.totalNovos) return;
        definir({
            veiculos: estado.veiculos.map(v => ({ ...v, atualizado: false })),
            modelos: estado.modelos.map(f => ({ ...f, novos: 0 })),
            totalNovos: 0,
        });
        await fetch('/api/user/favoritos/visto', { method: 'POST' }).catch(() => { /* reaparece na próxima atualização */ });
    }, []);

    return {
        veiculos: snapshot.veiculos,
        modelos: snapshot.modelos,
        totalNovos: snapshot.totalNovos,
        loading: enabled && !snapshot.loaded,
        isFavorite,
        isModeloMonitorado,
        toggle,
        removerModelo,
        markSeen,
        refresh: carregarFavoritos,
        count: snapshot.veiculos.length + snapshot.modelos.length,
    };
}
