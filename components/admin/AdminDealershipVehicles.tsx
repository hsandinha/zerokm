'use client';

import { useEffect, useMemo, useState } from 'react';
import { Warehouse } from 'lucide-react';
import { Concessionaria } from '../../lib/services/concessionariaService';
import { DealerInventory } from '../dealership/DealerInventory';
import { EmptyState, Page, PageHeader, Panel, PanelToolbar, StatusBadge, pageStyles } from '@/components/ui/Page';
import { InlineNotice } from '@/components/ui/Feedback';

/** Estoque de cada concessionária (catálogo 0KM e repasse), visto pela equipe. */
export function AdminDealershipVehicles() {
    const [concessionarias, setConcessionarias] = useState<Concessionaria[]>([]);
    const [selectedId, setSelectedId] = useState<string>('');
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);

    useEffect(() => {
        const carregar = async () => {
            try {
                const res = await fetch('/api/concessionarias');
                if (!res.ok) throw new Error();
                const data = await res.json();
                setConcessionarias(Array.isArray(data) ? data : []);
            } catch (err) {
                console.error('Erro ao buscar concessionárias:', err);
                setErro('Não foi possível carregar as concessionárias.');
            } finally {
                setLoading(false);
            }
        };
        carregar();
    }, []);

    const ordenadas = useMemo(
        () => [...concessionarias].sort((a, b) => (a.nome || '').localeCompare(b.nome || '', 'pt-BR')),
        [concessionarias],
    );
    const selecionada = ordenadas.find(c => c.id === selectedId);

    return (
        <Page wide>
            <PageHeader
                title="Estoque"
                count={loading ? null : concessionarias.length}
                description="Escolha a concessionária para ver e ajustar o catálogo 0KM e os veículos de repasse dela."
            />

            <Panel>
                <PanelToolbar>
                    <label className={pageStyles.toolbarField}>
                        <span>Concessionária</span>
                        <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} disabled={loading}>
                            <option value="">{loading ? 'Carregando...' : 'Selecione uma concessionária'}</option>
                            {ordenadas.map((c) => (
                                <option key={c.id} value={c.id}>
                                    {c.nome}{c.marca ? ` (${c.marca})` : ''}{c.cidade ? ` · ${c.cidade}/${c.uf}` : ''}
                                </option>
                            ))}
                        </select>
                    </label>
                    {selecionada && (
                        <StatusBadge tone={(selecionada.totalAtivos || 0) > 0 ? 'positive' : 'neutral'}>
                            {(selecionada.totalAtivos || 0).toLocaleString('pt-BR')} {(selecionada.totalAtivos || 0) === 1 ? 'veículo ativo' : 'veículos ativos'}
                        </StatusBadge>
                    )}
                </PanelToolbar>
                {erro && <div className={pageStyles.panelNotice}><InlineNotice>{erro}</InlineNotice></div>}
                {!selectedId && (
                    <EmptyState
                        icon={<Warehouse size={20} />}
                        title="Nenhuma concessionária selecionada"
                        description="O estoque aparece aqui assim que você escolher a loja no seletor acima."
                    />
                )}
            </Panel>

            {selectedId && <DealerInventory key={selectedId} concessionariaId={selectedId} />}
        </Page>
    );
}
