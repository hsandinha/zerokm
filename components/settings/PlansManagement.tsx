'use client';

import { useState, useEffect } from 'react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';

type Publico = 'cliente' | 'concessionaria';

interface Plan {
    id?: string;
    name: string;
    description: string;
    /** Planos antigos vêm sem o campo: são do lojista. */
    publico?: Publico;
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
    publico: Publico;
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
    name: '', description: '', publico: 'cliente', type: 'credits', credits: '', price: '',
    annualPrice: '', invitePrice: '', featuresText: '', popular: false, active: true
};

const planToForm = (p: Plan): PlanForm => ({
    name: p.name ?? '',
    description: p.description ?? '',
    publico: p.publico === 'concessionaria' ? 'concessionaria' : 'cliente',
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

        const isConcessionaria = form.publico === 'concessionaria';
        const payload = {
            name: form.name.trim(),
            description: form.description.trim(),
            publico: form.publico,
            type: isConcessionaria ? 'monthly' : form.type,
            credits: isConcessionaria ? null : credits,
            price,
            annualPrice,
            invitePrice: isConcessionaria ? 0 : (invitePrice ?? 0),
            // As linhas só são aparadas aqui: fazer isso a cada tecla apagava o
            // espaço recém-digitado e engolia a linha em branco do Enter.
            features: form.featuresText.split('\n').map(s => s.trim()).filter(Boolean),
            popular: isConcessionaria ? false : form.popular,
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '1.5rem' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '28px', fontWeight: 650 }}>Gerenciamento de Planos</h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--admin-muted, #6b7280)', fontSize: '0.875rem' }}>
                        Planos do lojista (mensal ou créditos) e planos da concessionária para anunciar repasse
                    </p>
                </div>
                <button
                    onClick={openCreate}
                    style={{
                        background: 'var(--admin-accent, #2563eb)', color: 'var(--admin-on-accent, white)', border: 'none',
                        borderRadius: '8px', padding: '0.6rem 1.25rem',
                        fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
                        flexShrink: 0
                    }}
                >
                    + Novo Plano
                </button>
            </div>

            {loading ? (
                <p style={{ color: 'var(--admin-muted, #9ca3af)' }}>Carregando...</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {plans.length === 0 && (
                        <p style={{ color: 'var(--admin-muted, #9ca3af)', fontStyle: 'italic', padding: '1rem 0' }}>
                            Nenhum plano cadastrado. Clique em "Novo Plano" para criar o primeiro.
                        </p>
                    )}
                    {plans.map(plan => (
                        <div
                            key={plan.id}
                            style={{
                                border: '1px solid var(--admin-border, #e5e7eb)',
                                borderRadius: '12px',
                                padding: '1rem 1.25rem',
                                display: 'flex',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap', gap: '16px',
                                alignItems: 'center',
                                background: plan.active ? 'var(--color-surface)' : 'var(--admin-panel, #f9fafb)',
                                opacity: plan.active ? 1 : 0.65
                            }}
                        >
                            <div>
                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{plan.name}</div>
                                {plan.description && (
                                    <div style={{ fontSize: '0.8rem', color: 'var(--admin-muted, #6b7280)', marginTop: '2px' }}>
                                        {plan.description}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{
                                        background: plan.publico === 'concessionaria' ? '#ede9fe' : 'var(--admin-panel, #f3f4f6)',
                                        color: plan.publico === 'concessionaria' ? '#5b21b6' : 'var(--admin-text, #374151)',
                                        borderRadius: '999px', padding: '2px 10px',
                                        fontSize: '0.75rem', fontWeight: 700
                                    }}>
                                        {plan.publico === 'concessionaria' ? 'Concessionária · repasse' : 'Lojista'}
                                    </span>
                                    <span style={{
                                        background: plan.type === 'monthly' ? '#dbeafe' : '#fef9c3',
                                        color: plan.type === 'monthly' ? '#1e40af' : '#854d0e',
                                        borderRadius: '999px', padding: '2px 10px',
                                        fontSize: '0.75rem', fontWeight: 700
                                    }}>
                                        {plan.type === 'monthly' ? 'Mensal' : `${plan.credits} créditos`}
                                    </span>
                                    <span style={{ fontWeight: 700, color: 'var(--admin-text, #374151)' }}>
                                        R$ {plan.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </span>
                                    {plan.invitePrice > 0 && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--admin-muted, #6b7280)' }}>
                                            + R$ {plan.invitePrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/convidado
                                        </span>
                                    )}
                                    {plan.annualPrice && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--admin-muted, #6b7280)' }}>
                                            | Anual: R$ {plan.annualPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    )}
                                    {plan.features?.length > 0 && (
                                        <span style={{ fontSize: '0.72rem', color: 'var(--admin-muted, #9ca3af)' }}>
                                            {plan.features.length} recurso(s)
                                        </span>
                                    )}
                                    {plan.popular && (
                                        <span style={{
                                            background: '#fef9c3', color: '#854d0e',
                                            borderRadius: '999px', padding: '2px 10px',
                                            fontSize: '0.72rem', fontWeight: 700
                                        }}>
                                            Mais popular
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
                                        background: 'var(--admin-panel, #f3f4f6)', color: 'var(--admin-text, #374151)',
                                        border: '1px solid var(--admin-border, #e5e7eb)', borderRadius: '6px',
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
                <AdminModal
                    title={editing ? 'Editar plano' : 'Novo plano'}
                    onClose={() => setShowModal(false)}
                    size="md"
                    busy={saving}
                    onSubmit={handleSave}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={() => setShowModal(false)}>
                            Cancelar
                        </button>
                        <button type="submit" className={modalStyles.primary} disabled={saving}>
                            {saving ? 'Salvando...' : 'Salvar'}
                        </button>
                    </>}
                >
                    <div className={modalStyles.stack}>
                        <label className={modalStyles.field}>
                            Nome do plano *
                            <input
                                required
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="Ex: Plano Profissional"
                            />
                        </label>
                        <label className={modalStyles.field}>
                            Descrição
                            <input
                                value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                placeholder="Descrição opcional"
                            />
                        </label>
                        <label className={modalStyles.field}>
                            Para quem é o plano *
                            <select
                                value={form.publico}
                                onChange={e => {
                                    const publico = e.target.value as Publico;
                                    setForm(f => ({ ...f, publico, ...(publico === 'concessionaria' ? { type: 'monthly' as const } : {}) }));
                                }}
                            >
                                <option value="cliente">Lojista (acesso à vitrine)</option>
                                <option value="concessionaria">Concessionária (anunciar repasse)</option>
                            </select>
                            {form.publico === 'concessionaria' && (
                                <span className={modalStyles.hint}>
                                    A concessionária contrata no painel Estoque e Preços, aba Repasse, e paga por PIX. Sempre mensal, com opção anual. Não aparece na landing nem para o lojista.
                                </span>
                            )}
                        </label>
                        {form.publico === 'cliente' && (
                            <label className={modalStyles.field}>
                                Tipo *
                                <select
                                    value={form.type}
                                    onChange={e => setForm(f => ({ ...f, type: e.target.value as 'monthly' | 'credits' }))}
                                >
                                    <option value="credits">Pacote de Créditos</option>
                                    <option value="monthly">Plano Mensal (ilimitado)</option>
                                </select>
                            </label>
                        )}
                        {form.publico === 'cliente' && form.type === 'credits' && (
                            <label className={modalStyles.field}>
                                Quantidade de créditos *
                                <input
                                    required
                                    type="text"
                                    inputMode="numeric"
                                    value={form.credits}
                                    onChange={e => setForm(f => ({ ...f, credits: e.target.value.replace(/\D/g, '') }))}
                                    placeholder="Ex: 10"
                                />
                            </label>
                        )}
                        <label className={modalStyles.field}>
                            {form.type === 'credits' ? 'Preço do pacote (R$) *' : 'Preço mensal (R$) *'}
                            <input
                                required
                                type="text"
                                inputMode="decimal"
                                value={form.price}
                                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                                placeholder="Ex: 699,90"
                            />
                        </label>
                        {form.type === 'monthly' && (
                            <label className={modalStyles.field}>
                                Preço anual total (R$)
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={form.annualPrice}
                                    onChange={e => setForm(f => ({ ...f, annualPrice: e.target.value }))}
                                    placeholder="Ex: 7198,80"
                                />
                                {(() => {
                                    const anual = parseAmount(form.annualPrice);
                                    const mensal = parseAmount(form.price);
                                    if (!anual || !mensal || mensal <= 0) return null;
                                    const monthlyEquiv = anual / 12;
                                    const saving = mensal - monthlyEquiv;
                                    const pct = Math.round((saving / mensal) * 100);
                                    return (
                                        <span style={{ fontSize: '0.8rem', color: 'var(--color-positive)', fontWeight: 700 }}>
                                            {pct > 0 ? `${pct}% de desconto` : 'Desconto'} · equivale a R$ {monthlyEquiv.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/mês
                                        </span>
                                    );
                                })()}
                                <span className={modalStyles.hint}>
                                    Deixe em branco para não mostrar opção anual neste plano.
                                </span>
                            </label>
                        )}
                        <label className={modalStyles.field}>
                            Recursos incluídos
                            <textarea
                                rows={5}
                                value={form.featuresText}
                                onChange={e => setForm(f => ({ ...f, featuresText: e.target.value }))}
                                placeholder={`Um recurso por linha. Ex:\nVisualização completa do estoque\nDados completos da concessionária\nNegociação direta sem intermediários`}
                                style={{ resize: 'vertical', fontFamily: 'inherit' }}
                            />
                            <span className={modalStyles.hint}>
                                {form.publico === 'concessionaria'
                                    ? 'Aparece na tela de contratação do painel da concessionária.'
                                    : 'Aparece como lista de benefícios no card do plano na LP.'}
                            </span>
                        </label>
                        {form.publico === 'cliente' && (
                            <label className={modalStyles.field}>
                                Preço por convidado (R$/mês)
                                <input
                                    type="text"
                                    inputMode="decimal"
                                    value={form.invitePrice}
                                    onChange={e => setForm(f => ({ ...f, invitePrice: e.target.value }))}
                                    placeholder="Ex: 9,90"
                                />
                                <span className={modalStyles.hint}>
                                    Cobrado mensalmente por cada usuário convidado ativo.
                                </span>
                            </label>
                        )}
                        <div className={modalStyles.choices}>
                            {form.publico === 'cliente' && (
                                <label className={modalStyles.choice}>
                                    <input
                                        type="checkbox"
                                        checked={form.popular}
                                        onChange={e => setForm(f => ({ ...f, popular: e.target.checked }))}
                                    />
                                    Destacar como “Mais popular” na LP
                                </label>
                            )}
                            <label className={modalStyles.choice}>
                                <input
                                    type="checkbox"
                                    checked={form.active}
                                    onChange={e => setForm(f => ({ ...f, active: e.target.checked }))}
                                />
                                Plano ativo (visível para usuários)
                            </label>
                        </div>
                        {formError && (
                            <p role="alert" style={{
                                margin: 0, padding: '0.65rem 0.875rem', borderRadius: '8px',
                                background: 'color-mix(in srgb, var(--color-negative) 10%, transparent)',
                                border: '1px solid color-mix(in srgb, var(--color-negative) 30%, transparent)',
                                color: 'var(--color-negative)', fontSize: '0.85rem', fontWeight: 600
                            }}>
                                {formError}
                            </p>
                        )}
                    </div>
                </AdminModal>
            )}
        </div>
    );
}
