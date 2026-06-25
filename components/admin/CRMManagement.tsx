'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import styles from './CRMManagement.module.css';

interface CRMClient {
    id: string;
    displayName: string;
    email: string;
    phoneNumber: string;
    cpf: string;
    address: {
        street: string;
        number: string;
        complement?: string;
        neighborhood: string;
        city: string;
        state: string;
        zipCode: string;
    } | null;
    profileType: 'cliente' | 'gratis';
    credits: number;
    status: 'active' | 'expired' | 'no_plan';
    planName: string | null;
    planType: string | null;
    expiresAt: string | null;
    daysUntilExpiry: number | null;
    activationMethod: 'manual' | 'cortesia' | 'card' | 'pix' | 'boleto' | null;
    paymentMethod?: 'pix' | 'boleto' | 'card' | null;
    billingType: 'monthly' | 'annual' | null;
    createdAt: string;
    hasCard: boolean;
    cardBrand?: string | null;
    cardLastFour?: string | null;
    profileCompletion: number;
    inviteCount: number;
    isInvitee: boolean;
    vendedorId?: string | null;
    vendedorNome?: string | null;
}

interface Plan {
    id: string;
    name: string;
    type: 'monthly' | 'credits';
    credits: number | null;
    price: number;
    annualPrice?: number | null;
    active: boolean;
}

interface CRMSummary {
    total: number;
    active: number;
    expired: number;
    no_plan: number;
    cortesia: number;
}

type FilterTab = 'all' | 'active' | 'expired' | 'no_plan' | 'cortesia';
type SortKey = 'createdAt' | 'displayName' | 'daysUntilExpiry' | 'status';

const STATUS_LABELS: Record<CRMClient['status'], string> = {
    active: 'Ativo',
    expired: 'Expirado',
    no_plan: 'Sem plano',
};

const STATUS_COLORS: Record<CRMClient['status'], string> = {
    active: '#10b981',
    expired: '#ef4444',
    no_plan: '#f59e0b',
};

interface CRMManagementProps {
    highlightEmail?: string | null;
}

type AssignPlanModal = {
    client: CRMClient;
    planId: string;
    startDate: string;
    activationMethod?: 'manual' | 'cortesia';
    paymentMethod?: 'pix' | 'boleto' | 'card';
    paymentFrequency?: 'monthly' | 'annual';
};

type PaymentInfo = {
    kind: 'courtesy' | 'pix' | 'boleto' | 'card' | 'unlinked';
    label: string;
};

export function CRMManagement({ highlightEmail }: CRMManagementProps) {
    const [clients, setClients] = useState<CRMClient[]>([]);
    const [summary, setSummary] = useState<CRMSummary>({ total: 0, active: 0, expired: 0, no_plan: 0, cortesia: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterTab, setFilterTab] = useState<FilterTab>('all');
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<SortKey>('createdAt');
    const [sortAsc, setSortAsc] = useState(false);
    const [selectedClient, setSelectedClient] = useState<CRMClient | null>(null);

    // Plans
    const [plans, setPlans] = useState<Plan[]>([]);

    // Assign plan modal
    const [assignModal, setAssignModal] = useState<AssignPlanModal | null>(null);
    const [assigning, setAssigning] = useState(false);
    const [assignError, setAssignError] = useState<string | null>(null);

    // Charge state
    const [chargingId, setChargingId] = useState<string | null>(null);
    const [chargeResult, setChargeResult] = useState<{ clientId: string; ok: boolean; msg: string } | null>(null);

    // Invite management
    const [inviteModal, setInviteModal] = useState<{ client: CRMClient } | null>(null);
    const [invites, setInvites] = useState<{ id: string; nome: string; email: string; telefone: string; status: string; monthlyPrice: number; createdAt: string }[]>([]);
    const [invitesLoading, setInvitesLoading] = useState(false);
    const [inviteForm, setInviteForm] = useState({ nome: '', email: '', telefone: '' });
    const [inviteSending, setInviteSending] = useState(false);
    const [inviteFeedback, setInviteFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const [tempPassword, setTempPassword] = useState<string | null>(null);
    const [editingInvite, setEditingInvite] = useState<{ id: string; nome: string; email: string; telefone: string } | null>(null);
    const [editSaving, setEditSaving] = useState(false);

    // Create client
    const [createModal, setCreateModal] = useState(false);
    const [createForm, setCreateForm] = useState({ nome: '', email: '', telefone: '', cpf: '' });
    const [createSending, setCreateSending] = useState(false);
    const [createFeedback, setCreateFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const [createdPassword, setCreatedPassword] = useState<string | null>(null);

    // Vendedores
    const [vendedores, setVendedores] = useState<{ id: string; displayName: string; email: string }[]>([]);
    const [assigningVendedor, setAssigningVendedor] = useState<string | null>(null);

    // Auto-open from external highlight (e.g. "Ver no CRM" button in Users tab)
    const highlightOpenedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!highlightEmail || clients.length === 0) return;
        if (highlightOpenedRef.current === highlightEmail) return;
        const client = clients.find(c => c.email === highlightEmail);
        if (client) {
            highlightOpenedRef.current = highlightEmail;
            setSelectedClient(client);
            setModalTab('dados');
            setEditMode(false);
            setEditClientError(null);
            setEditForm(null);
        }
    }, [highlightEmail, clients]);

    // Modal tabs & client edit
    const [modalTab, setModalTab] = useState<'dados' | 'assinatura'>('dados');
    const [editMode, setEditMode] = useState(false);
    const [editClientError, setEditClientError] = useState<string | null>(null);
    const [editSavingClient, setEditSavingClient] = useState(false);
    const [editForm, setEditForm] = useState<{
        displayName: string;
        phoneNumber: string;
        cpf: string;
        address: { street: string; number: string; complement: string; neighborhood: string; city: string; state: string; zipCode: string };
    } | null>(null);

    useEffect(() => {
        setLoading(true);
        // Load CRM data and plans independently so a plans failure won't block client list
        fetch('/api/admin/crm')
            .then(r => r.json())
            .then(data => {
                if (data.error) { setError(data.error); return; }
                setClients(data.clients || []);
                setSummary(data.summary || { total: 0, active: 0, expired: 0, no_plan: 0 });
            })
            .catch(() => setError('Erro ao carregar dados de CRM'))
            .finally(() => setLoading(false));

        fetch('/api/admin/plans')
            .then(r => r.json())
            .then(data => setPlans((Array.isArray(data) ? data : []).filter((p: Plan) => p.active)))
            .catch(() => { /* plans are optional, silently ignore */ });

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
    }, []);

    const reloadClients = () => {
        fetch('/api/admin/crm')
            .then(r => r.json())
            .then(data => {
                setClients(data.clients || []);
                setSummary(data.summary || { total: 0, active: 0, expired: 0, no_plan: 0, cortesia: 0 });
            });
    };

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

    const openClientModal = (client: CRMClient) => {
        setSelectedClient(client);
        setModalTab('dados');
        setEditMode(false);
        setEditClientError(null);
        setEditForm(null);
    };

    const startEditClient = (client: CRMClient) => {
        setEditForm({
            displayName: client.displayName,
            phoneNumber: client.phoneNumber,
            cpf: client.cpf || '',
            address: {
                street: client.address?.street || '',
                number: client.address?.number || '',
                complement: client.address?.complement || '',
                neighborhood: client.address?.neighborhood || '',
                city: client.address?.city || '',
                state: client.address?.state || '',
                zipCode: client.address?.zipCode || '',
            },
        });
        setEditMode(true);
        setEditClientError(null);
    };

    const handleCepChange = async (val: string) => {
        const zipCode = val.replace(/\D/g, '');
        let formatted = zipCode;
        if (zipCode.length > 5) {
            formatted = `${zipCode.slice(0, 5)}-${zipCode.slice(5, 8)}`;
        }
        setEditForm(f => f ? { ...f, address: { ...f.address, zipCode: formatted } } : f);

        if (zipCode.length === 8) {
            try {
                const res = await fetch(`https://viacep.com.br/ws/${zipCode}/json/`);
                const data = await res.json();
                if (!data.erro) {
                    setEditForm(f => f ? {
                        ...f,
                        address: {
                            ...f.address,
                            street: data.logradouro || f.address.street,
                            neighborhood: data.bairro || f.address.neighborhood,
                            city: data.localidade || f.address.city,
                            state: data.uf || f.address.state,
                        }
                    } : f);
                }
            } catch (err) {
                console.error('Erro ao buscar CEP:', err);
            }
        }
    };

    const handleSaveClientEdit = async () => {
        if (!selectedClient || !editForm) return;
        setEditSavingClient(true);
        setEditClientError(null);
        try {
            const res = await fetch('/api/admin/crm/edit', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: selectedClient.id,
                    displayName: editForm.displayName,
                    phoneNumber: editForm.phoneNumber,
                    cpf: editForm.cpf,
                    address: editForm.address,
                }),
            });
            const data = await res.json();
            if (data.ok) {
                const updated = {
                    ...selectedClient,
                    displayName: editForm.displayName,
                    phoneNumber: editForm.phoneNumber,
                    cpf: editForm.cpf,
                    address: editForm.address,
                };
                setSelectedClient(updated);
                setClients(prev => prev.map(c => c.id === selectedClient.id ? updated : c));
                setEditMode(false);
            } else {
                setEditClientError(data.error || 'Erro ao salvar.');
            }
        } catch {
            setEditClientError('Erro de conexão.');
        } finally {
            setEditSavingClient(false);
        }
    };

    const getVendedorNome = (vendedorId: string | null | undefined) => {
        if (!vendedorId) return null;
        return vendedores.find(v => v.id === vendedorId)?.displayName || null;
    };

    const toDateInputValue = (value?: string | null) => {
        const date = value ? new Date(value) : new Date();
        const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
        const year = safeDate.getFullYear();
        const month = String(safeDate.getMonth() + 1).padStart(2, '0');
        const day = String(safeDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const openAssignPlanModal = (client: CRMClient) => {
        setAssignError(null);
        setAssignModal({
            client,
            planId: plans[0]?.id ?? '',
            startDate: toDateInputValue(client.expiresAt),
        });
    };

    const handleAssignPlan = async () => {
        if (!assignModal || !assignModal.planId) return;
        const selectedPlan = plans.find(plan => plan.id === assignModal.planId);
        const requiresStartDate = selectedPlan?.type === 'monthly';

        if (requiresStartDate && !assignModal.startDate) {
            setAssignError('Informe a data de início do plano.');
            return;
        }

        setAssigning(true);
        setAssignError(null);
        try {
            const res = await fetch('/api/admin/crm', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    userId: assignModal.client.id, 
                    planId: assignModal.planId,
                    paymentFrequency: assignModal.paymentFrequency || 'monthly',
                    activationMethod: assignModal.planId === '__gratis__' ? undefined : (assignModal.activationMethod || 'manual'),
                    paymentMethod: assignModal.paymentMethod || 'pix',
                    startDate: requiresStartDate ? assignModal.startDate : undefined,
                }),
            });
            const text = await res.text();
            let data: any;
            try { data = JSON.parse(text); } catch { data = { error: text || `Erro ${res.status}` }; }
            if (data.ok) {
                setAssignModal(null);
                reloadClients();
                if (selectedClient?.id === assignModal.client.id) setSelectedClient(null);
            } else {
                setAssignError(data.error || 'Erro ao atribuir plano.');
            }
        } catch (err: any) {
            setAssignError(err?.message || 'Erro de conexão.');
        } finally {
            setAssigning(false);
        }
    };

    const handleChargeCard = async (client: CRMClient) => {
        if (!confirm(`Confirmar cobrança no cartão •••• de ${client.displayName}?\n\nIsso irá renovar o plano atual.`)) return;
        setChargingId(client.id);
        setChargeResult(null);
        try {
            const res = await fetch('/api/admin/crm/charge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: client.id }),
            });
            const data = await res.json();
            if (data.ok) {
                setChargeResult({ clientId: client.id, ok: true, msg: 'Cobrança aprovada! Plano renovado.' });
                reloadClients();
                if (selectedClient?.id === client.id) setSelectedClient(null);
            } else {
                setChargeResult({ clientId: client.id, ok: false, msg: data.error || 'Cobrança recusada.' });
            }
        } catch {
            setChargeResult({ clientId: client.id, ok: false, msg: 'Erro de conexão.' });
        } finally {
            setChargingId(null);
        }
    };

    const loadInvitesForClient = async (clientEmail: string) => {
        setInvitesLoading(true);
        try {
            const res = await fetch(`/api/admin/crm/invites?email=${encodeURIComponent(clientEmail)}`);
            const data = await res.json();
            setInvites(Array.isArray(data) ? data : []);
        } catch { setInvites([]); }
        finally { setInvitesLoading(false); }
    };

    const handleSendInviteFromCRM = async () => {
        if (!inviteModal) return;
        if (!inviteForm.nome.trim()) { setInviteFeedback({ type: 'error', msg: 'Nome é obrigatório.' }); return; }
        if (!inviteForm.email.trim()) { setInviteFeedback({ type: 'error', msg: 'E-mail é obrigatório.' }); return; }
        setInviteSending(true);
        setInviteFeedback(null);
        setTempPassword(null);
        try {
            const res = await fetch('/api/admin/crm/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...inviteForm, inviterEmail: inviteModal.client.email }),
            });
            const data = await res.json();
            if (res.ok) {
                setTempPassword(data.tempPassword);
                setInviteForm({ nome: '', email: '', telefone: '' });
                loadInvitesForClient(inviteModal.client.email);
            } else {
                setInviteFeedback({ type: 'error', msg: data.error || 'Erro ao adicionar convidado.' });
            }
        } catch {
            setInviteFeedback({ type: 'error', msg: 'Erro de conexão.' });
        } finally {
            setInviteSending(false);
        }
    };

    const handleCancelInviteCRM = async (id: string) => {
        if (!inviteModal || !confirm('Remover este convidado?')) return;
        try {
            await fetch(`/api/admin/crm/invites?id=${id}`, { method: 'DELETE' });
            loadInvitesForClient(inviteModal.client.email);
        } catch { /* ignore */ }
    };

    const handleReactivateInviteCRM = async (id: string) => {
        if (!inviteModal) return;
        try {
            const res = await fetch('/api/admin/crm/invites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, reactivate: true }),
            });
            const text = await res.text();
            let data: any;
            try { data = JSON.parse(text); } catch { data = { error: text || `Erro ${res.status}` }; }
            if (data.ok) {
                setInviteFeedback({ type: 'success', msg: 'Convidado reativado com sucesso!' });
                loadInvitesForClient(inviteModal.client.email);
            } else {
                setInviteFeedback({ type: 'error', msg: data.error || 'Erro ao reativar.' });
            }
        } catch (err: any) {
            setInviteFeedback({ type: 'error', msg: err?.message || 'Erro de conexão.' });
        }
    };

    const handleEditInviteCRM = async () => {
        if (!editingInvite || !inviteModal) return;
        setEditSaving(true);
        setInviteFeedback(null);
        try {
            const res = await fetch('/api/admin/crm/invites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: editingInvite.id,
                    nome: editingInvite.nome,
                    email: editingInvite.email,
                    telefone: editingInvite.telefone,
                }),
            });
            const data = await res.json();
            if (data.ok) {
                setEditingInvite(null);
                setInviteFeedback({ type: 'success', msg: 'Convidado atualizado com sucesso!' });
                loadInvitesForClient(inviteModal.client.email);
            } else {
                setInviteFeedback({ type: 'error', msg: data.error || 'Erro ao atualizar.' });
            }
        } catch {
            setInviteFeedback({ type: 'error', msg: 'Erro de conexão.' });
        } finally {
            setEditSaving(false);
        }
    };

    const handleCreateClient = async () => {
        if (!createForm.nome.trim()) { setCreateFeedback({ type: 'error', msg: 'Nome é obrigatório.' }); return; }
        if (!createForm.email.trim()) { setCreateFeedback({ type: 'error', msg: 'E-mail é obrigatório.' }); return; }
        setCreateSending(true);
        setCreateFeedback(null);
        setCreatedPassword(null);
        try {
            const res = await fetch('/api/admin/crm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(createForm),
            });
            const data = await res.json();
            if (res.ok) {
                setCreatedPassword(data.tempPassword);
                setCreateForm({ nome: '', email: '', telefone: '', cpf: '' });
                reloadClients();
            } else {
                setCreateFeedback({ type: 'error', msg: data.error || 'Erro ao criar cliente.' });
            }
        } catch {
            setCreateFeedback({ type: 'error', msg: 'Erro de conexão.' });
        } finally {
            setCreateSending(false);
        }
    };

    const filtered = useMemo(() => {
        let list = [...clients];

        if (filterTab === 'cortesia') {
            list = list.filter(c => c.activationMethod === 'cortesia' && c.status === 'active');
        } else if (filterTab !== 'all') {
            list = list.filter(c => c.status === filterTab);
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            list = list.filter(c =>
                c.displayName.toLowerCase().includes(q) ||
                c.email.toLowerCase().includes(q) ||
                (c.phoneNumber && c.phoneNumber.includes(q))
            );
        }

        list.sort((a, b) => {
            let va: any, vb: any;
            if (sortKey === 'createdAt') {
                va = new Date(a.createdAt).getTime();
                vb = new Date(b.createdAt).getTime();
            } else if (sortKey === 'displayName') {
                va = a.displayName.toLowerCase();
                vb = b.displayName.toLowerCase();
            } else if (sortKey === 'daysUntilExpiry') {
                va = a.daysUntilExpiry ?? 9999;
                vb = b.daysUntilExpiry ?? 9999;
            } else if (sortKey === 'status') {
                const order = { expired: 0, no_plan: 1, active: 2 };
                va = order[a.status];
                vb = order[b.status];
            }
            if (va < vb) return sortAsc ? -1 : 1;
            if (va > vb) return sortAsc ? 1 : -1;
            return 0;
        });

        return list;
    }, [clients, filterTab, search, sortKey, sortAsc]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortAsc(p => !p);
        else { setSortKey(key); setSortAsc(true); }
    };

    const sortIcon = (key: SortKey) => sortKey === key ? (sortAsc ? ' ▲' : ' ▼') : '';

    const formatDate = (iso: string | null) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('pt-BR');
    };

    const getPaymentInfo = (client: CRMClient): PaymentInfo | null => {
        if (client.status !== 'active' && client.status !== 'expired') return null;
        if (client.activationMethod === 'cortesia') return { kind: 'courtesy', label: '🎁 Cortesia' };
        if (client.paymentMethod === 'pix' || client.activationMethod === 'pix') return { kind: 'pix', label: 'PIX' };
        if (client.paymentMethod === 'boleto' || client.activationMethod === 'boleto') return { kind: 'boleto', label: 'Boleto' };
        if (client.paymentMethod === 'card' || client.activationMethod === 'card') return { kind: 'card', label: 'Cartão' };
        return { kind: 'unlinked', label: 'Não associado' };
    };

    const selectedAssignPlan = assignModal
        ? plans.find(plan => plan.id === assignModal.planId)
        : null;
    const assignPlanRequiresStartDate = selectedAssignPlan?.type === 'monthly';

    const whatsappLink = (phone: string, name: string, status: CRMClient['status']) => {
        const clean = phone.replace(/\D/g, '');
        if (!clean) return null;
        let msg = '';
        if (status === 'no_plan') {
            msg = encodeURIComponent(`Olá ${name}, vi que você se cadastrou em nossa plataforma. Posso te ajudar a encontrar o plano ideal?`);
        } else if (status === 'expired') {
            msg = encodeURIComponent(`Olá ${name}, seu plano na ZeroKM expirou. Que tal renovar e continuar com acesso completo?`);
        } else {
            msg = encodeURIComponent(`Olá ${name}, tudo bem?`);
        }
        return `https://wa.me/55${clean}?text=${msg}`;
    };

    const emailLink = (email: string, name: string, status: CRMClient['status']) => {
        let subject = '', body = '';
        if (status === 'no_plan') {
            subject = encodeURIComponent('Bem-vindo à ZeroKM — conheça nossos planos');
            body = encodeURIComponent(`Olá ${name},\n\nVimos que você se cadastrou em nossa plataforma e gostaríamos de apresentar nossos planos para acesso completo.\n\nAcesse: ${window.location.origin}/dashboard/cliente\n\nAtenciosamente,\nEquipe ZeroKM`);
        } else if (status === 'expired') {
            subject = encodeURIComponent('Renove seu plano ZeroKM');
            body = encodeURIComponent(`Olá ${name},\n\nSeu plano expirou. Renove agora para continuar aproveitando todos os recursos.\n\nAtenciosamente,\nEquipe ZeroKM`);
        }
        return `mailto:${email}?subject=${subject}&body=${body}`;
    };

    if (loading) return <div className={styles.loading}>Carregando CRM...</div>;
    if (error) return <div className={styles.error}>{error}</div>;

    return (
        <div className={styles.container}>
            <div className={styles.pageHeader}>
                <div>
                    <h2 className={styles.title}>CRM de Clientes</h2>
                    <p className={styles.subtitle}>Gerencie clientes ativos, expirados e leads sem plano.</p>
                </div>
                <button
                    className={`${styles.detailBtn} ${styles.btnPlanLg}`}
                    onClick={() => {
                        setCreateModal(true);
                        setCreateForm({ nome: '', email: '', telefone: '', cpf: '' });
                        setCreateFeedback(null);
                        setCreatedPassword(null);
                    }}
                >
                    + Cadastrar novo cliente
                </button>
            </div>

            {/* Summary cards */}
            <div className={styles.summaryGrid}>
                <div className={`${styles.summaryCard} ${styles.cardTotal}`} onClick={() => setFilterTab('all')}>
                    <div className={styles.summaryValue}>{summary.total}</div>
                    <div className={styles.summaryLabel}>Total de clientes</div>
                </div>
                <div className={`${styles.summaryCard} ${styles.cardActive}`} onClick={() => setFilterTab('active')}>
                    <div className={styles.summaryValue}>{summary.active}</div>
                    <div className={styles.summaryLabel}>✅ Plano ativo</div>
                </div>
                <div className={`${styles.summaryCard} ${styles.cardExpired}`} onClick={() => setFilterTab('expired')}>
                    <div className={styles.summaryValue}>{summary.expired}</div>
                    <div className={styles.summaryLabel}>🔴 Expirados</div>
                </div>
                <div className={`${styles.summaryCard} ${styles.cardNoPlan}`} onClick={() => setFilterTab('no_plan')}>
                    <div className={styles.summaryValue}>{summary.no_plan}</div>
                    <div className={styles.summaryLabel}>🎯 Leads sem plano</div>
                </div>
                <div className={`${styles.summaryCard} ${styles.cardCortesia}`} onClick={() => setFilterTab('cortesia')}>
                    <div className={styles.summaryValue}>{summary.cortesia}</div>
                    <div className={styles.summaryLabel}>🎁 Cortesia ativa</div>
                </div>
            </div>

            {/* Filters */}
            <div className={styles.toolbar}>
                <div className={styles.tabs}>
                    {(['all', 'active', 'expired', 'no_plan', 'cortesia'] as FilterTab[]).map(tab => (
                        <button
                            key={tab}
                            className={`${styles.tab} ${filterTab === tab ? styles.tabActive : ''} ${tab === 'cortesia' ? styles.tabCortesia : ''}`}
                            onClick={() => setFilterTab(tab)}
                        >
                            {tab === 'all' ? 'Todos'
                                : tab === 'active' ? 'Ativos'
                                : tab === 'expired' ? 'Expirados'
                                : tab === 'no_plan' ? 'Sem plano'
                                : '🎁 Cortesia'}
                        </button>
                    ))}
                </div>
                <input
                    className={styles.searchInput}
                    type="text"
                    placeholder="Buscar por nome, email ou telefone..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
            </div>

            {/* Client grid */}
            <div className={styles.resultsSection}>
                <div className={styles.clientGridHeader}>
                    <button className={styles.gridSort} onClick={() => handleSort('displayName')}>
                        Cliente{sortIcon('displayName')}
                    </button>
                    <button className={styles.gridSort} onClick={() => handleSort('daysUntilExpiry')}>
                        Assinatura{sortIcon('daysUntilExpiry')}
                    </button>
                    <span className={styles.gridHeaderLabel}>Financeiro</span>
                    <span className={styles.gridHeaderLabel}>Responsável</span>
                    <span className={styles.gridHeaderLabel}>Ação</span>
                </div>

                <div className={styles.clientGridList}>
                    {filtered.length === 0 && (
                        <div className={styles.emptyStateCell}>Nenhum cliente encontrado.</div>
                    )}

                    {filtered.map(client => {
                        const isExpiringSoon = client.status === 'active' && client.daysUntilExpiry !== null && client.daysUntilExpiry <= 7;
                        const rowClass = client.status === 'expired' ? styles.rowExpired
                            : client.status === 'no_plan' ? styles.rowNoPlan
                                : isExpiringSoon ? styles.rowWarn : '';
                        const payment = getPaymentInfo(client);
                        const profileCompletion = client.profileCompletion ?? 0;

                        return (
                            <article
                                key={client.id}
                                className={`${styles.clientGridRow} ${rowClass}`}
                                tabIndex={0}
                                onClick={() => openClientModal(client)}
                                onKeyDown={event => {
                                    if (event.target !== event.currentTarget) return;
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        openClientModal(client);
                                    }
                                }}
                                aria-label={`Abrir detalhes de ${client.displayName || client.email}`}
                            >
                                <div className={styles.gridIdentity}>
                                    <div className={styles.clientNameRow}>
                                        <span className={styles.nameText}>{client.displayName || '(sem nome)'}</span>
                                        {(client.status === 'expired' || client.status === 'no_plan') && (
                                            <span className={styles.alertDot} title={client.status === 'expired' ? 'Plano expirado' : 'Sem plano'}>●</span>
                                        )}
                                        {isExpiringSoon && <span className={styles.warnDot} title={`Expira em ${client.daysUntilExpiry} dia(s)`}>⚠️</span>}
                                    </div>
                                    <span className={styles.clientEmail}>{client.email}</span>
                                    <div className={styles.clientMetaRow}>
                                        {client.phoneNumber && <span className={styles.phone}>{client.phoneNumber}</span>}
                                        {whatsappLink(client.phoneNumber, client.displayName, client.status) && (
                                            <a
                                                href={whatsappLink(client.phoneNumber, client.displayName, client.status)!}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={`${styles.actionBtn} ${styles.btnWhatsapp} ${styles.whatsappAction}`}
                                                title="Abrir conversa no WhatsApp"
                                                onClick={event => event.stopPropagation()}
                                            >
                                                <svg viewBox="0 0 32 32" width="12" height="12" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                                                    <circle cx="16" cy="16" r="16" fill="#25D366" />
                                                    <path d="M22.9 9.1A9.7 9.7 0 0 0 16 6.4a9.7 9.7 0 0 0-8.4 14.6L6.4 25.6l4.7-1.2a9.7 9.7 0 0 0 4.9 1.3 9.7 9.7 0 0 0 9.7-9.7 9.7 9.7 0 0 0-2.8-6.9zm-6.9 14.9a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3a8 8 0 0 1-1.2-4.3 8 8 0 0 1 8-8 8 8 0 0 1 5.7 2.4 8 8 0 0 1 2.3 5.7 8 8 0 0 1-8 7.9zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.8 1-.1.1-.3.1-.5 0a6.4 6.4 0 0 1-1.9-1.2 7.1 7.1 0 0 1-1.3-1.6c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3a2.6 2.6 0 0 0-.8 1.9c0 1.1.8 2.2.9 2.4.1.1 1.5 2.4 3.8 3.3.5.2.9.3 1.2.4.5.1 1 .1 1.4 0 .4-.1 1.3-.5 1.5-1.1.2-.5.2-1 .1-1.1-.1-.1-.3-.2-.5-.3z" fill="#fff" />
                                                </svg>
                                            </a>
                                        )}
                                        <div className={styles.profileMeta} title={`Perfil ${profileCompletion}% completo`}>
                                            <span className={styles.profileTrack}><span className={styles.profileFill} style={{ width: `${profileCompletion}%` }} /></span>
                                            <span>{profileCompletion}%</span>
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.gridSubscription}>
                                    <span className={styles.mobileLabel}>Assinatura</span>
                                    <div className={styles.subscriptionHeading}>
                                        <span className={styles.statusBadge} style={{ background: STATUS_COLORS[client.status] + '22', color: STATUS_COLORS[client.status], border: `1px solid ${STATUS_COLORS[client.status]}` }}>
                                            {STATUS_LABELS[client.status]}
                                        </span>
                                        {client.billingType === 'annual' && <span className={styles.billingBadge}>Anual</span>}
                                    </div>
                                    <strong className={styles.planName}>{client.planName || 'Nenhum plano atribuído'}</strong>
                                    <span className={`${styles.accessMeta} ${client.status === 'expired' ? styles.accessExpired : isExpiringSoon ? styles.accessWarning : ''}`}>
                                        {client.planType === 'credits'
                                            ? `${client.credits} créditos disponíveis`
                                            : client.expiresAt
                                                ? `${client.status === 'expired' ? 'Expirou' : 'Expira'} em ${formatDate(client.expiresAt)}${client.daysUntilExpiry !== null ? ` · ${client.daysUntilExpiry >= 0 ? `${client.daysUntilExpiry}d restantes` : `${Math.abs(client.daysUntilExpiry)}d atrás`}` : ''}`
                                                : 'Sem data de expiração'}
                                    </span>
                                </div>

                                <div className={styles.gridPayment}>
                                    <span className={styles.mobileLabel}>Financeiro</span>
                                    {payment ? (
                                        <>
                                            <span className={styles.paymentBadge} data-payment={payment.kind}>{payment.label}</span>
                                            <span className={styles.paymentMeta}>{client.billingType === 'annual' ? 'Recorrência anual' : 'Recorrência mensal'}</span>
                                        </>
                                    ) : (
                                        <span className={styles.muted}>Sem pagamento</span>
                                    )}
                                </div>

                                <div className={styles.gridSeller} onClick={event => event.stopPropagation()}>
                                    <label className={styles.mobileLabel} htmlFor={`seller-${client.id}`}>Responsável</label>
                                    <select
                                        id={`seller-${client.id}`}
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
                                </div>

                                <div className={styles.gridActions} onClick={event => event.stopPropagation()}>
                                    <button className={styles.detailsButton} onClick={() => openClientModal(client)}>
                                        Ver detalhes <span aria-hidden="true">→</span>
                                    </button>
                                    {chargeResult?.clientId === client.id && (
                                        <div className={chargeResult.ok ? styles.chargeOk : styles.chargeErr}>{chargeResult.msg}</div>
                                    )}
                                </div>
                            </article>
                        );
                    })}
                </div>
            </div>

            {/* Client Detail Modal */}
            {selectedClient && (
                <div className={styles.overlay} onClick={() => setSelectedClient(null)}>
                    <div className={styles.clientModal} onClick={e => e.stopPropagation()}>

                        {/* Header */}
                        <div className={styles.clientModalHeader}>
                            <div className={styles.clientModalAvatar}>
                                {(selectedClient.displayName || selectedClient.email)[0].toUpperCase()}
                            </div>
                            <div className={styles.clientModalHeaderInfo}>
                                <h3 className={styles.clientModalName}>{selectedClient.displayName || '(sem nome)'}</h3>
                                <div className={styles.clientModalSubInfo}>
                                    <span>{selectedClient.email}</span>
                                    {selectedClient.phoneNumber && <span>• {selectedClient.phoneNumber}</span>}
                                </div>
                                <span className={styles.statusBadge} style={{ background: STATUS_COLORS[selectedClient.status] + '22', color: STATUS_COLORS[selectedClient.status], border: `1px solid ${STATUS_COLORS[selectedClient.status]}` }}>
                                    {STATUS_LABELS[selectedClient.status]}
                                </span>
                            </div>
                            <button className={styles.closeBtn} onClick={() => setSelectedClient(null)}>✕</button>
                        </div>

                        {/* Tabs */}
                        <div className={styles.clientModalTabs}>
                            <button
                                className={`${styles.clientModalTab} ${modalTab === 'dados' ? styles.clientModalTabActive : ''}`}
                                onClick={() => setModalTab('dados')}
                            >
                                Dados do Cliente
                            </button>
                            <button
                                className={`${styles.clientModalTab} ${modalTab === 'assinatura' ? styles.clientModalTabActive : ''}`}
                                onClick={() => setModalTab('assinatura')}
                            >
                                Assinatura & Ações
                            </button>
                        </div>

                        {/* Body */}
                        <div className={styles.clientModalBody}>

                            {/* ── Dados tab ── */}
                            {modalTab === 'dados' && (
                                <div>
                                    {/* Personal info */}
                                    <div className={styles.clientSection}>
                                        <div className={styles.clientSectionHeader}>
                                            <span className={styles.clientSectionTitle}>Informações Pessoais</span>
                                            {!editMode && (
                                                <button className={styles.editToggleBtn} onClick={() => startEditClient(selectedClient)}>
                                                    ✏️ Editar
                                                </button>
                                            )}
                                        </div>
                                        <div className={styles.clientFormGrid}>
                                            <div className={styles.clientFormField}>
                                                <label className={styles.clientFormLabel}>Nome</label>
                                                {editMode ? (
                                                    <input className={styles.planSelect} value={editForm?.displayName || ''} onChange={e => setEditForm(f => f ? { ...f, displayName: e.target.value } : f)} />
                                                ) : (
                                                    <span className={styles.clientFormValue}>{selectedClient.displayName || '—'}</span>
                                                )}
                                            </div>
                                            <div className={styles.clientFormField}>
                                                <label className={styles.clientFormLabel}>CPF / CNPJ</label>
                                                {editMode ? (
                                                    <input className={styles.planSelect} value={editForm?.cpf || ''} onChange={e => setEditForm(f => f ? { ...f, cpf: e.target.value } : f)} placeholder="000.000.000-00" />
                                                ) : (
                                                    <span className={styles.clientFormValue}>{selectedClient.cpf || '—'}</span>
                                                )}
                                            </div>
                                            <div className={styles.clientFormField}>
                                                <label className={styles.clientFormLabel}>Telefone</label>
                                                {editMode ? (
                                                    <input className={styles.planSelect} value={editForm?.phoneNumber || ''} onChange={e => setEditForm(f => f ? { ...f, phoneNumber: e.target.value } : f)} placeholder="(11) 99999-9999" />
                                                ) : (
                                                    <span className={styles.clientFormValue}>{selectedClient.phoneNumber || '—'}</span>
                                                )}
                                            </div>
                                            <div className={styles.clientFormField}>
                                                <label className={styles.clientFormLabel}>Email</label>
                                                <span className={styles.clientFormValue} style={{ color: 'var(--color-text-muted)' }}>{selectedClient.email}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Address */}
                                    <div className={styles.clientSection}>
                                        <div className={styles.clientSectionHeader}>
                                            <span className={styles.clientSectionTitle}>Endereço</span>
                                        </div>
                                        <div className={styles.clientFormGrid}>
                                            <div className={styles.clientFormField}>
                                                <label className={styles.clientFormLabel}>CEP</label>
                                                {editMode ? (
                                                    <input className={styles.planSelect} value={editForm?.address.zipCode || ''} onChange={e => handleCepChange(e.target.value)} placeholder="00000-000" />
                                                ) : (
                                                    <span className={styles.clientFormValue}>{selectedClient.address?.zipCode || '—'}</span>
                                                )}
                                            </div>
                                            <div className={styles.clientFormField}>
                                                <label className={styles.clientFormLabel}>Estado</label>
                                                {editMode ? (
                                                    <input className={styles.planSelect} value={editForm?.address.state || ''} onChange={e => setEditForm(f => f ? { ...f, address: { ...f.address, state: e.target.value } } : f)} placeholder="SP" maxLength={2} />
                                                ) : (
                                                    <span className={styles.clientFormValue}>{selectedClient.address?.state || '—'}</span>
                                                )}
                                            </div>
                                            <div className={`${styles.clientFormField} ${styles.spanFull}`}>
                                                <label className={styles.clientFormLabel}>Rua</label>
                                                {editMode ? (
                                                    <input className={styles.planSelect} value={editForm?.address.street || ''} onChange={e => setEditForm(f => f ? { ...f, address: { ...f.address, street: e.target.value } } : f)} placeholder="Av. Paulista" />
                                                ) : (
                                                    <span className={styles.clientFormValue}>{selectedClient.address?.street || '—'}</span>
                                                )}
                                            </div>
                                            <div className={styles.clientFormField}>
                                                <label className={styles.clientFormLabel}>Número</label>
                                                {editMode ? (
                                                    <input className={styles.planSelect} value={editForm?.address.number || ''} onChange={e => setEditForm(f => f ? { ...f, address: { ...f.address, number: e.target.value } } : f)} placeholder="123" />
                                                ) : (
                                                    <span className={styles.clientFormValue}>{selectedClient.address?.number || '—'}</span>
                                                )}
                                            </div>
                                            <div className={styles.clientFormField}>
                                                <label className={styles.clientFormLabel}>Complemento</label>
                                                {editMode ? (
                                                    <input className={styles.planSelect} value={editForm?.address.complement || ''} onChange={e => setEditForm(f => f ? { ...f, address: { ...f.address, complement: e.target.value } } : f)} placeholder="Apto 42" />
                                                ) : (
                                                    <span className={styles.clientFormValue}>{selectedClient.address?.complement || '—'}</span>
                                                )}
                                            </div>
                                            <div className={styles.clientFormField}>
                                                <label className={styles.clientFormLabel}>Bairro</label>
                                                {editMode ? (
                                                    <input className={styles.planSelect} value={editForm?.address.neighborhood || ''} onChange={e => setEditForm(f => f ? { ...f, address: { ...f.address, neighborhood: e.target.value } } : f)} placeholder="Bela Vista" />
                                                ) : (
                                                    <span className={styles.clientFormValue}>{selectedClient.address?.neighborhood || '—'}</span>
                                                )}
                                            </div>
                                            <div className={styles.clientFormField}>
                                                <label className={styles.clientFormLabel}>Cidade</label>
                                                {editMode ? (
                                                    <input className={styles.planSelect} value={editForm?.address.city || ''} onChange={e => setEditForm(f => f ? { ...f, address: { ...f.address, city: e.target.value } } : f)} placeholder="São Paulo" />
                                                ) : (
                                                    <span className={styles.clientFormValue}>{selectedClient.address?.city || '—'}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Profile completion */}
                                    <div className={styles.clientSection}>
                                        <div className={styles.clientSectionHeader}>
                                            <span className={styles.clientSectionTitle}>Perfil Preenchido</span>
                                            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: selectedClient.profileCompletion < 40 ? 'var(--color-negative)' : selectedClient.profileCompletion < 100 ? '#f59e0b' : 'var(--color-positive)' }}>
                                                {selectedClient.profileCompletion}%
                                            </span>
                                        </div>
                                        <div className={styles.completionBarWrap}>
                                            <div className={styles.completionBarFill} style={{
                                                width: `${selectedClient.profileCompletion}%`,
                                                background: selectedClient.profileCompletion < 40 ? 'var(--color-negative)' : selectedClient.profileCompletion < 100 ? '#f59e0b' : 'var(--color-positive)',
                                            }} />
                                        </div>
                                    </div>

                                    {/* Edit actions */}
                                    {editMode && (
                                        <div>
                                            {editClientError && (
                                                <p style={{ color: 'var(--color-negative)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{editClientError}</p>
                                            )}
                                            <div className={styles.detailActions}>
                                                <button
                                                    className={styles.detailBtn}
                                                    style={{ flex: 1, background: 'var(--color-highlight)', color: 'var(--color-text)', border: '1px solid var(--color-highlight)' }}
                                                    onClick={() => setEditMode(false)}
                                                    disabled={editSavingClient}
                                                >
                                                    Cancelar
                                                </button>
                                                <button
                                                    className={`${styles.detailBtn} ${styles.btnPlanLg}`}
                                                    disabled={editSavingClient}
                                                    onClick={handleSaveClientEdit}
                                                >
                                                    {editSavingClient ? 'Salvando...' : '💾 Salvar'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* ── Assinatura tab ── */}
                            {modalTab === 'assinatura' && (
                                <div>
                                    <div className={styles.clientSection}>
                                        <div className={styles.clientSectionHeader}>
                                            <span className={styles.clientSectionTitle}>Assinatura</span>
                                        </div>
                                        <div className={styles.clientFormGrid}>
                                            <div className={`${styles.clientFormField} ${styles.spanFull}`}>
                                                <label className={styles.clientFormLabel}>Plano</label>
                                                <span className={styles.clientFormValue} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    {selectedClient.planName
                                                        ? `${selectedClient.planName} (${selectedClient.planType === 'monthly' ? (selectedClient.billingType === 'annual' ? 'anual' : 'mensal') : 'créditos'})`
                                                        : '—'}
                                                    {selectedClient.billingType === 'annual' && selectedClient.planType === 'monthly' && (
                                                        <span className={styles.cortesiaBadge} style={{ background: 'rgba(16,185,129,0.12)', color: '#10b981', borderColor: 'rgba(16,185,129,0.3)' }}>Anual</span>
                                                    )}
                                                    {selectedClient.activationMethod === 'cortesia' && (
                                                        <span className={styles.cortesiaBadge}>🎁 Cortesia</span>
                                                    )}
                                                    {selectedClient.activationMethod === 'boleto' && (
                                                        <span className={styles.cortesiaBadge} style={{ background: 'rgba(100,116,139,0.12)', color: '#94a3b8', borderColor: 'rgba(100,116,139,0.3)' }}>Boleto</span>
                                                    )}
                                                </span>
                                            </div>
                                            <div className={styles.clientFormField}>
                                                <label className={styles.clientFormLabel}>Status</label>
                                                <span className={styles.statusBadge} style={{ background: STATUS_COLORS[selectedClient.status] + '22', color: STATUS_COLORS[selectedClient.status], border: `1px solid ${STATUS_COLORS[selectedClient.status]}`, width: 'fit-content' }}>
                                                    {STATUS_LABELS[selectedClient.status]}
                                                </span>
                                            </div>
                                            <div className={styles.clientFormField}>
                                                <label className={styles.clientFormLabel}>Expira em</label>
                                                <span className={styles.clientFormValue} style={{ color: selectedClient.status === 'expired' ? 'var(--color-negative)' : (selectedClient.daysUntilExpiry !== null && selectedClient.daysUntilExpiry <= 7) ? '#f59e0b' : 'inherit' }}>
                                                    {formatDate(selectedClient.expiresAt)}
                                                    {selectedClient.daysUntilExpiry !== null && (
                                                        <span className={styles.daysHint}>
                                                            {selectedClient.daysUntilExpiry >= 0 ? ` (${selectedClient.daysUntilExpiry}d)` : ` (há ${Math.abs(selectedClient.daysUntilExpiry)}d)`}
                                                        </span>
                                                    )}
                                                </span>
                                            </div>
                                            <div className={styles.clientFormField}>
                                                <label className={styles.clientFormLabel}>Créditos avulsos</label>
                                                <span className={styles.clientFormValue}>
                                                    {selectedClient.credits > 0 ? <span className={styles.credits}>{selectedClient.credits}</span> : '0'}
                                                </span>
                                            </div>
                                            <div className={styles.clientFormField}>
                                                <label className={styles.clientFormLabel}>Vendedor</label>
                                                <span className={styles.clientFormValue}>{getVendedorNome(selectedClient.vendedorId) || '—'}</span>
                                            </div>
                                            <div className={styles.clientFormField}>
                                                <label className={styles.clientFormLabel}>Cadastrado em</label>
                                                <span className={styles.clientFormValue}>{formatDate(selectedClient.createdAt)}</span>
                                            </div>
                                            {selectedClient.hasCard && (
                                                <div className={styles.clientFormField}>
                                                    <label className={styles.clientFormLabel}>Cartão</label>
                                                    <span className={styles.clientFormValue}>
                                                        {selectedClient.cardBrand ? `${selectedClient.cardBrand} ` : ''}
                                                        {selectedClient.cardLastFour ? `•••• ${selectedClient.cardLastFour}` : 'Cadastrado'}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className={styles.clientSection}>
                                        <div className={styles.clientSectionHeader}>
                                            <span className={styles.clientSectionTitle}>Ações</span>
                                        </div>
                                        <div className={styles.clientActionsGrid}>
                                            {whatsappLink(selectedClient.phoneNumber, selectedClient.displayName, selectedClient.status) && (
                                                <a
                                                    href={whatsappLink(selectedClient.phoneNumber, selectedClient.displayName, selectedClient.status)!}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`${styles.detailBtn} ${styles.btnWhatsappLg}`}
                                                >
                                                    <svg viewBox="0 0 32 32" width="14" height="14" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '6px', verticalAlign: 'middle' }}>
                                                        <circle cx="16" cy="16" r="16" fill="#25D366" />
                                                        <path d="M22.9 9.1A9.7 9.7 0 0 0 16 6.4a9.7 9.7 0 0 0-8.4 14.6L6.4 25.6l4.7-1.2a9.7 9.7 0 0 0 4.9 1.3 9.7 9.7 0 0 0 9.7-9.7 9.7 9.7 0 0 0-2.8-6.9zm-6.9 14.9a8 8 0 0 1-4.1-1.1l-.3-.2-3 .8.8-2.9-.2-.3a8 8 0 0 1-1.2-4.3 8 8 0 0 1 8-8 8 8 0 0 1 5.7 2.4 8 8 0 0 1 2.3 5.7 8 8 0 0 1-8 7.9zm4.4-6c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1-.2.2-.6.8-.8 1-.1.1-.3.1-.5 0a6.4 6.4 0 0 1-1.9-1.2 7.1 7.1 0 0 1-1.3-1.6c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.8c-.2-.5-.4-.4-.5-.4h-.5c-.2 0-.4.1-.6.3a2.6 2.6 0 0 0-.8 1.9c0 1.1.8 2.2.9 2.4.1.1 1.5 2.4 3.8 3.3.5.2.9.3 1.2.4.5.1 1 .1 1.4 0 .4-.1 1.3-.5 1.5-1.1.2-.5.2-1 .1-1.1-.1-.1-.3-.2-.5-.3z" fill="#fff" />
                                                    </svg>
                                                    WhatsApp
                                                </a>
                                            )}
                                            <a
                                                href={emailLink(selectedClient.email, selectedClient.displayName, selectedClient.status)}
                                                className={`${styles.detailBtn} ${styles.btnEmailLg}`}
                                            >
                                                ✉️ Enviar Email
                                            </a>
                                            {!selectedClient.isInvitee && (
                                                <button
                                                    className={`${styles.detailBtn} ${styles.btnPlanLg}`}
                                                    onClick={() => {
                                                        openAssignPlanModal(selectedClient);
                                                        setSelectedClient(null);
                                                    }}
                                                >
                                                    📋 Atribuir Plano
                                                </button>
                                            )}
                                            {!selectedClient.isInvitee && (
                                                <button
                                                    className={`${styles.detailBtn} ${styles.btnPlanLg}`}
                                                    onClick={() => {
                                                        setInviteModal({ client: selectedClient });
                                                        setInviteForm({ nome: '', email: '', telefone: '' });
                                                        setInviteFeedback(null);
                                                        setTempPassword(null);
                                                        loadInvitesForClient(selectedClient.email);
                                                        setSelectedClient(null);
                                                    }}
                                                >
                                                    👥 Gerenciar Convidados
                                                    {selectedClient.inviteCount > 0 && ` (${selectedClient.inviteCount})`}
                                                </button>
                                            )}
                                            {selectedClient.status === 'expired' && selectedClient.hasCard && (
                                                <button
                                                    className={`${styles.detailBtn} ${styles.btnChargeLg}`}
                                                    disabled={chargingId === selectedClient.id}
                                                    onClick={() => {
                                                        const c = selectedClient;
                                                        setSelectedClient(null);
                                                        handleChargeCard(c);
                                                    }}
                                                >
                                                    {chargingId === selectedClient.id ? '⏳ Processando...' : '💳 Cobrar Cartão'}
                                                </button>
                                            )}
                                            {selectedClient.profileCompletion < 100 && (
                                                <a
                                                    href={`mailto:${selectedClient.email}?subject=${encodeURIComponent('Complete seu cadastro na ZeroKM')}&body=${encodeURIComponent(`Olá ${selectedClient.displayName || ''},\n\nSeu cadastro na plataforma ZeroKM está ${selectedClient.profileCompletion}% completo. Para aproveitar todos os recursos, por favor finalize seu perfil em: ${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard/profile\n\nAtenciosamente,\nEquipe ZeroKM`)}`}
                                                    className={`${styles.detailBtn} ${styles.btnProfileLg}`}
                                                    onClick={() => setSelectedClient(null)}
                                                >
                                                    📩 Solicitar Conclusão ({selectedClient.profileCompletion}%)
                                                </a>
                                            )}
                                        </div>
                                    </div>

                                    {selectedClient.status === 'no_plan' && (
                                        <div className={styles.conversionTip}>
                                            <strong>🎯 Dica de conversão:</strong> Este cliente se cadastrou mas ainda não assinou nenhum plano. Entre em contato e ofereça um período de teste ou desconto.
                                        </div>
                                    )}
                                    {selectedClient.status === 'expired' && (
                                        <div className={styles.renewalTip}>
                                            <strong>🔄 Oportunidade de renovação:</strong> Plano expirado há {selectedClient.daysUntilExpiry !== null ? Math.abs(selectedClient.daysUntilExpiry) : '?'} dia(s). Excelente momento para reativar.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Assign Plan Modal */}
            {assignModal && (
                <div className={styles.overlay} onClick={() => setAssignModal(null)}>
                    <div className={styles.detailPanel} onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
                        <button className={styles.closeBtn} onClick={() => setAssignModal(null)}>✕</button>
                        <h3 className={styles.detailName} style={{ marginBottom: '0.25rem' }}>📋 Atribuir Plano</h3>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                            {assignModal.client.displayName || assignModal.client.email}
                        </p>

                        <div style={{ marginBottom: '1.25rem' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Plano
                            </label>
                            <select
                                className={styles.planSelect}
                                value={assignModal.planId}
                                onChange={e => setAssignModal({ ...assignModal, planId: e.target.value })}
                            >
                                <option value="">Selecione um plano...</option>
                                <option value="__gratis__">🔓 Grátis (sem plano)</option>
                                {plans.map(p => {
                                    const isAnnual = assignModal.paymentFrequency === 'annual';
                                    const displayPrice = isAnnual && p.annualPrice ? p.annualPrice : p.price;
                                    return (
                                        <option key={p.id} value={p.id}>
                                            {p.name} — R$ {displayPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            {p.type === 'monthly' ? (isAnnual ? ' (ano)' : ' (mês)') : ` (${p.credits} créditos)`}
                                        </option>
                                    );
                                })}
                            </select>
                        </div>

                        {assignModal.planId && assignModal.planId !== '__gratis__' && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Recorrência de Pagamento
                                </label>
                                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                        <input 
                                            type="radio" 
                                            name="paymentFrequency" 
                                            value="monthly" 
                                            checked={assignModal.paymentFrequency !== 'annual'}
                                            onChange={() => setAssignModal({ ...assignModal, paymentFrequency: 'monthly' })}
                                        />
                                        <span>Mensal (30 dias)</span>
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.9rem' }}>
                                        <input 
                                            type="radio" 
                                            name="paymentFrequency" 
                                            value="annual" 
                                            checked={assignModal.paymentFrequency === 'annual'}
                                            onChange={() => setAssignModal({ ...assignModal, paymentFrequency: 'annual' })}
                                        />
                                        <span>Anual (365 dias)</span>
                                    </label>
                                </div>
                            </div>
                        )}

                        {assignPlanRequiresStartDate && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label htmlFor="plan-start-date" style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Data de início do plano
                                </label>
                                <input
                                    id="plan-start-date"
                                    className={styles.planSelect}
                                    type="date"
                                    value={assignModal.startDate}
                                    onChange={event => setAssignModal({ ...assignModal, startDate: event.target.value })}
                                    required
                                />
                                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem', margin: '0.4rem 0 0' }}>
                                    {assignModal.client.expiresAt
                                        ? 'Preenchida com a expiração atual do cliente. Ajuste para a data em que o pagamento foi recebido, se necessário.'
                                        : 'Preenchida com a data de hoje. Ajuste para a data em que o pagamento foi recebido, se necessário.'}
                                </p>
                            </div>
                        )}

                        {assignModal.planId && assignModal.planId !== '__gratis__' && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Origem da Ativação (Financeiro)
                                </label>
                                <select
                                    className={styles.planSelect}
                                    value={assignModal.activationMethod || 'manual'}
                                    onChange={e => setAssignModal({ ...assignModal, activationMethod: e.target.value as 'manual' | 'cortesia' })}
                                >
                                    <option value="manual">💰 Recebimento Externo (Gera extrato do valor integral do plano)</option>
                                    <option value="cortesia">🎁 Cortesia / Bonificação (Gera extrato gratuito de R$ 0,00)</option>
                                </select>
                            </div>
                        )}

                        {assignModal.planId && assignModal.planId !== '__gratis__' && assignModal.activationMethod !== 'cortesia' && (
                            <div style={{ marginBottom: '1.25rem' }}>
                                <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Forma de Pagamento (Recorrência)
                                </label>
                                <select
                                    className={styles.planSelect}
                                    value={assignModal.paymentMethod || 'pix'}
                                    onChange={e => setAssignModal({ ...assignModal, paymentMethod: e.target.value as 'pix' | 'boleto' | 'card' })}
                                >
                                    <option value="pix">🪙 PIX</option>
                                    <option value="boleto">📄 Boleto</option>
                                    <option value="card">💳 Cartão de Crédito</option>
                                </select>
                            </div>
                        )}

                        {assignError && (
                            <p style={{ color: 'var(--color-negative)', fontSize: '0.85rem', marginBottom: '1rem' }}>{assignError}</p>
                        )}

                        <div className={styles.detailActions}>
                            <button
                                className={`${styles.detailBtn}`}
                                style={{ flex: 1, background: 'var(--color-highlight)', color: 'var(--color-text)', border: '1px solid var(--color-highlight)' }}
                                onClick={() => setAssignModal(null)}
                                disabled={assigning}
                            >
                                Cancelar
                            </button>
                            <button
                                className={`${styles.detailBtn} ${styles.btnPlanLg}`}
                                disabled={assigning || !assignModal.planId || (assignPlanRequiresStartDate && !assignModal.startDate)}
                                onClick={handleAssignPlan}
                            >
                                {assigning ? 'Salvando...' : 'Confirmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Invite Management Modal */}
            {inviteModal && (
                <div className={styles.overlay} onClick={() => setInviteModal(null)}>
                    <div className={styles.detailPanel} onClick={e => e.stopPropagation()} style={{ maxWidth: 820 }}>
                        <button className={styles.closeBtn} onClick={() => setInviteModal(null)}>✕</button>
                        <h3 className={styles.detailName} style={{ marginBottom: '0.25rem' }}>👥 Convidados de {inviteModal.client.displayName || inviteModal.client.email}</h3>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                            Adicione ou gerencie usuários vinculados a esta conta.
                        </p>

                        {/* Add invite form */}
                        <div style={{
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-highlight)',
                            borderRadius: '10px',
                            padding: '1rem',
                            marginBottom: '1rem',
                        }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nome *</label>
                                    <input
                                        type="text"
                                        className={styles.planSelect}
                                        value={inviteForm.nome}
                                        onChange={e => setInviteForm(f => ({ ...f, nome: e.target.value }))}
                                        placeholder="Nome completo"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>E-mail *</label>
                                    <input
                                        type="email"
                                        className={styles.planSelect}
                                        value={inviteForm.email}
                                        onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                                        placeholder="email@exemplo.com"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Telefone</label>
                                    <input
                                        type="tel"
                                        className={styles.planSelect}
                                        value={inviteForm.telefone}
                                        onChange={e => {
                                            const d = e.target.value.replace(/\D/g, '').slice(0, 11);
                                            const v = d.length <= 10
                                                ? d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
                                                : d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
                                            setInviteForm(f => ({ ...f, telefone: v }));
                                        }}
                                        placeholder="(11) 99999-9999"
                                    />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                                    <button
                                        className={`${styles.detailBtn} ${styles.btnPlanLg}`}
                                        style={{ width: '100%', marginBottom: 0 }}
                                        onClick={handleSendInviteFromCRM}
                                        disabled={inviteSending || !inviteForm.nome.trim() || !inviteForm.email.trim()}
                                    >
                                        {inviteSending ? 'Adicionando...' : '+ Adicionar'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {inviteFeedback && (
                            <p style={{ color: inviteFeedback.type === 'error' ? 'var(--color-negative)' : 'var(--color-positive)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                                {inviteFeedback.msg}
                            </p>
                        )}

                        {tempPassword && (
                            <div style={{ background: '#064e3b', border: '1px solid #10b981', borderRadius: '8px', padding: '12px 16px', marginBottom: '1rem' }}>
                                <p style={{ color: '#6ee7b7', fontWeight: 700, marginBottom: '4px' }}>✓ Usuário criado com sucesso!</p>
                                <p style={{ color: '#a7f3d0', fontSize: '0.85rem', marginBottom: '8px' }}>
                                    Compartilhe a senha temporária com o convidado:
                                </p>
                                <div style={{ background: '#022c22', borderRadius: '6px', padding: '8px 14px', fontFamily: 'monospace', fontSize: '1.1rem', color: '#fff', letterSpacing: '0.1em', textAlign: 'center' }}>
                                    {tempPassword}
                                </div>
                            </div>
                        )}

                        {/* Invites list */}
                        {invitesLoading ? (
                            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '1rem' }}>Carregando...</p>
                        ) : invites.length === 0 ? (
                            <p style={{ color: 'var(--color-text-muted)', textAlign: 'center', padding: '1rem', fontStyle: 'italic' }}>Nenhum convidado vinculado.</p>
                        ) : (
                            <div style={{ background: 'var(--color-bg)', border: '1px solid var(--color-highlight)', borderRadius: '10px', overflow: 'hidden' }}>
                                <table className={styles.table} style={{ fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr>
                                            <th className={styles.tableHeader}>Nome</th>
                                            <th className={styles.tableHeader}>E-mail</th>
                                            <th className={styles.tableHeader}>Telefone</th>
                                            <th className={styles.tableHeader}>Status</th>
                                            <th className={styles.tableHeader}></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {invites.map(inv => (
                                            <tr key={inv.id} className={styles.tableRow}>
                                                <td className={styles.tableCell} style={{ fontWeight: 600 }}>
                                                    {editingInvite?.id === inv.id ? (
                                                        <input
                                                            className={styles.planSelect}
                                                            style={{ padding: '4px 8px', fontSize: '0.82rem' }}
                                                            value={editingInvite.nome}
                                                            onChange={e => setEditingInvite(prev => prev ? { ...prev, nome: e.target.value } : prev)}
                                                        />
                                                    ) : inv.nome}
                                                </td>
                                                <td className={styles.tableCell}>
                                                    {editingInvite?.id === inv.id ? (
                                                        <input
                                                            className={styles.planSelect}
                                                            style={{ padding: '4px 8px', fontSize: '0.82rem' }}
                                                            value={editingInvite.email}
                                                            onChange={e => setEditingInvite(prev => prev ? { ...prev, email: e.target.value } : prev)}
                                                        />
                                                    ) : inv.email}
                                                </td>
                                                <td className={styles.tableCell}>
                                                    {editingInvite?.id === inv.id ? (
                                                        <input
                                                            className={styles.planSelect}
                                                            style={{ padding: '4px 8px', fontSize: '0.82rem' }}
                                                            value={editingInvite.telefone}
                                                            onChange={e => {
                                                                const d = e.target.value.replace(/\D/g, '').slice(0, 11);
                                                                const v = d.length <= 10
                                                                    ? d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
                                                                    : d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
                                                                setEditingInvite(prev => prev ? { ...prev, telefone: v } : prev);
                                                            }}
                                                        />
                                                    ) : (inv.telefone || '—')}
                                                </td>
                                                <td className={styles.tableCell}>
                                                    <span className={styles.statusBadge} style={{
                                                        background: inv.status === 'accepted' ? '#10b98122' : inv.status === 'pending' ? '#f59e0b22' : '#ef444422',
                                                        color: inv.status === 'accepted' ? '#10b981' : inv.status === 'pending' ? '#f59e0b' : '#ef4444',
                                                        border: `1px solid ${inv.status === 'accepted' ? '#10b981' : inv.status === 'pending' ? '#f59e0b' : '#ef4444'}`,
                                                    }}>
                                                        {inv.status === 'accepted' ? 'Ativo' : inv.status === 'pending' ? 'Pendente' : 'Cancelado'}
                                                    </span>
                                                </td>
                                                <td className={styles.tableCell}>
                                                    <div className={styles.actions}>
                                                        {editingInvite?.id === inv.id ? (
                                                            <>
                                                                <button
                                                                    className={`${styles.actionBtn}`}
                                                                    style={{ color: 'var(--color-positive)', fontSize: '0.8rem' }}
                                                                    onClick={handleEditInviteCRM}
                                                                    disabled={editSaving}
                                                                    title="Salvar"
                                                                >
                                                                    {editSaving ? '⏳' : '✓'}
                                                                </button>
                                                                <button
                                                                    className={`${styles.actionBtn}`}
                                                                    style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}
                                                                    onClick={() => setEditingInvite(null)}
                                                                    title="Cancelar"
                                                                >
                                                                    ✕
                                                                </button>
                                                            </>
                                                        ) : (
                                                            <>
                                                                {inv.status !== 'cancelled' && (
                                                                    <>
                                                                        <button
                                                                            className={`${styles.actionBtn}`}
                                                                            style={{ color: 'var(--color-accent)', fontSize: '0.8rem' }}
                                                                            onClick={() => setEditingInvite({ id: inv.id, nome: inv.nome, email: inv.email, telefone: inv.telefone })}
                                                                            title="Editar convidado"
                                                                        >
                                                                            ✏️
                                                                        </button>
                                                                        <button
                                                                            className={`${styles.actionBtn}`}
                                                                            style={{ color: 'var(--color-negative)', fontSize: '0.8rem' }}
                                                                            onClick={() => handleCancelInviteCRM(inv.id)}
                                                                            title="Remover convidado"
                                                                        >
                                                                            🗑️
                                                                        </button>
                                                                    </>
                                                                )}
                                                                {inv.status === 'cancelled' && (
                                                                    <button
                                                                        className={`${styles.actionBtn}`}
                                                                        style={{ color: 'var(--color-positive)', fontSize: '0.8rem' }}
                                                                        onClick={() => handleReactivateInviteCRM(inv.id)}
                                                                        title="Reativar convidado"
                                                                    >
                                                                        🔄
                                                                    </button>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Create Client Modal */}
            {createModal && (
                <div className={styles.overlay} onClick={() => setCreateModal(false)}>
                    <div className={styles.detailPanel} onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
                        <button className={styles.closeBtn} onClick={() => setCreateModal(false)}>✕</button>
                        <h3 className={styles.detailName} style={{ marginBottom: '0.25rem' }}>➕ Cadastrar Novo Cliente</h3>
                        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem', marginBottom: '1.25rem' }}>
                            Preencha os dados abaixo para cadastrar um novo cliente na plataforma.
                        </p>

                        <div style={{
                            background: 'var(--color-bg)',
                            border: '1px solid var(--color-highlight)',
                            borderRadius: '10px',
                            padding: '1rem',
                            marginBottom: '1rem',
                        }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nome *</label>
                                    <input
                                        type="text"
                                        className={styles.planSelect}
                                        value={createForm.nome}
                                        onChange={e => setCreateForm(f => ({ ...f, nome: e.target.value }))}
                                        placeholder="Nome completo"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>E-mail *</label>
                                    <input
                                        type="email"
                                        className={styles.planSelect}
                                        value={createForm.email}
                                        onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                                        placeholder="email@exemplo.com"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Telefone</label>
                                    <input
                                        type="tel"
                                        className={styles.planSelect}
                                        value={createForm.telefone}
                                        onChange={e => {
                                            const d = e.target.value.replace(/\D/g, '').slice(0, 11);
                                            const v = d.length <= 10
                                                ? d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
                                                : d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
                                            setCreateForm(f => ({ ...f, telefone: v }));
                                        }}
                                        placeholder="(11) 99999-9999"
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', color: 'var(--color-text-muted)', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>CPF</label>
                                    <input
                                        type="text"
                                        className={styles.planSelect}
                                        value={createForm.cpf}
                                        onChange={e => setCreateForm(f => ({ ...f, cpf: e.target.value }))}
                                        placeholder="000.000.000-00"
                                    />
                                </div>
                            </div>
                            {!createdPassword && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                                    <button
                                        className={`${styles.detailBtn} ${styles.btnPlanLg}`}
                                        onClick={handleCreateClient}
                                        disabled={createSending || !createForm.nome.trim() || !createForm.email.trim()}
                                    >
                                        {createSending ? 'Cadastrando...' : '+ Cadastrar Cliente'}
                                    </button>
                                </div>
                            )}
                        </div>

                        {createFeedback && (
                            <p style={{ color: createFeedback.type === 'error' ? 'var(--color-negative)' : 'var(--color-positive)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
                                {createFeedback.msg}
                            </p>
                        )}

                        {createdPassword && (
                            <div style={{ background: '#064e3b', border: '1px solid #10b981', borderRadius: '8px', padding: '12px 16px', marginBottom: '1rem' }}>
                                <p style={{ color: '#6ee7b7', fontWeight: 700, marginBottom: '4px' }}>✓ Cliente criado com sucesso!</p>
                                <p style={{ color: '#a7f3d0', fontSize: '0.85rem', marginBottom: '8px' }}>
                                    A senha padrão é:
                                </p>
                                <div style={{ background: '#022c22', borderRadius: '6px', padding: '8px 14px', fontFamily: 'monospace', fontSize: '1.1rem', color: '#fff', letterSpacing: '0.1em', textAlign: 'center' }}>
                                    {createdPassword}
                                </div>
                                <p style={{ color: '#a7f3d0', fontSize: '0.85rem', marginTop: '8px' }}>
                                    O usuário será solicitado a trocar a senha no primeiro acesso.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
