"use client";

import { useState, useEffect } from 'react';
import { ChurnDashboard } from './ChurnDashboard';
import { Building2, Printer, X } from 'lucide-react';
import {
    Button, EmptyState, FilterSelect, Page, PageHeader, Panel, PanelFooter, PanelToolbar, SectionCard, Segmented,
    SkeletonRows, StatusBadge, pageStyles, type BadgeTone,
} from '@/components/ui/Page';
import { InlineNotice } from '@/components/ui/Feedback';

type MetricItem = {
    nome: string;
    total?: number;
    dias?: number;
    lastUpdated?: string | null;
};

type DealershipDetail = {
    concessionaria: string;
    responsavel: string;
    operador?: string;
    total: number;
    dias: number;
    lastUpdated: string | null;
};

interface AdminMetricsResponse {
    byOperator: MetricItem[];
    byConcessionaria: MetricItem[];
    concessionariaStaleness: MetricItem[];
    dealershipDetails: DealershipDetail[];
}

type FiltersState = {
    operador: string;
    concessionaria: string;
    responsavel: string;
    diasDesde: string;
};

const INITIAL_FILTERS: FiltersState = {
    operador: '',
    concessionaria: '',
    responsavel: '',
    diasDesde: ''
};

interface VisaoGeralTabProps {
    userInfo: { name?: string | null; email?: string | null; profile?: string };
}

export function VisaoGeralTab({ userInfo }: VisaoGeralTabProps) {
    const [metrics, setMetrics] = useState<AdminMetricsResponse>({ byOperator: [], byConcessionaria: [], concessionariaStaleness: [], dealershipDetails: [] });
    const [loadingMetrics, setLoadingMetrics] = useState<boolean>(false);
    const [metricsError, setMetricsError] = useState<string | null>(null);
    const [filters, setFilters] = useState<FiltersState>({ ...INITIAL_FILTERS });
    const [viewMode, setViewMode] = useState<'summary' | 'detailed'>('summary');
    const [operadoresList, setOperadoresList] = useState<string[]>([]);
    const [concessionariasList, setConcessionariasList] = useState<string[]>([]);
    const [responsaveisList, setResponsaveisList] = useState<string[]>([]);
    const [allDealershipDetails, setAllDealershipDetails] = useState<DealershipDetail[]>([]);

    useEffect(() => {
        const fetchAllData = async () => {
            try {
                const res = await fetch('/api/admin/metrics');
                if (res.ok) {
                    const data: AdminMetricsResponse = await res.json();
                    if (data.dealershipDetails) {
                        setAllDealershipDetails(data.dealershipDetails);
                    }
                }
            } catch (error) {
                console.error('Erro ao carregar dados completos:', error);
            }
        };
        fetchAllData();
    }, []);

    useEffect(() => {
        if (allDealershipDetails.length === 0) return;

        const operadoresFiltered = allDealershipDetails.filter(item => {
            if (filters.concessionaria && item.concessionaria !== filters.concessionaria) return false;
            if (filters.responsavel && item.responsavel !== filters.responsavel) return false;
            return true;
        });

        const concessionariasFiltered = allDealershipDetails.filter(item => {
            if (filters.operador && item.operador !== filters.operador) return false;
            if (filters.responsavel && item.responsavel !== filters.responsavel) return false;
            return true;
        });

        const responsaveisFiltered = allDealershipDetails.filter(item => {
            if (filters.operador && item.operador !== filters.operador) return false;
            if (filters.concessionaria && item.concessionaria !== filters.concessionaria) return false;
            return true;
        });

        const uniqueOperadores = [...new Set(operadoresFiltered.map(item => item.operador).filter((v): v is string => Boolean(v)))].sort();
        const uniqueConcessionarias = [...new Set(concessionariasFiltered.map(item => item.concessionaria).filter((v): v is string => Boolean(v)))].sort();
        const uniqueResponsaveis = [...new Set(responsaveisFiltered.map(item => item.responsavel).filter((v): v is string => Boolean(v)))].sort();

        setOperadoresList(uniqueOperadores);
        setConcessionariasList(uniqueConcessionarias);
        setResponsaveisList(uniqueResponsaveis);
    }, [filters.operador, filters.concessionaria, filters.responsavel, allDealershipDetails]);

    useEffect(() => {
        const fetchMetrics = async () => {
            setLoadingMetrics(true);
            setMetricsError(null);
            try {
                const params = new URLSearchParams();
                Object.entries(filters).forEach(([key, value]) => {
                    if (value) params.append(key, value);
                });

                const url = `/api/admin/metrics${params.toString() ? '?' + params.toString() : ''}`;
                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error('Não foi possível carregar os dados de visão geral');
                }
                const data: AdminMetricsResponse = await res.json();
                setMetrics(data);
            } catch (error: any) {
                console.error('Erro ao buscar métricas:', error);
                setMetricsError(error?.message || 'Erro ao buscar métricas');
            } finally {
                setLoadingMetrics(false);
            }
        };

        fetchMetrics();
    }, [filters]);

    const handleFilterChange = (key: keyof FiltersState, value: string) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    };

    const activeFiltersCount = Object.values(filters).filter(value => value !== '').length;
    const ehAdmin = ['administrador', 'admin'].includes(userInfo.profile || '');
    const tomDias = (dias: number): BadgeTone => (dias <= 1 ? 'positive' : dias <= 3 ? 'warning' : 'negative');
    const detalhes = metrics.dealershipDetails ?? [];

    const lista = (itens: MetricItem[], valor: (i: MetricItem) => number, rotulo: (i: MetricItem) => string, tom?: (i: MetricItem) => BadgeTone) => {
        const max = Math.max(1, ...itens.map(valor));
        if (loadingMetrics) return <p className={pageStyles.muted}>Carregando...</p>;
        if (itens.length === 0) return <p className={pageStyles.muted}>Sem dados para os filtros escolhidos.</p>;
        return (
            <ol className={pageStyles.rankList}>
                {itens.map(item => (
                    <li key={item.nome} className={pageStyles.rankItem}>
                        <span className={pageStyles.rankName} title={item.nome}>{item.nome}</span>
                        <span className={pageStyles.rankValue}>{rotulo(item)}</span>
                        <span className={pageStyles.rankBar} data-tone={tom?.(item)} aria-hidden="true"><span style={{ width: `${(valor(item) / max) * 100}%` }} /></span>
                    </li>
                ))}
            </ol>
        );
    };

    return (
        <Page wide>
            <PageHeader
                title="Visão geral"
                description={ehAdmin ? 'Saúde das assinaturas, estoque por operador e concessionárias que não atualizam o estoque.' : 'Estoque por operador e concessionárias que não atualizam o estoque.'}
                actions={<Button icon={<Printer size={16} aria-hidden="true" />} onClick={() => window.print()}>Imprimir</Button>}
            />

            {ehAdmin && <ChurnDashboard />}

            <Panel>
                <div className={pageStyles.panelHead}>
                    <h2 className={pageStyles.panelTitle}>Estoque das concessionárias</h2>
                    <p className={pageStyles.panelDescription}>Quem cadastra, onde está o estoque e há quantos dias cada loja não atualiza.</p>
                </div>
                <PanelToolbar>
                    <div className={pageStyles.toolbarGroup}>
                        <FilterSelect label="Operador" value={filters.operador} onChange={v => handleFilterChange('operador', v)} options={[{ value: '', label: 'Todos os operadores' }, ...operadoresList.map(o => ({ value: o, label: o }))]} />
                        <FilterSelect label="Concessionária" value={filters.concessionaria} onChange={v => handleFilterChange('concessionaria', v)} options={[{ value: '', label: 'Todas as concessionárias' }, ...concessionariasList.map(o => ({ value: o, label: o }))]} />
                        <FilterSelect label="Responsável" value={filters.responsavel} onChange={v => handleFilterChange('responsavel', v)} options={[{ value: '', label: 'Todos os responsáveis' }, ...responsaveisList.map(o => ({ value: o, label: o }))]} />
                        <FilterSelect
                            label="Dias sem atualizar"
                            value={filters.diasDesde}
                            onChange={v => handleFilterChange('diasDesde', v)}
                            options={[
                                { value: '', label: 'Qualquer atualização' },
                                { value: '0-1', label: 'Até 1 dia' },
                                { value: '2-3', label: '2 a 3 dias' },
                                { value: '4+', label: '4 dias ou mais' },
                                { value: '7+', label: '7 dias ou mais' },
                                { value: '15+', label: '15 dias ou mais' },
                            ]}
                        />
                        {activeFiltersCount > 0 && (
                            <Button variant="ghost" icon={<X size={15} aria-hidden="true" />} onClick={() => setFilters({ ...INITIAL_FILTERS })}>Limpar filtros</Button>
                        )}
                    </div>
                    <Segmented<'summary' | 'detailed'>
                        label="Modo de exibição"
                        value={viewMode}
                        onChange={setViewMode}
                        options={[{ value: 'summary', label: 'Resumo' }, { value: 'detailed', label: 'Por concessionária', count: detalhes.length }]}
                    />
                </PanelToolbar>

                {metricsError && <div className={pageStyles.panelNotice}><InlineNotice>{metricsError}</InlineNotice></div>}

                {viewMode === 'detailed' && (
                    <>
                        <div className={pageStyles.tableWrap}>
                            <table className={pageStyles.table}>
                                <thead>
                                    <tr>
                                        <th>Concessionária</th>
                                        <th>Responsável</th>
                                        <th>Operador</th>
                                        <th className={pageStyles.num}>Veículos</th>
                                        <th>Sem atualizar</th>
                                        <th>Última atualização</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loadingMetrics && <SkeletonRows rows={6} columns={6} />}
                                    {!loadingMetrics && detalhes.map((d, idx) => (
                                        <tr key={`${d.concessionaria}-${idx}`}>
                                            <td><strong>{d.concessionaria}</strong></td>
                                            <td>{d.responsavel || <span className={pageStyles.muted}>-</span>}</td>
                                            <td>{d.operador || <span className={pageStyles.muted}>-</span>}</td>
                                            <td className={pageStyles.num}><strong>{d.total.toLocaleString('pt-BR')}</strong></td>
                                            <td><StatusBadge tone={tomDias(d.dias)}>{d.dias} {d.dias === 1 ? 'dia' : 'dias'}</StatusBadge></td>
                                            <td><span className={pageStyles.nowrap}>{d.lastUpdated ? new Date(d.lastUpdated).toLocaleDateString('pt-BR') : '-'}</span></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {!loadingMetrics && detalhes.length === 0 && <EmptyState icon={<Building2 size={20} />} title="Nenhuma concessionária encontrada" description="Ajuste ou limpe os filtros." />}
                        {!loadingMetrics && detalhes.length > 0 && (
                            <PanelFooter aside="Verde até 1 dia, amarelo até 3, vermelho acima">
                                Mostrando <strong>{detalhes.length}</strong> {detalhes.length === 1 ? 'concessionária' : 'concessionárias'}
                            </PanelFooter>
                        )}
                    </>
                )}
            </Panel>

            {viewMode === 'summary' && (
                <div className={pageStyles.cardGrid}>
                    <SectionCard title="Veículos por operador" description="Cadastros feitos por cada operador.">
                        {lista(metrics.byOperator, i => i.total ?? 0, i => (i.total ?? 0).toLocaleString('pt-BR'))}
                    </SectionCard>
                    <SectionCard title="Veículos por concessionária" description="As 20 lojas com mais veículos.">
                        {lista(metrics.byConcessionaria, i => i.total ?? 0, i => (i.total ?? 0).toLocaleString('pt-BR'))}
                    </SectionCard>
                    <SectionCard title="Tempo sem atualizar" description="Lojas há mais tempo sem enviar estoque.">
                        {lista(metrics.concessionariaStaleness, i => i.dias ?? 0, i => `${i.dias ?? 0} ${i.dias === 1 ? 'dia' : 'dias'}`, i => tomDias(i.dias ?? 0))}
                    </SectionCard>
                </div>
            )}
        </Page>
    );
}
