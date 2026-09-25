'use client';

import { useCallback, useEffect, useState } from 'react';
import { Pause, Pencil, Play, Plus, Search, Trash2, Truck } from 'lucide-react';
import { Transportadora, TransportadoraService } from '../../lib/services/transportadoraService';
import { AddTransportadoraModal } from './AddTransportadoraModal';
import {
    Button, EmptyState, FilterSelect, IconAction, Page, PageHeader, Pagination, Panel, PanelFooter, PanelToolbar, RowActions,
    SearchField, SkeletonRows, StatusBadge, pageStyles,
} from '@/components/ui/Page';
import { useFeedback } from '@/components/ui/Feedback';

interface TransportadorasManagementProps {
    role?: 'admin' | 'administrador' | 'operator' | 'operador' | 'client' | 'dealership' | 'vendedor' | 'operator/vendedor' | 'gerente';
}

type PorPagina = '25' | '50' | '100' | 'todos';

const moeda = (v?: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Tabela de frete por estado de destino. */
export function TransportadorasManagement(_props: TransportadorasManagementProps) {
    const [transportadoras, setTransportadoras] = useState<Transportadora[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingTransportadora, setEditingTransportadora] = useState<Transportadora | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [porPagina, setPorPagina] = useState<PorPagina>('50');
    const [totalItems, setTotalItems] = useState(0);
    const { confirm, notify, feedback } = useFeedback();

    const itensPorPagina = porPagina === 'todos' ? 1000 : Number(porPagina);
    const totalPaginas = Math.max(1, Math.ceil(totalItems / itensPorPagina));

    const loadTransportadoras = useCallback(async () => {
        try {
            setLoading(true);
            const { data, total } = await TransportadoraService.getTransportadorasPaginated({ page: currentPage, itemsPerPage: itensPorPagina, searchTerm });
            setTransportadoras(data);
            setTotalItems(total);
        } catch (error) {
            console.error('Erro ao carregar transportadoras:', error);
            notify('Não foi possível carregar a tabela de fretes.');
        } finally {
            setLoading(false);
        }
    }, [currentPage, itensPorPagina, searchTerm, notify]);

    useEffect(() => {
        const t = setTimeout(loadTransportadoras, 300);
        return () => clearTimeout(t);
    }, [loadTransportadoras]);

    useEffect(() => { setCurrentPage(1); }, [searchTerm, porPagina]);

    const abrirNovo = () => { setEditingTransportadora(null); setShowForm(true); };
    const fecharForm = () => { setShowForm(false); setEditingTransportadora(null); };

    const excluir = async (t: Transportadora) => {
        const ok = await confirm({ title: 'Excluir frete', description: <>O frete para <strong>{t.estado}</strong> sai da tabela. Consultas para esse estado ficam sem valor de frete.</>, confirmLabel: 'Excluir frete', danger: true });
        if (!ok) return;
        try {
            await TransportadoraService.deleteTransportadora(t.id!);
            notify('Frete excluído.', 'positive');
            await loadTransportadoras();
        } catch (error) {
            console.error('Erro ao excluir transportadora:', error);
            notify('Não foi possível excluir o frete. Tente de novo.');
        }
    };

    const alternar = async (t: Transportadora) => {
        try {
            await TransportadoraService.updateTransportadora(t.id!, { ativo: !t.ativo });
            notify(t.ativo ? `Frete para ${t.estado} pausado.` : `Frete para ${t.estado} ativado.`, 'positive');
            await loadTransportadoras();
        } catch (error) {
            console.error('Erro ao alterar status:', error);
            notify('Não foi possível alterar a situação do frete.');
        }
    };

    const carregando = loading && transportadoras.length === 0;

    return (
        <Page>
            <PageHeader
                title="Frete"
                count={carregando ? null : totalItems}
                description="Valor do frete por estado de destino, somado ao preço dos veículos na consulta."
                actions={<Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={abrirNovo}>Novo frete</Button>}
            />

            <Panel>
                <PanelToolbar>
                    <SearchField value={searchTerm} onChange={setSearchTerm} placeholder="Buscar por estado" />
                    <FilterSelect<PorPagina>
                        label="Itens por página"
                        value={porPagina}
                        onChange={setPorPagina}
                        options={[
                            { value: '25', label: '25 por página' },
                            { value: '50', label: '50 por página' },
                            { value: '100', label: '100 por página' },
                            { value: 'todos', label: 'Todos' },
                        ]}
                    />
                </PanelToolbar>

                <div className={pageStyles.tableWrap}>
                    <table className={pageStyles.table}>
                        <thead>
                            <tr>
                                <th>Estado</th>
                                <th className={pageStyles.num}>Valor do frete</th>
                                <th>Observação</th>
                                <th>Situação</th>
                                <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {carregando && <SkeletonRows rows={6} columns={5} />}
                            {!carregando && transportadoras.map((t) => (
                                <tr key={t.id} data-inactive={!t.ativo}>
                                    <td><strong>{t.estado}</strong></td>
                                    <td className={pageStyles.num}><strong>{moeda(t.valor)}</strong></td>
                                    <td>{t.observacao || <span className={pageStyles.muted}>Sem observação</span>}</td>
                                    <td>{t.ativo ? <StatusBadge tone="positive">Ativo</StatusBadge> : <StatusBadge>Pausado</StatusBadge>}</td>
                                    <td>
                                        <RowActions>
                                            <IconAction label="Editar frete" onClick={() => { setEditingTransportadora(t); setShowForm(true); }}>
                                                <Pencil size={17} aria-hidden="true" />
                                            </IconAction>
                                            <IconAction label={t.ativo ? 'Pausar frete' : 'Ativar frete'} onClick={() => alternar(t)}>
                                                {t.ativo ? <Pause size={17} aria-hidden="true" /> : <Play size={17} aria-hidden="true" />}
                                            </IconAction>
                                            <IconAction label="Excluir frete" tone="danger" onClick={() => excluir(t)}>
                                                <Trash2 size={17} aria-hidden="true" />
                                            </IconAction>
                                        </RowActions>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {!carregando && transportadoras.length === 0 && (
                    searchTerm
                        ? <EmptyState icon={<Search size={20} />} title="Nenhum estado encontrado" description="Confira a sigla ou o nome do estado." />
                        : <EmptyState icon={<Truck size={20} />} title="Nenhum frete cadastrado" description="Cadastre o valor do frete para cada estado atendido." action={<Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={abrirNovo}>Novo frete</Button>} />
                )}

                {!carregando && transportadoras.length > 0 && (
                    <PanelFooter aside={<Pagination page={currentPage} totalPages={porPagina === 'todos' ? 1 : totalPaginas} onChange={setCurrentPage} />}>
                        Mostrando <strong>{transportadoras.length}</strong> de {totalItems} {totalItems === 1 ? 'estado' : 'estados'}
                    </PanelFooter>
                )}
            </Panel>

            {showForm && (
                <AddTransportadoraModal
                    isOpen={showForm}
                    onClose={fecharForm}
                    onTransportadoraAdded={() => {
                        notify(editingTransportadora ? 'Frete atualizado.' : 'Frete cadastrado.', 'positive');
                        loadTransportadoras();
                    }}
                    editingTransportadora={editingTransportadora ?? undefined}
                    isEditing={Boolean(editingTransportadora)}
                />
            )}
            {feedback}
        </Page>
    );
}
