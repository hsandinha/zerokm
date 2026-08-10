'use client';

import { useState, useEffect } from 'react';

interface Plan {
    id?: string;
    name: string;
    description: string;
    type: 'monthly' | 'credits';
    credits: number | null;
    price: number;
    annualPrice: number | null;
    invitePrice: number;
    features: string[];
    popular: boolean;
    active: boolean;
}

/**
 * O formulário guarda TEXTO, não número.
 *
 * Com `value={form.price}` numérico e `parseFloat(e.target.value) || 0` a cada
 * tecla, o campo virava intransitável: apagar tudo devolvia "0" na hora (daí o
 * zero grudado no início), e "699," ou "699." eram normalizados para 699 antes
 * de o usuário terminar de digitar — nunca dava para escrever centavos.
 * O mesmo valia para créditos, preço anual e preço por convidado.
 *
 * A conversão para número acontece uma única vez, no salvar.
 */
interface PlanForm {
    name: string;
    description: string;
    type: 'monthly' | 'credits';
    credits: string;
    price: string;
    annualPrice: string;
    invitePrice: string;
    featuresText: string;
    popular: boolean;
    active: boolean;
}

const emptyForm: PlanForm = {
    name: '', description: '', type: 'credits', credits: '', price: '',
    annualPrice: '', invitePrice: '', featuresText: '', popular: false, active: true
};

const planToForm = (p: Plan): PlanForm => ({
    name: p.name ?? '',
    description: p.description ?? '',
    type: p.type,
    credits: p.credits != null ? String(p.credits) : '',
    price: p.price != null ? String(p.price) : '',
    annualPrice: p.annualPrice != null ? String(p.annualPrice) : '',
    invitePrice: p.invitePrice != null ? String(p.invitePrice) : '',
    featuresText: (p.features ?? []).join('\n'),
    popular: !!p.popular,
    active: p.active !== false,
});

/** Aceita "699.90" e "699,90" — e "1.234,56", como o admin costuma digitar. */
function parseAmount(raw: string): number | null {
    const s = raw.trim();
    if (!s) return null;
    const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
}

export function PlansManagement() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Plan | null>(null);
    const [form, setForm] = useState<PlanForm>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const fetchPlans = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/plans');
            const data = await res.json();
            setPlans(data);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchPlans(); }, []);

    // ESC fecha o modal — clicar fora já fechava, o teclado não.
    useEffect(() => {
        if (!showModal) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowModal(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [showModal]);

    const openCreate = () => {
        setEditing(null);
        setForm(emptyForm);
        setFormError(null);
        setShowModal(true);
    };

    const openEdit = (p: Plan) => {
        setEditing(p);
        setForm(planToForm(p));
        setFormError(null);
        setShowModal(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError(null);

        const price = parseAmount(form.price);
        if (price === null || price < 0) {
            setFormError('Informe um preço válido (ex.: 699,90).');
            return;
        }

        const credits = form.type === 'credits' ? parseAmount(form.credits) : null;
        if (form.type === 'credits' && (credits === null || !Number.isInteger(credits) || credits < 1)) {
            setFormError('Informe a quantidade de créditos (número inteiro maior que zero).');
            return;
        }

        const annualPrice = form.type === 'monthly' ? parseAmount(form.annualPrice) : null;
        if (form.type === 'monthly' && form.annualPrice.trim() && annualPrice === null) {
            setFormError('Preço anual inválido — deixe em branco se o plano não tem opção anual.');
            return;
        }

        const invitePrice = parseAmount(form.invitePrice);
        if (form.invitePrice.trim() && invitePrice === null) {
            setFormError('Preço por convidado inválido.');
            return;
        }

        const payload = {
            name: form.name.trim(),
            description: form.description.trim(),
            type: form.type,
            credits,
            price,
            annualPrice,
            invitePrice: invitePrice ?? 0,
            // As linhas só são aparadas aqui: fazer isso a cada tecla apagava o
            // espaço recém-digitado e engolia a linha em branco do Enter.
            features: form.featuresText.split('\n').map(s => s.trim()).filter(Boolean),
            popular: form.popular,
            active: form.active,
        };

        setSaving(true);
        try {
            const url = editing?.id ? `/api/admin/plans/${editing.id}` : '/api/admin/plans';
            const res = await fetch(url, {
                method: editing?.id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            // Sem esta checagem o modal fechava mesmo com erro e o admin ficava
            // achando que o plano tinha sido salvo.
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setFormError(data.error || 'Não foi possível salvar o plano.');
                return;
            }
            setShowModal(false);
            fetchPlans();
        } catch {
            setFormError('Falha de conexão ao salvar o plano.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir este plano permanentemente?')) return;
        const res = await fetch(`/api/admin/plans/${id}`, { method: 'DELETE' });
        if (!res.ok) alert('Não foi possível excluir o plano.');
        fetchPlans();
    };

    const handleToggle = async (plan: Plan) => {
        const res = await fetch(`/api/admin/plans/${plan.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: !plan.active })
        });
        if (!res.ok) alert('Não foi possível alterar o status do plano.');
        fetchPlans();
    };

    return (
        <div style={{ maxWidth: '900px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 700 }}>Gerenciamento de Planos</h2>
                    <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: '0.875rem' }}>
                        Configure planos mensais e pacotes de créditos para usuários Grátis
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    style={{
                        background: '#2563eb', color: 'white', border: 'none',
                        borderRadius: '8px', padding: '0.6rem 1.25rem',
                        fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
                        flexShrink: 0
                    }}
                >
                    + Novo Plano
                </button>
            </div>

            {loading ? (
                <p style={{ color: '#9ca3af' }}>Carregando...</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {plans.length === 0 && (
                        <p style={{ color: '#9ca3af', fontStyle: 'italic', padding: '1rem 0' }}>
                            Nenhum plano cadastrado. Clique em "Novo Plano" para criar o primeiro.
                        </p>
                    )}
                    {plans.map(plan => (
                        <div
                            key={plan.id}
                            style={{
                                border: '1px solid #e5e7eb',
                                borderRadius: '12px',
                                padding: '1rem 1.25rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                background: plan.active ? 'white' : '#f9fafb',
                                opacity: plan.active ? 1 : 0.65
                            }}
                        >
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{plan.name}</div>
                                {plan.description && (
                                    <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '2px' }}>
                                        {plan.description}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '6px', alignItems: 'center' }}>
                                    <span style={{
                                        background: plan.type === 'monthly' ? '#dbeafe' : '#fef9c3',
                                        color: plan.type === 'monthly' ? '#1e40af' : '#854d0e',
                                        borderRadius: '999px', padding: '2px 10px',
                                        fontSize: '0.75rem', fontWeight: 700
                                    }}>
                                        {plan.type === 'monthly' ? '📅 Mensal' : `🪙 ${plan.credits} créditos`}
                                    </span>
                                    <span style={{ fontWeight: 700, color: '#374151' }}>
                                        R$ {plan.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                    {plan.invitePrice > 0 && (
                                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                            + R$ {plan.invitePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/convidado
                                        </span>
                                    )}
                                    {plan.annualPrice && (
                                        <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                            | Anual: R$ {plan.annualPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    )}
                                    {plan.features?.length > 0 && (
                                        <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                                            {plan.features.length} recurso(s)
                                        </span>
                                    )}
                                    {plan.popular && (
                                        <span style={{
                                            background: '#fef9c3', color: '#854d0e',
                                            borderRadius: '999px', padding: '2px 10px',
                                            fontSize: '0.72rem', fontWeight: 700
                                        }}>
                                            ⭐ Mais popular
                                        </span>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexShrink: 0, marginLeft: '1rem' }}>
                                <button
                                    onClick={() => handleToggle(plan)}
                                    style={{
                                        background: plan.active ? '#d1fae5' : '#fee2e2',
                                        color: plan.active ? '#065f46' : '#991b1b',
                                        border: 'none', borderRadius: '6px',
                                        padding: '4px 12px', fontSize: '0.75rem',
                                        fontWeight: 700, cursor: 'pointer'
                                    }}
                                >
                                    {plan.active ? 'Ativo' : 'Inativo'}
                                </button>
                                <button
                                    onClick={() => openEdit(plan)}
                                    style={{
                                        background: '#f3f4f6', color: '#374151',
                                        border: '1px solid #e5e7eb', borderRadius: '6px',
                                        padding: '4px 12px', fontSize: '0.75rem', cursor: 'pointer'
                                    }}
                                >
                                    Editar
                                </button>
                                <button
                                    onClick={() => handleDelete(plan.id!)}
                                    style={{
                                        background: '#fee2e2', color: '#dc2626',
                                        border: '1px solid #fecaca', borderRadius: '6px',
                                        padding: '4px 12px', fontSize: '0.75rem', cursor: 'pointer'
                                    }}
                                >
                                    Excluir
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {showModal && (
                <div
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
                >
                    <div style={{
                        background: 'white', borderRadius: '12px', padding: '2rem',
                        width: '100%', maxWidth: '460px',
                        // O formulário é mais alto que a janela: sem rolagem
                        // própria, o título e os primeiros campos ficavam fora
                        // da tela, sem como alcançá-los.
                        maxHeight: '90vh', overflowY: 'auto', margin: '1rem',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
                    }}>
                        <h3 style={{ margin: '0 0 1.5rem', fontWeight: 700, fontSize: '1.1rem' }}>
                            {editing ? 'Editar Plano' : 'Novo Plano'}
                        </h3>
                        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: 4, color: '#374151' }}>
                                    Nome do plano *
                                </label>
                                <input
                                    required
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="Ex: Plano Profissional"
                                    style={{ width: '100%', padding: '0.65rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: 4, color: '#374151' }}>
                                    Descrição
                                </label>
                                <input
                                    value={form.description}
                                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                    placeholder="Descrição opcional"
                                    style={{ width: '100%', padding: '0.65rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: 4, color: '#374151' }}>
                                    Tipo *
                                </label>
                                <select
                                    value={form.type}
                                    onChange={e => setForm(f => ({ ...f, type: e.target.value as 'monthly' | 'credits' }))}
                                    style={{ width: '100%', padding: '0.65rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                >
                                    <option value="credits">🪙 Pacote de Créditos</option>
                                    <option value="monthly">📅 Plano Mensal (ilimitado)</option>
                                </select>
                            </div>
                            {form.type === 'credits' && (
                                <div>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: 4, color: '#374151' }}>
                                        Quantidade de créditos *
                                    </label>
                                    <input
                                        required
                                        type="text"
                                        inputMode="numeric"
                                        value={form.credits}
                                        onChange={e => setForm(f => ({ ...f, credits: e.target.value.replace(/\D/g, '') }))}
                                        placeholder="Ex: 10"
                                        style={{ width: '100%', padding: '0.65rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                            )}
                            <div>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: 4, color: '#374151' }}>
                                    {form.type === 'credits' ? 'Preço do pacote (R$) *' : 'Preço mensal (R$) *'}
                                </label>
                                <input
                                    required
                                    type="text"
                                    inputMode="decimal"
                                    value={form.price}
                                    onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                                    placeholder="Ex: 699,90"
                                    style={{ width: '100%', padding: '0.65rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                />
                            </div>
                            {form.type === 'monthly' && (
                                <div>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: 4, color: '#374151' }}>
                                        Preço anual total (R$)
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={form.annualPrice}
                                        onChange={e => setForm(f => ({ ...f, annualPrice: e.target.value }))}
                                        placeholder="Ex: 7198,80"
                                        style={{ width: '100%', padding: '0.65rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                    />
                                    {(() => {
                                        const anual = parseAmount(form.annualPrice);
                                        const mensal = parseAmount(form.price);
                                        if (!anual || !mensal || mensal <= 0) return null;
                                        const monthlyEquiv = anual / 12;
                                        const saving = mensal - monthlyEquiv;
                                        const pct = Math.round((saving / mensal) * 100);
                                        return (
                                            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#16a34a', fontWeight: 700 }}>
                                                🏷️ {pct > 0 ? `${pct}% de desconto` : 'Desconto'} · equivale a R$ {monthlyEquiv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mês
                                            </p>
                                        );
                                    })()}
                                    <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#6b7280' }}>
                                        Deixe em branco para não mostrar opção anual neste plano.
                                    </p>
                                </div>
                            )}
                            <div>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: 4, color: '#374151' }}>
                                    Recursos incluídos
                                </label>
                                <textarea
                                    rows={5}
                                    value={form.featuresText}
                                    onChange={e => setForm(f => ({ ...f, featuresText: e.target.value }))}
                                    placeholder={`Um recurso por linha. Ex:\nVisualização completa do estoque\nDados completos da concessionária\nNegociação direta sem intermediários`}
                                    style={{ width: '100%', padding: '0.65rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.875rem', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                                />
                                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#6b7280' }}>
                                    Aparece como lista de benefícios no card do plano na LP.
                                </p>
                            </div>
                            <div>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: 4, color: '#374151' }}>
                                    Preço por convidado (R$/mês)
                                </label>
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={form.invitePrice}
                                    onChange={e => setForm(f => ({ ...f, invitePrice: e.target.value }))}
                                    placeholder="Ex: 9,90"
                                    style={{ width: '100%', padding: '0.65rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                />
                                <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#6b7280' }}>
                                    Cobrado mensalmente por cada usuário convidado ativo.
                                </p>
                            </div>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={form.popular}
                                    onChange={e => setForm(f => ({ ...f, popular: e.target.checked }))}
                                    style={{ width: '16px', height: '16px' }}
                                />
                                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                                    Destacar como “Mais popular” na LP
                                </span>
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={form.active}
                                    onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                                    style={{ width: '16px', height: '16px' }}
                                />
                                <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                                    Plano ativo (visível para usuários)
                                </span>
                            </label>
                            {formError && (
                                <p role="alert" style={{
                                    margin: 0, padding: '0.65rem 0.875rem', borderRadius: '8px',
                                    background: '#fef2f2', border: '1px solid #fecaca',
                                    color: '#b91c1c', fontSize: '0.85rem', fontWeight: 600
                                }}>
                                    {formError}
                                </p>
                            )}
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    style={{
                                        flex: 1, background: '#f3f4f6', border: '1px solid #e5e7eb',
                                        borderRadius: '8px', padding: '0.75rem', fontWeight: 600, cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    style={{
                                        flex: 1, background: saving ? '#93c5fd' : '#2563eb',
                                        color: 'white', border: 'none', borderRadius: '8px',
                                        padding: '0.75rem', fontWeight: 700,
                                        cursor: saving ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {saving ? 'Salvando...' : 'Salvar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
