'use client';

import { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import styles from './CRMManagement.module.css';
import { CalendarPlus, ContactRound, Eye, IdCard, MessageCircle, Search, UserCheck, Users } from 'lucide-react';
import {
    Avatar, EmptyState, IconAction, Page, PageHeader, Panel, PanelFooter, PanelToolbar, PrimaryCell, RowActions,
    SearchField, Segmented, ShowingCount, SkeletonRows, SortHeader, StatCard, StatGrid, StatusBadge, TwoLine, pageStyles,
    type BadgeTone,
} from '@/components/ui/Page';
import { InlineNotice } from '@/components/ui/Feedback';
import { FichaClienteModal, type AbaDaFicha } from './FichaCliente';
import { NovoCadastroButton } from './NovoCadastro';
import { STATUS_LABELS, STATUS_TONE, formatDate, getPaymentInfo, whatsappLink, type CRMClient, type PaymentInfo } from './cliente/tipos';
import { pendenciasDoCliente, type PendenciaDoCliente } from '@/lib/utils/pendenciasDoCliente';

interface CRMSummary {
    total: number;
    active: number;
    expired: number;
    no_plan: number;
    cortesia: number;
}

type FilterTab = 'all' | 'active' | 'expired' | 'no_plan' | 'cortesia' | 'pendencia';
type SortKey = 'createdAt' | 'displayName' | 'daysUntilExpiry' | 'status' | 'payment' | 'vendedor';

const SEM_RESUMO: CRMSummary = { total: 0, active: 0, expired: 0, no_plan: 0, cortesia: 0 };

interface CRMManagementProps {
    highlightEmail?: string | null;
}

/**
 * Lista dos lojistas (clientes). O detalhe de cada um abre na ficha do cliente
 * (components/admin/FichaCliente.tsx) e o cadastro, no "Novo cadastro"
 * (components/admin/NovoCadastro.tsx): esta tela ficou só com a lista.
 */
export function CRMManagement({ highlightEmail }: CRMManagementProps) {
    const [clients, setClients] = useState<CRMClient[]>([]);
    const [summary, setSummary] = useState<CRMSummary>(SEM_RESUMO);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterTab, setFilterTab] = useState<FilterTab>('all');
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('createdAt');
    const [sortAsc, setSortAsc] = useState(false);
    /** Ficha aberta: o cliente e a aba em que ela abre. */
    const [ficha, setFicha] = useState<{ id: string; aba: AbaDaFicha } | null>(null);

    // Vendedores
    const [vendedores, setVendedores] = useState<{ id: string; displayName: string; email: string }[]>([]);
    const [assigningVendedor, setAssigningVendedor] = useState<string | null>(null);

    const abrirFicha = (client: CRMClient, aba: AbaDaFicha = 'dados') => setFicha({ id: client.id, aba });

    // Auto-open from external highlight (e.g. "Ver no CRM" button in Users tab)
    const highlightOpenedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!highlightEmail || clients.length === 0) return;
        if (highlightOpenedRef.current === highlightEmail) return;
        const client = clients.find(c => c.email === highlightEmail);
        if (client) {
            highlightOpenedRef.current = highlightEmail;
            setFicha({ id: client.id, aba: 'dados' });
        }
    }, [highlightEmail, clients]);

    const reloadClients = useCallback(() => {
        fetch('/api/admin/crm')
            .then(r => r.json())
            .then(data => {
                if (data.error) { setError(data.error); return; }
                setError(null);
                setClients(data.clients || []);
                setSummary(data.summary || SEM_RESUMO);
            })
            .catch(() => setError('Erro ao carregar dados de CRM'))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        setLoading(true);
        reloadClients();

        // Load vendedores
        fetch('/api/admin/vendedores')
            .then(r => r.json())
            .then((data: any[]) => {
                if (Array.isArray(data)) {
                    const vs = data.map(u => ({
                        id: u._id || u.id || '',
                        displayName: u.displayName || u.email,
                        email: u.email,
                    }));
                    setVendedores(vs);
                }
            })
            .catch(() => {});
    }, [reloadClients]);

    const handleAssignVendedor = async (clientId: string, vendedorMongoId: string) => {
        setAssigningVendedor(clientId);
        try {
            const res = await fetch('/api/admin/crm/assign-vendedor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId, vendedorId: vendedorMongoId }),
            });
            if (res.ok) {
                const vendedor = vendedores.find(v => v.id === vendedorMongoId);
                setClients(prev => prev.map(c =>
                    c.id === clientId
                        ? { ...c, vendedorId: vendedorMongoId, vendedorNome: vendedor?.displayName || null }
                        : c
                ));
            }
        } catch (e) {
            console.error('Erro ao vincular vendedor:', e);
        } finally {
            setAssigningVendedor(null);
        }
    };

    // Pendências de cada cliente, calculadas sobre a própria lista (sem consulta por linha).
    const pendenciasPorCliente = useMemo(() => {
        const mapa = new Map<string, PendenciaDoCliente[]>();
        for (const c of clients) mapa.set(c.id, pendenciasDoCliente(c));
        return mapa;
    }, [clients]);
    const comPendencia = useMemo(() => clients.filter(c => (pendenciasPorCliente.get(c.id)?.length ?? 0) > 0).length, [clients, pendenciasPorCliente]);

    const filtered = useMemo(() => {
        let list = [...clients];

        if (filterTab === 'cortesia') {
            list = list.filter(c => c.activationMethod === 'cortesia' && c.status === 'active');
        } else if (filterTab === 'active') {
            // Cortesia tem aba própria: repetir aqui inflava "Plano ativo" e
            // misturava quem paga com quem foi bonificado.
            list = list.filter(c => c.status === 'active' && c.activationMethod !== 'cortesia');
        } else if (filterTab === 'pendencia') {
            list = list.filter(c => (pendenciasPorCliente.get(c.id)?.length ?? 0) > 0);
        } else if (filterTab !== 'all') {
            list = list.filter(c => c.status === filterTab);
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            // Buscar pelo nome ou e-mail de uma tela extra acha a conta principal.
            list = list.filter(c =>
                c.displayName.toLowerCase().includes(q) ||
                c.email.toLowerCase().includes(q) ||
                (c.phoneNumber && c.phoneNumber.includes(q)) ||
                (c.telasExtras || []).some(t => t.nome.toLowerCase().includes(q) || t.email.toLowerCase().includes(q))
            );
        }

        // Valor comparável de cada coluna. Texto sempre em minúsculas e ausência
        // sempre no fim (independente da direção), senão "sem vendedor" e
        // "sem pagamento" embaralham o topo da lista.
        const valorDe = (c: CRMClient): string | number => {
            switch (sortKey) {
                case 'createdAt':
                    return new Date(c.createdAt).getTime() || 0;
                case 'displayName':
                    return (c.displayName || c.email || '').toLowerCase();
                case 'daysUntilExpiry':
                    return c.daysUntilExpiry ?? Number.POSITIVE_INFINITY;
                case 'status': {
                    const ordem: Record<CRMClient['status'], number> = { expired: 0, no_plan: 1, active: 2 };
                    return ordem[c.status];
                }
                case 'payment':
                    return getPaymentInfo(c)?.label.toLowerCase() ?? '';
                case 'vendedor':
                    return (vendedores.find(v => v.id === c.vendedorId)?.displayName ?? '').toLowerCase();
                default:
                    return 0;
            }
        };

        list.sort((a, b) => {
            const va = valorDe(a);
            const vb = valorDe(b);
            // Vazio vai para o fim nos dois sentidos.
            const aVazio = va === '' || va === Number.POSITIVE_INFINITY;
            const bVazio = vb === '' || vb === Number.POSITIVE_INFINITY;
            if (aVazio !== bVazio) return aVazio ? 1 : -1;
            if (va < vb) return sortAsc ? -1 : 1;
            if (va > vb) return sortAsc ? 1 : -1;
            return 0;
        });

        return list;
    }, [clients, filterTab, search, sortKey, sortAsc, vendedores, pendenciasPorCliente]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortAsc(p => !p);
        // Data começa da mais recente: o uso da coluna é ver quem acabou de
        // entrar. Nas demais, A→Z / menor→maior é o esperado.
        else { setSortKey(key); setSortAsc(key !== 'createdAt'); }
    };

    /** "hoje", "3 dias", "2 meses" — mostra o ritmo de entrada sem fazer conta. */
    const tempoDesde = (iso: string | null) => {
        if (!iso) return '';
        const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
        if (!Number.isFinite(dias) || dias < 0) return '';
        if (dias === 0) return 'hoje';
        if (dias === 1) return 'ontem';
        if (dias < 30) return `há ${dias} dias`;
        const meses = Math.floor(dias / 30);
        return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
    };


    const PAYMENT_TONE: Record<PaymentInfo['kind'], BadgeTone> = { courtesy: 'accent', pix: 'info', boleto: 'info', card: 'info', unlinked: 'neutral' };
    const trintaDias = Date.now() - 30 * 86_400_000;
    const novos30 = clients.filter(c => new Date(c.createdAt).getTime() >= trintaDias).length;
    const completos = clients.filter(c => (c.profileCompletion ?? 0) >= 100).length;
    const pctBase = (n: number) => (summary.total ? (n / summary.total) * 100 : 0);
    const ordenacao = { column: sortKey, direction: sortAsc ? 'asc' as const : 'desc' as const };
    const ORDEM_TEXTO: Record<SortKey, string> = {
        createdAt: 'data de cadastro', displayName: 'nome', daysUntilExpiry: 'vencimento', status: 'situação', payment: 'forma de pagamento', vendedor: 'responsável',
    };

    return (
        <Page wide>
            <PageHeader
                title="Clientes"
                count={loading ? null : summary.total}
                description="Lojistas e revendas com acesso à consulta, plano e situação da assinatura."
                actions={<NovoCadastroButton perfilInicial="lojista" onFechar={reloadClients} />}
            />

            <StatGrid>
                <StatCard label="Total na base" icon={<Users size={18} />} value={loading ? '-' : summary.total} caption="Clientes cadastrados" />
                <StatCard label="Assinantes ativos" icon={<UserCheck size={18} />} value={loading ? '-' : summary.active} progress={pctBase(summary.active)} caption={`${Math.round(pctBase(summary.active))}% da base`} />
                <StatCard label="Novos em 30 dias" icon={<CalendarPlus size={18} />} value={loading ? '-' : novos30} caption="Entraram no último mês" />
                <StatCard label="Cadastro completo" icon={<IdCard size={18} />} value={loading ? '-' : completos} progress={pctBase(completos)} caption="Com CPF, telefone e endereço" />
            </StatGrid>

            <Panel>
                <PanelToolbar>
                    <Segmented<FilterTab>
                        label="Filtrar por situação"
                        value={filterTab}
                        onChange={setFilterTab}
                        options={[
                            { value: 'all', label: 'Todos', count: summary.total },
                            { value: 'active', label: 'Ativos', count: summary.active },
                            { value: 'expired', label: 'Expirados', count: summary.expired },
                            { value: 'no_plan', label: 'Sem plano', count: summary.no_plan },
                            { value: 'cortesia', label: 'Cortesia', count: summary.cortesia },
                            { value: 'pendencia', label: 'Com pendência', count: comPendencia },
                        ]}
                    />
                    <SearchField value={search} onChange={setSearch} placeholder="Nome, e-mail ou telefone" />
                </PanelToolbar>

                {error && <div className={pageStyles.panelNotice}><InlineNotice>{error}</InlineNotice></div>}

                <div className={pageStyles.tableWrap}>
                    <table className={pageStyles.table}>
                        <thead>
                            <tr>
                                <SortHeader label="Cliente" column="displayName" sort={ordenacao} onSort={handleSort} />
                                <SortHeader label="Assinatura" column="daysUntilExpiry" sort={ordenacao} onSort={handleSort} />
                                <SortHeader label="Financeiro" column="payment" sort={ordenacao} onSort={handleSort} />
                                <SortHeader label="Responsável" column="vendedor" sort={ordenacao} onSort={handleSort} />
                                <SortHeader label="Cadastro" column="createdAt" sort={ordenacao} onSort={handleSort} />
                                <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <SkeletonRows rows={6} columns={6} />}
                            {!loading && filtered.map(client => {
                                const isExpiringSoon = client.status === 'active' && client.daysUntilExpiry !== null && client.daysUntilExpiry <= 7;
                                const payment = getPaymentInfo(client);
                                const profileCompletion = client.profileCompletion ?? 0;
                                const wa = whatsappLink(client.phoneNumber, client.displayName, client.status);
                                const statusLabel = isExpiringSoon
                                    ? (client.daysUntilExpiry! <= 0 ? 'Vence hoje' : `Vence em ${client.daysUntilExpiry} ${client.daysUntilExpiry === 1 ? 'dia' : 'dias'}`)
                                    : client.activationMethod === 'cortesia' && client.status === 'active' ? 'Cortesia'
                                        : client.profileType === 'gratis' && client.status !== 'active' ? 'Teste grátis'
                                            : STATUS_LABELS[client.status];
                                const statusTone: BadgeTone = isExpiringSoon ? 'negative'
                                    : client.profileType === 'gratis' && client.status !== 'active' ? 'warning'
                                        : STATUS_TONE[client.status];
                                // O selo que repete a situação da coluna Assinatura não entra de novo.
                                const pendencias = (pendenciasPorCliente.get(client.id) || []).filter(p => p.rotulo !== statusLabel);
                                const vencimento = client.planType === 'credits'
                                    ? `${client.credits} ${client.credits === 1 ? 'crédito disponível' : 'créditos disponíveis'}`
                                    : client.expiresAt
                                        ? `${client.status === 'expired' ? 'Expirou em' : 'Até'} ${formatDate(client.expiresAt)}`
                                        : null;
                                return (
                                    <tr
                                        key={client.id}
                                        className={pageStyles.clickableRow}
                                        tabIndex={0}
                                        onClick={() => abrirFicha(client)}
                                        onKeyDown={event => {
                                            if (event.target !== event.currentTarget) return;
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                abrirFicha(client);
                                            }
                                        }}
                                        aria-label={`Abrir detalhes de ${client.displayName || client.email}`}
                                    >
                                        <td className={pageStyles.colMain}>
                                            <PrimaryCell
                                                leading={<Avatar name={client.displayName || client.email || '?'} />}
                                                title={client.displayName || 'Sem nome'}
                                                subtitle={<>
                                                    {client.email}
                                                    <span className={pageStyles.subLine}>
                                                        {client.phoneNumber ? `${client.phoneNumber} · ` : ''}Cadastro {profileCompletion}% completo
                                                    </span>
                                                    {(client.telasExtras?.length ?? 0) > 0 && (
                                                        <span className={pageStyles.subLine} title={client.telasExtras!.map(t => `${t.nome} (${t.email})`).join('\n')}>
                                                            + {client.telasExtras!.length} {client.telasExtras!.length === 1 ? 'tela extra' : 'telas extras'}: {client.telasExtras!.map(t => t.nome || t.email).join(', ')}
                                                        </span>
                                                    )}
                                                    {pendencias.length > 0 && (
                                                        <span className={`${pageStyles.badgeList} ${styles.pendencias}`} onClick={event => event.stopPropagation()}>
                                                            {pendencias.map(p => (
                                                                <button key={p.codigo} type="button" className={styles.pendencia} title={`${p.detalhe} Clique para resolver na ficha.`} aria-label={`Pendência: ${p.rotulo}`} onClick={() => abrirFicha(client, p.aba)}>
                                                                    <StatusBadge tone={p.tom} dot={false}>{p.rotulo}</StatusBadge>
                                                                </button>
                                                            ))}
                                                        </span>
                                                    )}
                                                </>}
                                            />
                                        </td>
                                        <td>
                                            <TwoLine
                                                top={<span className={pageStyles.badgeList}>
                                                    <StatusBadge tone={statusTone}>{statusLabel}</StatusBadge>
                                                    {client.billingType === 'annual' && <StatusBadge dot={false}>Anual</StatusBadge>}
                                                </span>}
                                                bottom={client.planName ? <>{client.planName}{vencimento ? ` · ${vencimento}` : ''}</> : vencimento ?? undefined}
                                            />
                                        </td>
                                        <td>
                                            {payment
                                                ? <TwoLine top={<StatusBadge tone={PAYMENT_TONE[payment.kind]} dot={false}>{payment.label}</StatusBadge>} bottom={client.billingType === 'annual' ? 'Recorrência anual' : 'Recorrência mensal'} />
                                                : <span className={pageStyles.muted}>Sem pagamento</span>}
                                        </td>
                                        <td onClick={event => event.stopPropagation()}>
                                            <select
                                                className={styles.sellerSelect}
                                                value={client.vendedorId || ''}
                                                onChange={event => handleAssignVendedor(client.id, event.target.value)}
                                                disabled={assigningVendedor === client.id}
                                                aria-label={`Responsável por ${client.displayName || client.email}`}
                                            >
                                                <option value="">Sem vendedor</option>
                                                {vendedores.map(vendedor => (
                                                    <option key={vendedor.id} value={vendedor.id}>{vendedor.displayName}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td><TwoLine nowrap top={formatDate(client.createdAt)} bottom={tempoDesde(client.createdAt)} /></td>
                                        <td onClick={event => event.stopPropagation()}>
                                            <RowActions>
                                                {wa && (
                                                    <IconAction label="Conversar no WhatsApp" href={wa}>
                                                        <MessageCircle size={17} aria-hidden="true" />
                                                    </IconAction>
                                                )}
                                                <IconAction label="Ver detalhes" onClick={() => abrirFicha(client)}>
                                                    <Eye size={17} aria-hidden="true" />
                                                </IconAction>
                                            </RowActions>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {!loading && filtered.length === 0 && (
                    clients.length === 0
                        ? <EmptyState icon={<ContactRound size={20} />} title="Nenhum cliente ainda" description="Os lojistas aparecem aqui assim que se cadastram no site. Você também pode cadastrar um manualmente." action={<NovoCadastroButton perfilInicial="lojista" onFechar={reloadClients} />} />
                        : <EmptyState icon={<Search size={20} />} title="Nenhum cliente encontrado" description="Ajuste a busca ou o filtro de situação." />
                )}

                {!loading && clients.length > 0 && (
                    <PanelFooter aside={`Ordenado por ${ORDEM_TEXTO[sortKey]}`}>
                        <ShowingCount shown={filtered.length} total={clients.length} singular="cliente" plural="clientes" />
                    </PanelFooter>
                )}
            </Panel>

            {ficha && (
                <FichaClienteModal
                    key={ficha.id}
                    userId={ficha.id}
                    abaInicial={ficha.aba}
                    onClose={() => setFicha(null)}
                    onMudou={reloadClients}
                />
            )}
        </Page>
    );
}
