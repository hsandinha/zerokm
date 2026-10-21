'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import {
    Button, EmptyState, IconAction, Page, PageHeader, Panel, PanelFooter, PrimaryCell, RowActions, SkeletonRows, StatusBadge, TwoLine, pageStyles,
} from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';

type Publico = 'clientes' | 'concessionarias' | 'todos';

interface Aviso {
    id: string;
    titulo: string;
    mensagem: string;
    publico: Publico;
    linkUrl: string;
    linkTexto: string;
    ativo: boolean;
    inicio: string | null;
    fim: string | null;
    criadoPor: string | null;
    criadoEm: string;
    leituras: number;
}

type Form = { titulo: string; mensagem: string; publico: Publico; linkUrl: string; linkTexto: string; inicio: string; fim: string; ativo: boolean };
const FORM_VAZIO: Form = { titulo: '', mensagem: '', publico: 'clientes', linkUrl: '', linkTexto: '', inicio: '', fim: '', ativo: true };

const PUBLICO_LABEL: Record<Publico, string> = { clientes: 'Assinantes', concessionarias: 'Concessionárias', todos: 'Assinantes e concessionárias' };

/** Data guardada (horário de Brasília) para o campo date do formulário. */
const paraCampo = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10) : '');
const dataBR = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10).split('-').reverse().join('/') : '');

/**
 * Avisos gerais para os assinantes (pedido do Márcio): "Confira o novo campo
 * ORÇAMENTO", "Agora o CNV tem RENAVE". Administrador e Administrativo criam;
 * cada pessoa vê o aviso uma vez, ao entrar no painel, até fechar.
 */
export function AvisosManagement() {
    const [avisos, setAvisos] = useState<Aviso[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [editando, setEditando] = useState<Aviso | null>(null);
    const [aberto, setAberto] = useState(false);
    const [form, setForm] = useState<Form>(FORM_VAZIO);
    const [salvando, setSalvando] = useState(false);
    const [erroForm, setErroForm] = useState<string | null>(null);
    const { confirm, notify, feedback } = useFeedback();

    const carregar = useCallback(async () => {
        setCarregando(true);
        try {
            const res = await fetch('/api/admin/avisos');
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Não foi possível carregar os avisos.');
            setAvisos(Array.isArray(data) ? data : []);
            setErro(null);
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível carregar os avisos.');
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => { void carregar(); }, [carregar]);

    const abrirNovo = () => { setEditando(null); setForm(FORM_VAZIO); setErroForm(null); setAberto(true); };
    const abrirEdicao = (a: Aviso) => {
        setEditando(a);
        setForm({ titulo: a.titulo, mensagem: a.mensagem, publico: a.publico, linkUrl: a.linkUrl, linkTexto: a.linkTexto, inicio: paraCampo(a.inicio), fim: paraCampo(a.fim), ativo: a.ativo });
        setErroForm(null);
        setAberto(true);
    };

    const salvar = async (event: FormEvent) => {
        event.preventDefault();
        setSalvando(true);
        setErroForm(null);
        try {
            const res = await fetch(editando ? `/api/admin/avisos/${editando.id}` : '/api/admin/avisos', {
                method: editando ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Não foi possível salvar o aviso.');
            setAberto(false);
            notify(editando ? 'Aviso atualizado.' : 'Aviso publicado. Ele aparece na próxima vez que cada pessoa entrar.', 'positive');
            await carregar();
        } catch (e: any) {
            setErroForm(e?.message || 'Não foi possível salvar o aviso.');
        } finally {
            setSalvando(false);
        }
    };

    const alternar = async (a: Aviso) => {
        const res = await fetch(`/api/admin/avisos/${a.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ativo: !a.ativo }) });
        if (!res.ok) { notify('Não foi possível alterar o aviso.'); return; }
        await carregar();
    };

    const excluir = async (a: Aviso) => {
        const ok = await confirm({ title: 'Excluir aviso', description: <>O aviso <strong>{a.titulo}</strong> some para todos e o registro de leituras é apagado.</>, confirmLabel: 'Excluir aviso', danger: true });
        if (!ok) return;
        const res = await fetch(`/api/admin/avisos/${a.id}`, { method: 'DELETE' });
        if (!res.ok) { notify('Não foi possível excluir o aviso.'); return; }
        await carregar();
    };

    const situacao = (a: Aviso) => {
        const agora = Date.now();
        if (!a.ativo) return <StatusBadge>Desligado</StatusBadge>;
        if (a.inicio && new Date(a.inicio).getTime() > agora) return <StatusBadge tone="info">Agendado</StatusBadge>;
        if (a.fim && new Date(a.fim).getTime() < agora) return <StatusBadge>Encerrado</StatusBadge>;
        return <StatusBadge tone="positive">No ar</StatusBadge>;
    };

    return (
        <Page wide>
            <PageHeader
                title="Avisos"
                count={carregando ? null : avisos.length}
                description="Mensagens gerais para os assinantes e as concessionárias. Cada pessoa vê o aviso uma vez, ao entrar no painel."
                actions={<Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={abrirNovo}>Novo aviso</Button>}
            />
            <Panel>
                {erro && <div className={pageStyles.panelNotice}><InlineNotice>{erro}</InlineNotice></div>}
                <div className={pageStyles.tableWrap}>
                    <table className={pageStyles.table}>
                        <thead>
                            <tr>
                                <th>Aviso</th>
                                <th>Público</th>
                                <th>Período</th>
                                <th>Situação</th>
                                <th className={pageStyles.num}>Leituras</th>
                                <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {carregando && <SkeletonRows rows={3} columns={6} />}
                            {!carregando && avisos.map(a => (
                                <tr key={a.id} data-inactive={!a.ativo}>
                                    <td className={pageStyles.colMain}>
                                        <PrimaryCell title={a.titulo} subtitle={<span className={pageStyles.clamp2} title={a.mensagem}>{a.mensagem}</span>} />
                                    </td>
                                    <td>{PUBLICO_LABEL[a.publico]}</td>
                                    <td>
                                        <TwoLine
                                            nowrap
                                            top={a.inicio ? `De ${dataBR(a.inicio)}` : `Desde ${new Date(a.criadoEm).toLocaleDateString('pt-BR')}`}
                                            bottom={a.fim ? `até ${dataBR(a.fim)}` : 'sem data para sair'}
                                        />
                                    </td>
                                    <td>{situacao(a)}</td>
                                    <td className={pageStyles.num}>{a.leituras.toLocaleString('pt-BR')}</td>
                                    <td>
                                        <RowActions>
                                            <IconAction label={a.ativo ? 'Desligar aviso' : 'Ligar aviso'} onClick={() => alternar(a)}>
                                                {a.ativo ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                                            </IconAction>
                                            <IconAction label="Editar aviso" onClick={() => abrirEdicao(a)}>
                                                <Pencil size={17} aria-hidden="true" />
                                            </IconAction>
                                            <IconAction label="Excluir aviso" tone="danger" onClick={() => excluir(a)}>
                                                <Trash2 size={17} aria-hidden="true" />
                                            </IconAction>
                                        </RowActions>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {!carregando && avisos.length === 0 && !erro && (
                    <EmptyState
                        icon={<Megaphone size={20} />}
                        title="Nenhum aviso ainda"
                        description='Ex.: "Confira o novo campo ORÇAMENTO" ou "Agora o CNV tem RENAVE".'
                        action={<Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={abrirNovo}>Novo aviso</Button>}
                    />
                )}
                {!carregando && avisos.length > 0 && <PanelFooter>Mais recentes primeiro</PanelFooter>}
            </Panel>

            {aberto && (
                <AdminModal
                    size="md"
                    title={editando ? 'Editar aviso' : 'Novo aviso'}
                    subtitle="Aparece numa janela quando a pessoa entra no painel, até ela fechar."
                    onClose={() => setAberto(false)}
                    busy={salvando}
                    onSubmit={salvar}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={() => setAberto(false)} disabled={salvando}>Cancelar</button>
                        <button type="submit" className={modalStyles.primary} disabled={salvando}>{salvando ? 'Salvando...' : editando ? 'Salvar aviso' : 'Publicar aviso'}</button>
                    </>}
                >
                    <div className={modalStyles.stack}>
                        <label className={modalStyles.field}>
                            Título
                            <input type="text" required maxLength={120} value={form.titulo} onChange={e => setForm({ ...form, titulo: e.target.value })} placeholder="Confira o novo campo ORÇAMENTO" />
                        </label>
                        <label className={modalStyles.field}>
                            Mensagem
                            <textarea required maxLength={2000} value={form.mensagem} onChange={e => setForm({ ...form, mensagem: e.target.value })} placeholder="Agora o orçamento sai com a logo da sua loja..." />
                        </label>
                        <div className={modalStyles.grid2}>
                            <label className={modalStyles.field}>
                                Para quem
                                <select value={form.publico} onChange={e => setForm({ ...form, publico: e.target.value as Publico })}>
                                    <option value="clientes">Assinantes (clientes e teste grátis)</option>
                                    <option value="concessionarias">Concessionárias</option>
                                    <option value="todos">Assinantes e concessionárias</option>
                                </select>
                            </label>
                            <label className={modalStyles.field}>
                                Situação
                                <select value={form.ativo ? 'sim' : 'nao'} onChange={e => setForm({ ...form, ativo: e.target.value === 'sim' })}>
                                    <option value="sim">No ar</option>
                                    <option value="nao">Desligado (rascunho)</option>
                                </select>
                            </label>
                            <label className={modalStyles.field}>
                                Começa em (opcional)
                                <input type="date" value={form.inicio} onChange={e => setForm({ ...form, inicio: e.target.value })} />
                            </label>
                            <label className={modalStyles.field}>
                                Sai do ar em (opcional)
                                <input type="date" value={form.fim} min={form.inicio || undefined} onChange={e => setForm({ ...form, fim: e.target.value })} />
                            </label>
                            <label className={modalStyles.field}>
                                Link do botão (opcional)
                                <input type="url" value={form.linkUrl} onChange={e => setForm({ ...form, linkUrl: e.target.value })} placeholder="https://..." />
                            </label>
                            <label className={modalStyles.field}>
                                Texto do botão
                                <input type="text" maxLength={40} value={form.linkTexto} onChange={e => setForm({ ...form, linkTexto: e.target.value })} placeholder="Saiba mais" />
                            </label>
                        </div>
                        {erroForm && <InlineNotice>{erroForm}</InlineNotice>}
                    </div>
                </AdminModal>
            )}
            {feedback}
        </Page>
    );
}
