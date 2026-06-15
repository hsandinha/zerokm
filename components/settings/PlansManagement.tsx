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

const emptyPlan: Plan = {
    name: '', description: '', type: 'credits', credits: null, price: 0,
    annualPrice: null, invitePrice: 0, features: [], popular: false, active: true
};

export function PlansManagement() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Plan | null>(null);
    const [form, setForm] = useState<Plan>(emptyPlan);
    const [saving, setSaving] = useState(false);

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

    const openCreate = () => {
        setEditing(null);
        setForm(emptyPlan);
        setShowModal(true);
    };

    const openEdit = (p: Plan) => {
        setEditing(p);
        setForm({ ...p });
        setShowModal(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                ...form,
                credits: form.type === 'monthly' ? null : form.credits,
                annualPrice: form.annualPrice || null,
            };
            if (editing?.id) {
                await fetch(`/api/admin/plans/${editing.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            } else {
                await fetch('/api/admin/plans', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
            }
            setShowModal(false);
            fetchPlans();
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Excluir este plano permanentemente?')) return;
        await fetch(`/api/admin/plans/${id}`, { method: 'DELETE' });
        fetchPlans();
    };

    const handleToggle = async (plan: Plan) => {
        await fetch(`/api/admin/plans/${plan.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: !plan.active })
        });
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
                                        type="number"
                                        min={1}
                                        value={form.credits ?? ''}
                                        onChange={e => setForm(f => ({ ...f, credits: parseInt(e.target.value) || null }))}
                                        placeholder="Ex: 10"
                                        style={{ width: '100%', padding: '0.65rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                            )}
                            <div>
                                <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: 4, color: '#374151' }}>
                                    Preço mensal (R$) *
                                </label>
                                <input
                                    required
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={form.price}
                                    onChange={e => setForm(f => ({ ...f, price: parseFloat(e.target.value) || 0 }))}
                                    placeholder="Ex: 699.90"
                                    style={{ width: '100%', padding: '0.65rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                />
                            </div>
                            {form.type === 'monthly' && (
                                <div>
                                    <label style={{ fontSize: '0.875rem', fontWeight: 600, display: 'block', marginBottom: 4, color: '#374151' }}>
                                        Preço anual total (R$)
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        step={0.01}
                                        value={form.annualPrice ?? ''}
                                        onChange={e => setForm(f => ({ ...f, annualPrice: parseFloat(e.target.value) || null }))}
                                        placeholder="Ex: 7198.80"
                                        style={{ width: '100%', padding: '0.65rem 0.875rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.95rem', boxSizing: 'border-box' }}
                                    />
                                    {form.annualPrice && form.price > 0 && (() => {
                                        const monthlyEquiv = form.annualPrice / 12;
                                        const saving = form.price - monthlyEquiv;
                                        const pct = Math.round((saving / form.price) * 100);
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
                                    value={(form.features ?? []).join('\n')}
                                    onChange={e => setForm(f => ({ ...f, features: e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }))}
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
                                    type="number"
                                    min={0}
                                    step={0.01}
                                    value={form.invitePrice}
                                    onChange={e => setForm(f => ({ ...f, invitePrice: parseFloat(e.target.value) || 0 }))}
                                    placeholder="Ex: 9.90"
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
