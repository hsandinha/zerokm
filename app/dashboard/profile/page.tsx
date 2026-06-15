'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { getSession } from 'next-auth/react';
import Image from 'next/image';
import { getUserProfile, updateUserProfile, UserProfileData } from './actions';
import styles from './profile.module.css';
import { MaskedInput } from '@/components/operator/MaskedInput';
import UserMenu from '@/components/UserMenu';
import { calculateProfileCompletion } from '@/lib/utils/profileCompletion';
import { PaymentHistory } from '@/components/PaymentHistory';
import { validateCPF } from '@/lib/utils/cpf';
import MPSecureCardFields, { type MPSecureCardFieldsHandle } from '@/components/payments/MPSecureCardFields';

type TabType = 'pessoal' | 'endereco' | 'pagamento' | 'financeiro' | 'convidados';

const PROFILE_TABS: { id: TabType; icon: string; label: string }[] = [
    { id: 'pessoal', icon: '👤', label: 'Dados Pessoais' },
    { id: 'endereco', icon: '📍', label: 'Endereço' },
    { id: 'pagamento', icon: '💳', label: 'Pagamento' },
    { id: 'financeiro', icon: '📊', label: 'Financeiro' },
    { id: 'convidados', icon: '👥', label: 'Convidados' },
];

const DASHBOARD_ROUTE: Record<string, string> = {
    administrador: '/dashboard/admin',
    gerente: '/dashboard/admin',
    operador: '/dashboard/operator',
    administrativo: '/dashboard/administrativo',
    vendedor: '/dashboard/vendedor',
    concessionaria: '/dashboard/dealership',
    cliente: '/dashboard/cliente',
    gratis: '/dashboard/cliente',
};

const EMPTY_FORM: UserProfileData = {
    displayName: '',
    email: '',
    phoneNumber: '',
    cpf: '',
    address: { street: '', number: '', complement: '', neighborhood: '', city: '', state: '', zipCode: '' },
    creditCard: { holderName: '', lastFour: '', brand: '', expiry: '' },
};

export default function ProfilePage() {
    const router = useRouter();
    const { update: updateSession } = useSession();
    const [activeTab, setActiveTab] = useState<TabType>('pessoal');
    const [userInfo, setUserInfo] = useState<{ name?: string | null; email?: string | null; profile?: string | null; role?: string }>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const [formData, setFormData] = useState<UserProfileData>(EMPTY_FORM);
    const [cpfError, setCpfError] = useState('');
    const [cepLoading, setCepLoading] = useState(false);

    // Card sub-form
    const [showCardForm, setShowCardForm] = useState(false);
    const [cardInput, setCardInput] = useState({ holderName: '', cardType: 'credit' as 'credit' | 'debit' });
    const [secureFieldsValid, setSecureFieldsValid] = useState(false);
    const secureFieldsRef = useRef<MPSecureCardFieldsHandle>(null);
    const mpPublicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? '';
    const [savingCard, setSavingCard] = useState(false);
    const [cardFeedback, setCardFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

    // Extrato
    const [extrato, setExtrato] = useState<{ month: string; items: { type: string; description: string; amount: number; status: string }[]; total: number } | null>(null);
    const [extratoLoading, setExtratoLoading] = useState(false);
    const [extratoMonth, setExtratoMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });

    // Invites
    const [invites, setInvites] = useState<{ id: string; nome: string; email: string; telefone: string; status: string; monthlyPrice: number; createdAt: string }[]>([]);
    const [invitesLoading, setInvitesLoading] = useState(false);
    const [inviteForm, setInviteForm] = useState({ nome: '', email: '', telefone: '' });
    const [inviteSending, setInviteSending] = useState(false);
    const [inviteFeedback, setInviteFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
    const [tempPassword, setTempPassword] = useState<string | null>(null);

    const completion = calculateProfileCompletion({
        displayName: formData.displayName,
        phoneNumber: formData.phoneNumber,
        cpf: formData.cpf,
        address: formData.address,
        creditCard: formData.creditCard,
    });

    const completionClass =
        completion < 40 ? styles.low : completion < 80 ? styles.mid : styles.high;

    useEffect(() => {
        getSession().then(session => {
            if (session?.user) {
                setUserInfo({
                    name: session.user.name,
                    email: session.user.email,
                    profile: session.user.profile,
                    role: getRoleLabel(session.user.profile),
                });
            }
        });

        getUserProfile()
            .then(data => {
                if (data) {
                    setFormData(data);
                    setCardInput(ci => ({ ...ci, holderName: data.displayName || '' }));
                    if (!data.creditCard?.lastFour) setShowCardForm(true);
                }
            })
            .catch(() => setFeedback({ type: 'error', msg: 'Erro ao carregar perfil.' }))
            .finally(() => setLoading(false));
    }, []);

    const getRoleLabel = (profile?: string | null) => {
        const map: Record<string, string> = {
            administrador: 'Admin', admin: 'Admin',
            operador: 'Operador', operator: 'Operador',
            concessionaria: 'Concessionária', dealership: 'Concessionária',
            cliente: 'Cliente', gratis: 'Grátis', gerente: 'Gerente',
        };
        return profile ? (map[profile] ?? profile) : 'Usuário';
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name.startsWith('address.')) {
            const field = name.slice('address.'.length);
            setFormData(prev => ({ ...prev, address: { ...prev.address!, [field]: value } }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleCepBlur = async (cep: string) => {
        const clean = cep.replace(/\D/g, '');
        if (clean.length !== 8) return;
        setCepLoading(true);
        try {
            const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
            const data = await res.json();
            if (!data.erro) {
                setFormData(prev => ({
                    ...prev,
                    address: {
                        ...prev.address!,
                        street: data.logradouro || prev.address?.street || '',
                        neighborhood: data.bairro || prev.address?.neighborhood || '',
                        city: data.localidade || prev.address?.city || '',
                        state: data.uf || prev.address?.state || '',
                    },
                }));
            }
        } catch { /* silently ignore */ }
        finally { setCepLoading(false); }
    };

    const handleCpfBlur = () => {
        const digits = (formData.cpf || '').replace(/\D/g, '');
        if (digits.length === 11 && !validateCPF(formData.cpf || '')) setCpfError('CPF inválido');
        else setCpfError('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (cpfError) return;
        setSaving(true);
        setFeedback(null);
        try {
            const result = await updateUserProfile({ ...formData, creditCard: undefined });
            if (result.success) {
                const newCompletion = calculateProfileCompletion({
                    displayName: formData.displayName,
                    phoneNumber: formData.phoneNumber,
                    cpf: formData.cpf,
                    address: formData.address,
                    creditCard: formData.creditCard,
                });
                await updateSession({ profileCompletion: newCompletion });
                setFeedback({ type: 'success', msg: 'Perfil atualizado com sucesso!' });
                router.refresh();
            } else {
                setFeedback({ type: 'error', msg: result.error || 'Erro ao atualizar perfil.' });
            }
        } catch {
            setFeedback({ type: 'error', msg: 'Erro de conexão. Tente novamente.' });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveCard = async () => {
        if (!cardInput.holderName.trim()) {
            setCardFeedback({ type: 'error', msg: 'Informe o nome do titular.' });
            return;
        }
        if (!secureFieldsValid) {
            setCardFeedback({ type: 'error', msg: 'Preencha os dados do cartão corretamente.' });
            return;
        }
        if (!secureFieldsRef.current?.isReady()) {
            setCardFeedback({ type: 'error', msg: 'Aguardando carregamento dos campos seguros…' });
            return;
        }
        setSavingCard(true);
        setCardFeedback(null);
        try {
            // Tokeniza no browser via Secure Fields (PCI compliant).
            const tk = await secureFieldsRef.current.tokenize({
                cardholderName: cardInput.holderName,
                cpf: formData.cpf,
            });
            const res = await fetch('/api/user/save-card', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    cardToken: tk.token,
                    holderName: cardInput.holderName,
                    cpf: formData.cpf,
                    cardType: cardInput.cardType,
                }),
            });
            const data = await res.json();
            if (data.ok) {
                setCardFeedback({ type: 'success', msg: `Cartão •••• ${data.lastFour} salvo com sucesso!` });
                const expMonth = tk.expirationMonth ?? '';
                const expYear = tk.expirationYear ?? '';
                setFormData(prev => ({
                    ...prev,
                    creditCard: {
                        ...prev.creditCard,
                        lastFour: data.lastFour,
                        brand: data.brand,
                        holderName: cardInput.holderName,
                        expiry: expMonth && expYear ? `${String(expMonth).padStart(2, '0')}/${expYear}` : '',
                    },
                }));
                setShowCardForm(false);
                await updateSession({ profileCompletion: 100 });
            } else {
                setCardFeedback({ type: 'error', msg: data.error || 'Erro ao salvar cartão.' });
            }
        } catch (err: any) {
            setCardFeedback({ type: 'error', msg: err?.message || 'Erro ao tokenizar cartão.' });
        } finally {
            setSavingCard(false);
        }
    };

    const savedCard = formData.creditCard?.lastFour ? formData.creditCard : null;

    const loadExtrato = async (month: string) => {
        setExtratoLoading(true);
        try {
            const res = await fetch(`/api/user/extrato?month=${month}`);
            const data = await res.json();
            setExtrato(data);
        } catch { setExtrato(null); }
        finally { setExtratoLoading(false); }
    };

    const loadInvites = async () => {
        setInvitesLoading(true);
        try {
            const res = await fetch('/api/user/invite');
            const data = await res.json();
            setInvites(Array.isArray(data) ? data : []);
        } catch { setInvites([]); }
        finally { setInvitesLoading(false); }
    };

    const handleSendInvite = async () => {
        if (!inviteForm.nome.trim()) { setInviteFeedback({ type: 'error', msg: 'Nome é obrigatório.' }); return; }
        if (!inviteForm.email.trim()) { setInviteFeedback({ type: 'error', msg: 'E-mail é obrigatório.' }); return; }
        setInviteSending(true);
        setInviteFeedback(null);
        setTempPassword(null);
        try {
            const res = await fetch('/api/user/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(inviteForm),
            });
            const data = await res.json();
            if (res.ok) {
                setTempPassword(data.tempPassword);
                setInviteForm({ nome: '', email: '', telefone: '' });
                loadInvites();
            } else {
                setInviteFeedback({ type: 'error', msg: data.error || 'Erro ao adicionar usuário.' });
            }
        } catch {
            setInviteFeedback({ type: 'error', msg: 'Erro de conexão.' });
        } finally {
            setInviteSending(false);
        }
    };

    const handleCancelInvite = async (id: string) => {
        if (!confirm('Cancelar este convite?')) return;
        try {
            await fetch(`/api/user/invite?id=${id}`, { method: 'DELETE' });
            loadInvites();
        } catch { /* ignore */ }
    };

    // Load tab-specific data when switching tabs
    useEffect(() => {
        if (activeTab === 'financeiro') loadExtrato(extratoMonth);
    }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div className={styles.container}>
            {/* ── Header ── */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <Image
                        src="/images/logo.png"
                        alt="Logo"
                        width={240}
                        height={80}
                        className={styles.logo}
                        priority
                    />
                </div>
                <div className={styles.headerRight}>
                    <UserMenu
                        name={userInfo.name || 'Usuário'}
                        email={userInfo.email}
                        role={userInfo.role || 'Usuário'}
                    />
                </div>
            </div>

            {/* ── Tabs Bar ── */}
            <div className={styles.tabsContainer}>
                <div className={styles.tabsList}>
                    {/* Back to dashboard — always first */}
                    {userInfo.profile && DASHBOARD_ROUTE[userInfo.profile] && (
                        <button
                            className={styles.tab}
                            onClick={() => router.push(DASHBOARD_ROUTE[userInfo.profile!]!)}
                        >
                            <span className={styles.tabIcon}>←</span>
                            <span className={styles.tabLabel}>Voltar ao Painel</span>
                        </button>
                    )}

                    <div className={styles.tabDivider} />

                    {PROFILE_TABS.map(tab => (
                        <button
                            key={tab.id}
                            className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ''}`}
                            onClick={() => { setActiveTab(tab.id); setFeedback(null); setCardFeedback(null); }}
                        >
                            <span className={styles.tabIcon}>{tab.icon}</span>
                            <span className={styles.tabLabel}>{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Tab Content ── */}
            <div className={styles.tabContent}>
                <div className={styles.tabContentContainer}>
                    {loading ? (
                        <p style={{ color: 'var(--color-text-muted)' }}>Carregando...</p>
                    ) : (
                        <>
                            {/* Completion banner — always visible */}
                            <div className={styles.completionBanner}>
                                <span className={styles.completionLabel}>Perfil preenchido</span>
                                <div className={styles.progressWrapper}>
                                    <div className={styles.progressBar}>
                                        <div
                                            className={`${styles.progressFill} ${completionClass}`}
                                            style={{ width: `${completion}%` }}
                                        />
                                    </div>
                                    <span className={styles.progressPct}>{completion}%</span>
                                </div>
                                {completion < 100 && (
                                    <span className={styles.completionHint}>
                                        Complete seu perfil para acesso completo
                                    </span>
                                )}
                            </div>

                            {/* ── Tab: Dados Pessoais ── */}
                            {activeTab === 'pessoal' && (
                                <form onSubmit={handleSubmit}>
                                    <div className={styles.panel}>
                                        <h2 className={styles.panelTitle}>👤 Dados Pessoais</h2>
                                        <div className={styles.grid}>
                                            <div className={styles.formGroup}>
                                                <label className={styles.label}>Nome Completo</label>
                                                <input
                                                    className={styles.input}
                                                    type="text"
                                                    name="displayName"
                                                    value={formData.displayName || ''}
                                                    onChange={handleChange}
                                                    required
                                                />
                                            </div>

                                            <div className={styles.formGroup}>
                                                <label className={styles.label}>E-mail</label>
                                                <input
                                                    className={styles.input}
                                                    type="email"
                                                    name="email"
                                                    value={formData.email || ''}
                                                    disabled
                                                    title="O email não pode ser alterado"
                                                />
                                            </div>

                                            <div className={styles.formGroup}>
                                                <label className={styles.label}>CPF</label>
                                                <MaskedInput
                                                    mask="cpf"
                                                    value={formData.cpf || ''}
                                                    onChange={(v: string) => {
                                                        setFormData(p => ({ ...p, cpf: v }));
                                                        setCpfError('');
                                                    }}
                                                    onBlur={handleCpfBlur}
                                                    placeholder="000.000.000-00"
                                                />
                                                {cpfError && (
                                                    <span className={styles.fieldError}>{cpfError}</span>
                                                )}
                                            </div>

                                            <div className={styles.formGroup}>
                                                <label className={styles.label}>Telefone</label>
                                                <MaskedInput
                                                    mask="phone"
                                                    value={formData.phoneNumber || ''}
                                                    onChange={(v: string) =>
                                                        setFormData(p => ({ ...p, phoneNumber: v }))
                                                    }
                                                    placeholder="(00) 00000-0000"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {feedback && (
                                        <p className={`${styles.saveFeedback} ${styles[feedback.type]}`}>
                                            {feedback.msg}
                                        </p>
                                    )}

                                    <div className={styles.actions}>
                                        <button
                                            type="button"
                                            onClick={() => router.back()}
                                            className={`${styles.button} ${styles.cancelButton}`}
                                            disabled={saving}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            className={`${styles.button} ${styles.saveButton}`}
                                            disabled={saving || !!cpfError}
                                        >
                                            {saving ? 'Salvando...' : 'Salvar Alterações'}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* ── Tab: Endereço ── */}
                            {activeTab === 'endereco' && (
                                <form onSubmit={handleSubmit}>
                                    <div className={styles.panel}>
                                        <h2 className={styles.panelTitle}>📍 Endereço</h2>
                                        <div className={styles.grid}>
                                            <div className={styles.formGroup}>
                                                <label className={styles.label}>
                                                    CEP{cepLoading && (
                                                        <span className={styles.cepHint}> buscando...</span>
                                                    )}
                                                </label>
                                                <MaskedInput
                                                    mask="cep"
                                                    value={formData.address?.zipCode || ''}
                                                    onChange={(v: string) =>
                                                        setFormData(p => ({
                                                            ...p,
                                                            address: { ...p.address!, zipCode: v },
                                                        }))
                                                    }
                                                    onBlur={(v: string) => handleCepBlur(v)}
                                                    placeholder="00000-000"
                                                />
                                            </div>

                                            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                                <label className={styles.label}>Rua</label>
                                                <input
                                                    className={styles.input}
                                                    type="text"
                                                    name="address.street"
                                                    value={formData.address?.street || ''}
                                                    onChange={handleChange}
                                                />
                                            </div>

                                            <div className={styles.formGroup}>
                                                <label className={styles.label}>Número</label>
                                                <input
                                                    className={styles.input}
                                                    type="text"
                                                    name="address.number"
                                                    value={formData.address?.number || ''}
                                                    onChange={handleChange}
                                                />
                                            </div>

                                            <div className={styles.formGroup}>
                                                <label className={styles.label}>Complemento</label>
                                                <input
                                                    className={styles.input}
                                                    type="text"
                                                    name="address.complement"
                                                    value={formData.address?.complement || ''}
                                                    onChange={handleChange}
                                                />
                                            </div>

                                            <div className={styles.formGroup}>
                                                <label className={styles.label}>Bairro</label>
                                                <input
                                                    className={styles.input}
                                                    type="text"
                                                    name="address.neighborhood"
                                                    value={formData.address?.neighborhood || ''}
                                                    onChange={handleChange}
                                                />
                                            </div>

                                            <div className={styles.formGroup}>
                                                <label className={styles.label}>Cidade</label>
                                                <input
                                                    className={styles.input}
                                                    type="text"
                                                    name="address.city"
                                                    value={formData.address?.city || ''}
                                                    onChange={handleChange}
                                                />
                                            </div>

                                            <div className={styles.formGroup}>
                                                <label className={styles.label}>Estado</label>
                                                <input
                                                    className={styles.input}
                                                    type="text"
                                                    name="address.state"
                                                    value={formData.address?.state || ''}
                                                    onChange={handleChange}
                                                    maxLength={2}
                                                    placeholder="UF"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {feedback && (
                                        <p className={`${styles.saveFeedback} ${styles[feedback.type]}`}>
                                            {feedback.msg}
                                        </p>
                                    )}

                                    <div className={styles.actions}>
                                        <button
                                            type="button"
                                            onClick={() => router.back()}
                                            className={`${styles.button} ${styles.cancelButton}`}
                                            disabled={saving}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="submit"
                                            className={`${styles.button} ${styles.saveButton}`}
                                            disabled={saving}
                                        >
                                            {saving ? 'Salvando...' : 'Salvar Endereço'}
                                        </button>
                                    </div>
                                </form>
                            )}

                            {/* ── Tab: Pagamento ── */}
                            {activeTab === 'pagamento' && (
                                <div className={styles.panel}>
                                    <h2 className={styles.panelTitle}>💳 Cartão de Pagamento</h2>

                                    {savedCard && !showCardForm ? (
                                        <>
                                            <div className={styles.savedCardDisplay}>
                                                <div className={styles.savedCardInfo}>
                                                    <span className={styles.cardBrand}>
                                                        {savedCard.brand || 'Cartão'}
                                                    </span>
                                                    <span className={styles.cardMasked}>
                                                        •••• •••• •••• {savedCard.lastFour}
                                                    </span>
                                                    {savedCard.expiry && (
                                                        <span className={styles.cardExpiry}>
                                                            Validade: {savedCard.expiry}
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    className={`${styles.button} ${styles.cancelButton}`}
                                                    onClick={() => {
                                                        setShowCardForm(true);
                                                        setCardFeedback(null);
                                                    }}
                                                >
                                                    Alterar cartão
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className={styles.grid}>
                                                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                                    <label className={styles.label}>Titular do cartão</label>
                                                    <input
                                                        className={styles.input}
                                                        type="text"
                                                        value={cardInput.holderName}
                                                        onChange={e =>
                                                            setCardInput(ci => ({
                                                                ...ci,
                                                                holderName: e.target.value,
                                                            }))
                                                        }
                                                        placeholder="Nome como aparece no cartão"
                                                        autoComplete="cc-name"
                                                    />
                                                </div>

                                                {/* Tipo do Cartão */}
                                                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                                    <label className={styles.label}>Tipo do Cartão</label>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setCardInput(ci => ({ ...ci, cardType: 'credit' }))}
                                                            style={{
                                                                flex: 1, padding: '10px', borderRadius: '6px', cursor: 'pointer',
                                                                border: cardInput.cardType === 'credit' ? '2px solid #3b82f6' : '1px solid var(--color-border)',
                                                                background: cardInput.cardType === 'credit' ? 'rgba(59,130,246,0.15)' : 'var(--color-surface)',
                                                                color: cardInput.cardType === 'credit' ? '#3b82f6' : 'var(--color-text)',
                                                                fontWeight: cardInput.cardType === 'credit' ? 700 : 400,
                                                                fontSize: '0.9rem',
                                                            }}
                                                        >
                                                            💳 Crédito
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setCardInput(ci => ({ ...ci, cardType: 'debit' }))}
                                                            style={{
                                                                flex: 1, padding: '10px', borderRadius: '6px', cursor: 'pointer',
                                                                border: cardInput.cardType === 'debit' ? '2px solid #10b981' : '1px solid var(--color-border)',
                                                                background: cardInput.cardType === 'debit' ? 'rgba(16,185,129,0.15)' : 'var(--color-surface)',
                                                                color: cardInput.cardType === 'debit' ? '#10b981' : 'var(--color-text)',
                                                                fontWeight: cardInput.cardType === 'debit' ? 700 : 400,
                                                                fontSize: '0.9rem',
                                                            }}
                                                        >
                                                            🏦 Débito
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                                                    <label className={styles.label}>Dados do cartão</label>
                                                    <MPSecureCardFields
                                                        ref={secureFieldsRef}
                                                        publicKey={mpPublicKey}
                                                        onValidityChange={setSecureFieldsValid}
                                                    />
                                                </div>
                                            </div>

                                            {cardFeedback && (
                                                <p className={`${styles.saveFeedback} ${styles[cardFeedback.type]}`}>
                                                    {cardFeedback.msg}
                                                </p>
                                            )}

                                            <div className={styles.actions}>
                                                {savedCard && (
                                                    <button
                                                        type="button"
                                                        className={`${styles.button} ${styles.cancelButton}`}
                                                        onClick={() => {
                                                            setShowCardForm(false);
                                                            setCardFeedback(null);
                                                        }}
                                                        disabled={savingCard}
                                                    >
                                                        Cancelar
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    className={`${styles.button} ${styles.saveButton}`}
                                                    onClick={handleSaveCard}
                                                    disabled={savingCard}
                                                >
                                                    {savingCard ? 'Salvando...' : 'Salvar Cartão'}
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {/* ── Tab: Financeiro ── */}
                            {activeTab === 'financeiro' && (
                                <div className={styles.panel}>
                                    <h2 className={styles.panelTitle}>📊 Extrato do Mês</h2>

                                    <div className={styles.extratoHeader}>
                                        <label className={styles.label}>Mês de referência</label>
                                        <input
                                            type="month"
                                            className={styles.input}
                                            style={{ maxWidth: 200 }}
                                            value={extratoMonth}
                                            onChange={e => {
                                                setExtratoMonth(e.target.value);
                                                loadExtrato(e.target.value);
                                            }}
                                        />
                                    </div>

                                    {extratoLoading ? (
                                        <p className={styles.extratoEmpty}>Carregando...</p>
                                    ) : extrato ? (
                                        <>
                                            <table className={styles.extratoTable}>
                                                <thead>
                                                    <tr>
                                                        <th>Data</th>
                                                        <th>Descrição</th>
                                                        <th>Tipo</th>
                                                        <th>Status</th>
                                                        <th style={{ textAlign: 'right' }}>Valor</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {extrato.items.map((item: any, i: number) => (
                                                        <tr key={i}>
                                                            <td style={{ whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                                                                {item.date ? new Date(item.date).toLocaleDateString('pt-BR') : '—'}
                                                            </td>
                                                            <td>{item.description}</td>
                                                            <td>
                                                                <span className={`${styles.extratoTypeTag} ${styles[`type_${item.type}`]}`}>
                                                                    {item.type === 'subscription' ? 'Assinatura' :
                                                                        item.type === 'invite' ? 'Convidado' :
                                                                            item.type === 'credit' ? 'Crédito' : 'Info'}
                                                                </span>
                                                            </td>
                                                            <td>
                                                                <span className={`${styles.extratoStatusTag} ${styles[`status_${item.status}`]}`}>
                                                                    {item.status === 'paid' ? 'Pago' :
                                                                        item.status === 'pending' ? 'Pendente' :
                                                                            item.status === 'cancelled' ? 'Cancelado' : '—'}
                                                                </span>
                                                            </td>
                                                            <td style={{ textAlign: 'right', fontWeight: 600 }}>
                                                                {item.amount > 0
                                                                    ? `R$ ${item.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                                                    : '—'
                                                                }
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                {extrato.total > 0 && (
                                                    <tfoot>
                                                        <tr>
                                                            <td colSpan={4}><strong>Total do mês</strong></td>
                                                            <td style={{ textAlign: 'right' }}>
                                                                <strong>
                                                                    R$ {extrato.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                                </strong>
                                                            </td>
                                                        </tr>
                                                    </tfoot>
                                                )}
                                            </table>
                                        </>
                                    ) : (
                                        <p className={styles.extratoEmpty}>Nenhum dado disponível.</p>
                                    )}

                                    {/* Minhas Transações (Pagamentos) */}
                                    <div style={{ marginTop: '2rem' }}>
                                        <PaymentHistory month={extratoMonth} />
                                    </div>
                                </div>
                            )}

                            {/* ── Tab: Convidados ── */}
                            {activeTab === 'convidados' && (
                                <div className={styles.panel}>
                                    <h2 className={styles.panelTitle}>👥 Usuários Vinculados</h2>
                                    <p className={styles.inviteDescription}>
                                        Adicione usuários vinculados à sua conta. Uma senha temporária será gerada — compartilhe com o usuário para o primeiro acesso.
                                    </p>

                                    {/* Form */}
                                    <div className={styles.inviteFormGrid}>
                                        <div className={styles.formGroup}>
                                            <label className={styles.label}>Nome <span style={{ color: 'var(--color-accent)' }}>*</span></label>
                                            <input
                                                type="text"
                                                className={styles.input}
                                                value={inviteForm.nome}
                                                onChange={e => setInviteForm(f => ({ ...f, nome: e.target.value }))}
                                                placeholder="Nome completo"
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.label}>E-mail <span style={{ color: 'var(--color-accent)' }}>*</span></label>
                                            <input
                                                type="email"
                                                className={styles.input}
                                                value={inviteForm.email}
                                                onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                                                placeholder="email@exemplo.com"
                                            />
                                        </div>
                                        <div className={styles.formGroup}>
                                            <label className={styles.label}>Telefone</label>
                                            <input
                                                type="tel"
                                                className={styles.input}
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
                                        <div className={styles.inviteFormAction}>
                                            <label className={styles.label}>&nbsp;</label>
                                            <button
                                                type="button"
                                                className={`${styles.button} ${styles.saveButton}`}
                                                onClick={handleSendInvite}
                                                disabled={inviteSending || !inviteForm.nome.trim() || !inviteForm.email.trim()}
                                            >
                                                {inviteSending ? 'Adicionando...' : '+ Adicionar usuário'}
                                            </button>
                                        </div>
                                    </div>

                                    {inviteFeedback && (
                                        <p className={`${styles.saveFeedback} ${styles[inviteFeedback.type]}`}>
                                            {inviteFeedback.msg}
                                        </p>
                                    )}

                                    {/* Temp password box */}
                                    {tempPassword && (
                                        <div className={styles.tempPasswordBox}>
                                            <div className={styles.tempPasswordHeader}>
                                                <span>✓ Usuário criado com sucesso!</span>
                                                <button
                                                    type="button"
                                                    className={styles.tempPasswordClose}
                                                    onClick={() => setTempPassword(null)}
                                                >✕</button>
                                            </div>
                                            <p className={styles.tempPasswordDesc}>
                                                Compartilhe a senha temporária abaixo com o usuário. No primeiro acesso, ele será obrigado a criar uma nova senha.
                                            </p>
                                            <div className={styles.tempPasswordValue}>{tempPassword}</div>
                                            <p className={styles.tempPasswordHint}>Login: e-mail cadastrado · Senha: acima (temporária)</p>
                                        </div>
                                    )}

                                    {/* List */}
                                    {invitesLoading ? (
                                        <p className={styles.extratoEmpty}>Carregando...</p>
                                    ) : invites.length === 0 ? (
                                        <p className={styles.extratoEmpty}>Nenhum usuário vinculado ainda.</p>
                                    ) : (
                                        <div className={styles.inviteTable}>
                                            <div className={styles.inviteTableHeader}>
                                                <span>Nome</span>
                                                <span>E-mail</span>
                                                <span>Telefone</span>
                                                <span>Status</span>
                                                <span></span>
                                            </div>
                                            {invites.map(inv => (
                                                <div key={inv.id} className={styles.inviteTableRow}>
                                                    <span className={styles.inviteTableName}>{inv.nome}</span>
                                                    <span className={styles.inviteTableEmail}>{inv.email}</span>
                                                    <span className={styles.inviteTablePhone}>{inv.telefone || '—'}</span>
                                                    <span>
                                                        <span className={`${styles.inviteStatus} ${styles[`invStatus_${inv.status}`]}`}>
                                                            {inv.status === 'accepted' ? 'Ativo' : inv.status === 'pending' ? 'Pendente' : 'Cancelado'}
                                                        </span>
                                                    </span>
                                                    <span>
                                                        {inv.status !== 'cancelled' && (
                                                            <button
                                                                type="button"
                                                                className={`${styles.button} ${styles.cancelButton}`}
                                                                style={{ padding: '4px 12px', fontSize: '0.8rem' }}
                                                                onClick={() => handleCancelInvite(inv.id)}
                                                            >
                                                                Remover
                                                            </button>
                                                        )}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
