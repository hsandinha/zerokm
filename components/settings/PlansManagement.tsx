'use client';

import { useState, useEffect } from 'react';
import { Building2, CalendarRange, CreditCard, Eye, EyeOff, Pencil, Plus, Search, Store, Trash2 } from 'lucide-react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import {
    Button, EmptyState, IconAction, Page, PageHeader, Panel, PanelFooter, PanelToolbar, PrimaryCell, RowActions,
    SearchField, Segmented, ShowingCount, SkeletonRows, StatCard, StatGrid, StatusBadge, TwoLine, pageStyles,
} from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';

type Publico = 'cliente' | 'concessionaria';
type FiltroPublico = 'todos' | Publico;

const moeda = (valor: number) => valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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

/** Segunda linha da coluna Cobrança: anual, convidado ou uso do plano. */
function cobrancaDetalhe(plan: Plan) {
    if (plan.publico === 'concessionaria') return plan.annualPrice ? `Anual ${moeda(plan.annualPrice)} · anúncio de repasse` : 'Anúncio de repasse';
    const partes: string[] = [];
    if (plan.type === 'monthly') partes.push(plan.annualPrice ? `Anual ${moeda(plan.annualPrice)}` : 'Sem plano anual');
    else partes.push('Pacote avulso');
    if (plan.invitePrice > 0) partes.push(`+ ${moeda(plan.invitePrice)} por convidado`);
    return partes.join(' · ');
}

export function PlansManagement() {
    const [plans, setPlans] = useState<Plan[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<Plan | null>(null);
    const [form, setForm] = useState<PlanForm>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [filtro, setFiltro] = useState<FiltroPublico>('todos');
    const [busca, setBusca] = useState('');
    const { confirm, notify, feedback } = useFeedback();

    const fetchPlans = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/admin/plans');
            const data = await res.json().catch(() => null);
            if (!res.ok || !Array.isArray(data)) {
                setPlans([]);
                notify('Não foi possível carregar os planos.');
                return;
            }
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

    const handleDelete = async (plan: Plan) => {
        const ok = await confirm({
            title: 'Excluir plano',
            description: <>O plano <strong>{plan.name}</strong> sai do checkout e do painel. Assinaturas já feitas não são canceladas. Para só esconder, desative o plano.</>,
            confirmLabel: 'Excluir plano',
            danger: true,
        });
        if (!ok) return;
        const res = await fetch(`/api/admin/plans/${plan.id}`, { method: 'DELETE' });
        if (!res.ok) notify('Não foi possível excluir o plano. Tente de novo.');
        else notify('Plano excluído.', 'positive');
        fetchPlans();
    };

    const handleToggle = async (plan: Plan) => {
        const res = await fetch(`/api/admin/plans/${plan.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ active: !plan.active })
        });
        if (!res.ok) notify('Não foi possível alterar a situação do plano.');
        else notify(plan.active ? 'Plano desativado: saiu do checkout.' : 'Plano ativado: já aparece no checkout.', 'positive');
        fetchPlans();
    };

    const doPublico = (p: Plan): Publico => (p.publico === 'concessionaria' ? 'concessionaria' : 'cliente');
    const termo = busca.trim().toLocaleLowerCase('pt-BR');
    const visiveis = plans
        .filter(p => filtro === 'todos' || doPublico(p) === filtro)
        .filter(p => !termo || `${p.name} ${p.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(termo))
        .sort((a, b) => Number(b.active) - Number(a.active) || a.price - b.price);

    const ativos = plans.filter(p => p.active);
    const mensaisAtivos = ativos.filter(p => p.type === 'monthly');
    const comAnual = mensaisAtivos.filter(p => p.annualPrice);
    const lojista = plans.filter(p => doPublico(p) === 'cliente').length;
    const concessionaria = plans.length - lojista;

    return (
        <Page>
            <PageHeader
                title="Planos"
                count={loading ? null : plans.length}
                description="Planos do lojista (mensal ou créditos) e planos da concessionária para anunciar repasse."
                actions={<Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={openCreate}>Novo plano</Button>}
            />

            <StatGrid>
                <StatCard label="Planos ativos" icon={<CreditCard size={18} />} value={loading ? '-' : ativos.length} caption="Visíveis no checkout" />
                <StatCard label="Do lojista" icon={<Store size={18} />} value={loading ? '-' : plans.filter(p => p.active && doPublico(p) === 'cliente').length} caption="Ativos para acesso à vitrine" />
                <StatCard label="Da concessionária" icon={<Building2 size={18} />} value={loading ? '-' : plans.filter(p => p.active && doPublico(p) === 'concessionaria').length} caption="Ativos para anunciar repasse" />
                <StatCard
                    label="Com opção anual"
                    icon={<CalendarRange size={18} />}
                    value={loading ? '-' : `${comAnual.length} de ${mensaisAtivos.length}`}
                    progress={mensaisAtivos.length ? (comAnual.length / mensaisAtivos.length) * 100 : 0}
                    caption="Entre os planos mensais ativos"
                />
            </StatGrid>

            <Panel>
                <PanelToolbar>
                    <Segmented<FiltroPublico>
                        label="Filtrar por público"
                        value={filtro}
                        onChange={setFiltro}
                        options={[
                            { value: 'todos', label: 'Todos', count: plans.length },
                            { value: 'cliente', label: 'Lojista', count: lojista },
                            { value: 'concessionaria', label: 'Concessionária', count: concessionaria },
                        ]}
                    />
                    <SearchField value={busca} onChange={setBusca} placeholder="Buscar plano" />
                </PanelToolbar>

                <div className={pageStyles.tableWrap}>
                    <table className={pageStyles.table}>
                        <thead>
                            <tr>
                                <th>Plano</th>
                                <th>Público</th>
                                <th>Cobrança</th>
                                <th className={pageStyles.num}>Preço</th>
                                <th>Recursos</th>
                                <th>Situação</th>
                                <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <SkeletonRows rows={3} columns={7} />}
                            {!loading && visiveis.map(plan => (
                                <tr key={plan.id} data-inactive={!plan.active}>
                                    <td>
                                        <PrimaryCell
                                            title={<>{plan.name}{plan.popular && <> <StatusBadge tone="accent" dot={false}>Mais popular</StatusBadge></>}</>}
                                            subtitle={plan.description || undefined}
                                        />
                                    </td>
                                    <td>
                                        {doPublico(plan) === 'concessionaria'
                                            ? <StatusBadge tone="info" dot={false}>Concessionária</StatusBadge>
                                            : <StatusBadge dot={false}>Lojista</StatusBadge>}
                                    </td>
                                    <td>
                                        <TwoLine
                                            top={plan.type === 'monthly' ? 'Mensal' : `${plan.credits ?? 0} ${plan.credits === 1 ? 'crédito' : 'créditos'}`}
                                            bottom={cobrancaDetalhe(plan)}
                                        />
                                    </td>
                                    <td className={pageStyles.num}><strong>{moeda(plan.price)}</strong></td>
                                    <td>{plan.features?.length ? `${plan.features.length} ${plan.features.length === 1 ? 'recurso' : 'recursos'}` : <span className={pageStyles.muted}>Nenhum</span>}</td>
                                    <td>{plan.active ? <StatusBadge tone="positive">Ativo</StatusBadge> : <StatusBadge>Inativo</StatusBadge>}</td>
                                    <td>
                                        <RowActions>
                                            <IconAction label={plan.active ? 'Desativar plano' : 'Ativar plano'} onClick={() => handleToggle(plan)}>
                                                {plan.active ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                                            </IconAction>
                                            <IconAction label="Editar plano" onClick={() => openEdit(plan)}>
                                                <Pencil size={17} aria-hidden="true" />
                                            </IconAction>
                                            <IconAction label="Excluir plano" tone="danger" onClick={() => handleDelete(plan)}>
                                                <Trash2 size={17} aria-hidden="true" />
                                            </IconAction>
                                        </RowActions>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {!loading && visiveis.length === 0 && (
                    plans.length === 0
                        ? <EmptyState
                            icon={<CreditCard size={20} />}
                            title="Nenhum plano cadastrado"
                            description="Crie o primeiro plano para o lojista ou para a concessionária. Ele aparece no checkout assim que estiver ativo."
                            action={<Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={openCreate}>Novo plano</Button>}
                        />
                        : <EmptyState icon={<Search size={20} />} title="Nenhum plano encontrado" description="Ajuste a busca ou o filtro de público." />
                )}

                {!loading && plans.length > 0 && (
                    <PanelFooter aside="Ativos primeiro, depois por preço">
                        <ShowingCount shown={visiveis.length} total={plans.length} singular="plano" plural="planos" />
                    </PanelFooter>
                )}
            </Panel>

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
                                        <span className={modalStyles.hintPositive}>
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
                        {formError && <InlineNotice>{formError}</InlineNotice>}
                    </div>
                </AdminModal>
            )}
            {feedback}
        </Page>
    );
}
