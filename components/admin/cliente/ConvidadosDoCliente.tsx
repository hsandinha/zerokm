'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, RotateCcw, Trash2, X } from 'lucide-react';
import { modalStyles } from '@/components/admin/AdminModal';
import { IconAction, RowActions, StatusBadge, pageStyles } from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';
import crmStyles from '../CRMManagement.module.css';
import { mascaraTelefone } from './tipos';

export interface Convidado {
    id: string;
    nome: string;
    email: string;
    telefone: string;
    status: string;
    monthlyPrice: number;
    createdAt: string;
}

/**
 * Convidados (telas extras) de um lojista: lista, inclui, edita, remove e
 * reativa, pelas rotas /api/admin/crm/invites. Era o modal "Gerenciar
 * convidados" do CRM; agora vive na aba Acessos da ficha e no cadastro guiado.
 */
export function ConvidadosDoCliente({ clienteEmail, onMudou, onQuantidade }: {
    clienteEmail: string;
    onMudou?: () => void;
    /** Quantos convidados ativos a conta tem, a cada carga da lista. */
    onQuantidade?: (ativos: number) => void;
}) {
    const [convidados, setConvidados] = useState<Convidado[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [form, setForm] = useState({ nome: '', email: '', telefone: '' });
    const [enviando, setEnviando] = useState(false);
    const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
    const [senha, setSenha] = useState<{ email: string; valor: string } | null>(null);
    const [editando, setEditando] = useState<{ id: string; nome: string; email: string; telefone: string } | null>(null);
    const [salvando, setSalvando] = useState(false);
    const { confirm, feedback } = useFeedback();

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const res = await fetch(`/api/admin/crm/invites?email=${encodeURIComponent(clienteEmail)}`);
            const data = await res.json();
            const lista: Convidado[] = Array.isArray(data) ? data : [];
            setConvidados(lista);
            onQuantidade?.(lista.filter(c => c.status !== 'cancelled').length);
        } catch {
            setConvidados([]);
        } finally {
            setCarregando(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clienteEmail]);

    useEffect(() => { carregar(); }, [carregar]);

    const mudou = () => { carregar(); onMudou?.(); };

    const adicionar = async () => {
        if (!form.nome.trim()) { setAviso({ ok: false, texto: 'Nome é obrigatório.' }); return; }
        if (!form.email.trim()) { setAviso({ ok: false, texto: 'E-mail é obrigatório.' }); return; }
        setEnviando(true);
        setAviso(null);
        setSenha(null);
        try {
            const res = await fetch('/api/admin/crm/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, inviterEmail: clienteEmail }),
            });
            const data = await res.json();
            if (res.ok) {
                setSenha({ email: form.email.trim().toLowerCase(), valor: data.tempPassword });
                setForm({ nome: '', email: '', telefone: '' });
                mudou();
            } else {
                setAviso({ ok: false, texto: data.error || 'Erro ao adicionar convidado.' });
            }
        } catch {
            setAviso({ ok: false, texto: 'Erro de conexão.' });
        } finally {
            setEnviando(false);
        }
    };

    const remover = async (id: string) => {
        const ok = await confirm({ title: 'Remover convidado', description: 'O convidado perde o acesso e deixa de ser cobrado na próxima fatura.', confirmLabel: 'Remover convidado', danger: true });
        if (!ok) return;
        try {
            await fetch(`/api/admin/crm/invites?id=${id}`, { method: 'DELETE' });
            mudou();
        } catch { /* a lista continua como estava */ }
    };

    const reativar = async (id: string) => {
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
                setAviso({ ok: true, texto: 'Convidado reativado.' });
                mudou();
            } else {
                setAviso({ ok: false, texto: data.error || 'Erro ao reativar.' });
            }
        } catch (err: any) {
            setAviso({ ok: false, texto: err?.message || 'Erro de conexão.' });
        }
    };

    const salvarEdicao = async () => {
        if (!editando) return;
        setSalvando(true);
        setAviso(null);
        try {
            const res = await fetch('/api/admin/crm/invites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editando),
            });
            const data = await res.json();
            if (data.ok) {
                setEditando(null);
                setAviso({ ok: true, texto: 'Convidado atualizado.' });
                mudou();
            } else {
                setAviso({ ok: false, texto: data.error || 'Erro ao atualizar.' });
            }
        } catch {
            setAviso({ ok: false, texto: 'Erro de conexão.' });
        } finally {
            setSalvando(false);
        }
    };

    return (
        <div className={modalStyles.stack}>
            <div className={modalStyles.row}>
                <label className={modalStyles.field}>
                    Nome do convidado
                    <input type="text" value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Nome completo" />
                </label>
                <label className={modalStyles.field}>
                    E-mail do convidado
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" />
                </label>
                <label className={modalStyles.field}>
                    Telefone do convidado
                    <input type="tel" value={form.telefone} onChange={e => setForm(f => ({ ...f, telefone: mascaraTelefone(e.target.value) }))} placeholder="(11) 99999-9999" />
                </label>
            </div>
            <div>
                <button type="button" className={modalStyles.secondary} onClick={adicionar} disabled={enviando || !form.nome.trim() || !form.email.trim()}>
                    {enviando ? 'Adicionando...' : 'Adicionar convidado'}
                </button>
            </div>

            {aviso && <InlineNotice tone={aviso.ok ? 'positive' : 'negative'}>{aviso.texto}</InlineNotice>}

            {senha && (
                <div className={crmStyles.passwordBox} role="status">
                    <strong>Convidado criado.</strong>
                    <span>Envie a senha temporária de {senha.email} para o primeiro acesso:</span>
                    <code className={crmStyles.passwordValue}>{senha.valor}</code>
                </div>
            )}

            {carregando ? (
                <p className={`${modalStyles.hint} ${modalStyles.flush}`}>Carregando convidados...</p>
            ) : convidados.length === 0 ? (
                <p className={`${modalStyles.hint} ${modalStyles.flush}`}>Nenhum convidado vinculado a esta conta.</p>
            ) : (
                <div className={pageStyles.tableWrap}>
                    <table className={pageStyles.table}>
                        <thead>
                            <tr>
                                <th>Nome</th>
                                <th>E-mail</th>
                                <th>Telefone</th>
                                <th>Situação</th>
                                <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {convidados.map(c => {
                                const emEdicao = editando?.id === c.id;
                                return (
                                    <tr key={c.id}>
                                        <td>
                                            {emEdicao
                                                ? <input className={crmStyles.planSelect} aria-label="Nome" value={editando.nome} onChange={e => setEditando(p => p ? { ...p, nome: e.target.value } : p)} />
                                                : <strong>{c.nome}</strong>}
                                        </td>
                                        <td>
                                            {emEdicao
                                                ? <input className={crmStyles.planSelect} aria-label="E-mail" value={editando.email} onChange={e => setEditando(p => p ? { ...p, email: e.target.value } : p)} />
                                                : c.email}
                                        </td>
                                        <td>
                                            {emEdicao
                                                ? <input className={crmStyles.planSelect} aria-label="Telefone" value={editando.telefone} onChange={e => setEditando(p => p ? { ...p, telefone: mascaraTelefone(e.target.value) } : p)} />
                                                : (c.telefone || '-')}
                                        </td>
                                        <td>
                                            <StatusBadge tone={c.status === 'accepted' ? 'positive' : c.status === 'pending' ? 'warning' : 'negative'}>
                                                {c.status === 'accepted' ? 'Ativo' : c.status === 'pending' ? 'Pendente' : 'Cancelado'}
                                            </StatusBadge>
                                        </td>
                                        <td>
                                            <RowActions>
                                                {emEdicao ? <>
                                                    <IconAction label={salvando ? 'Salvando' : 'Salvar convidado'} onClick={salvarEdicao}><Check size={17} aria-hidden="true" /></IconAction>
                                                    <IconAction label="Cancelar edição" onClick={() => setEditando(null)}><X size={17} aria-hidden="true" /></IconAction>
                                                </> : c.status !== 'cancelled' ? <>
                                                    <IconAction label="Editar convidado" onClick={() => setEditando({ id: c.id, nome: c.nome, email: c.email, telefone: c.telefone })}><Pencil size={17} aria-hidden="true" /></IconAction>
                                                    <IconAction label="Remover convidado" tone="danger" onClick={() => remover(c.id)}><Trash2 size={17} aria-hidden="true" /></IconAction>
                                                </> : (
                                                    <IconAction label="Reativar convidado" onClick={() => reativar(c.id)}><RotateCcw size={17} aria-hidden="true" /></IconAction>
                                                )}
                                            </RowActions>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
            {feedback}
        </div>
    );
}
