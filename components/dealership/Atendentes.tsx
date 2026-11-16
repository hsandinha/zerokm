'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, Headset, Pencil, Power, Trash2, UserRoundCheck, UserRoundPlus } from 'lucide-react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';
import {
    Button, EmptyState, IconAction, Page, PageHeader, Panel, PanelFooter, PrimaryCell, RowActions, SkeletonRows, StatusBadge, pageStyles,
} from '@/components/ui/Page';

/**
 * Atendentes da concessionária: logins próprios que operam a mesma loja
 * (estoque, preços, repasse e atendimento), sem cobrança, plano nem dados
 * cadastrais. Regras em lib/utils/atendentesLoja.ts; a API é
 * /api/dealership/atendentes.
 *
 * O mesmo miolo serve os dois lugares: a aba Atendentes do painel da
 * concessionária (titular) e o modal da tela Concessionárias (equipe do CNV,
 * com `concessionariaId`).
 */

type Atendente = {
    id: string;
    nome: string;
    email: string;
    telefone: string;
    ativo: boolean;
    ultimoAcesso: string | null;
};

type Titular = { id: string; nome: string; email: string };

type Dados = {
    concessionaria: { id: string; nome: string };
    atendentes: Atendente[];
    titulares: Titular[];
    limite: number;
    ativos: number;
    podeMudarLimite: boolean;
};

const telefoneFormatado = (digitos: string) => {
    const d = digitos.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return digitos;
};

const dataDoAcesso = (iso: string | null) => (iso
    ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
    : 'Nunca acessou');

function useAtendentes(concessionariaId?: string) {
    const qs = concessionariaId ? `?concessionariaId=${encodeURIComponent(concessionariaId)}` : '';
    const [dados, setDados] = useState<Dados | null>(null);
    const [erro, setErro] = useState<string | null>(null);

    const chamar = useCallback(async (caminho: string, init?: RequestInit) => {
        const res = await fetch(`/api/dealership/atendentes${caminho}${qs}`, {
            ...init,
            headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || 'Não foi possível concluir. Tente de novo.');
        return body;
    }, [qs]);

    const carregar = useCallback(async () => {
        try {
            setDados(await chamar(''));
            setErro(null);
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível carregar os atendentes.');
        }
    }, [chamar]);

    useEffect(() => { void carregar(); }, [carregar]);

    return { dados, erro, chamar, carregar };
}

/** Cadastro e edição no mesmo modal. Na edição o e-mail fica travado: é o login. */
function AtendenteModal({ atendente, chamar, onClose, onSalvo }: {
    atendente: Atendente | null;
    chamar: (caminho: string, init?: RequestInit) => Promise<any>;
    onClose: () => void;
    onSalvo: (resultado: { nome: string; email: string; senhaProvisoria?: string }) => void;
}) {
    const [form, setForm] = useState({
        nome: atendente?.nome ?? '',
        email: atendente?.email ?? '',
        telefone: atendente ? telefoneFormatado(atendente.telefone) : '',
    });
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    const salvar = async (event: FormEvent) => {
        event.preventDefault();
        setSalvando(true);
        setErro(null);
        try {
            const body = JSON.stringify(form);
            const r = atendente
                ? await chamar(`/${atendente.id}`, { method: 'PATCH', body })
                : await chamar('', { method: 'POST', body });
            onSalvo({ nome: r.atendente.nome, email: r.atendente.email, senhaProvisoria: r.senhaProvisoria });
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível salvar.');
            setSalvando(false);
        }
    };

    return (
        <AdminModal
            size="md"
            title={atendente ? 'Editar atendente' : 'Novo atendente'}
            subtitle={atendente
                ? 'Nome e telefone de contato. O e-mail é o login e não muda.'
                : 'O atendente entra com o próprio e-mail e opera o estoque, os preços, o repasse e o atendimento da loja.'}
            onClose={onClose}
            busy={salvando}
            onSubmit={salvar}
            footer={<>
                <button type="button" className={modalStyles.secondary} onClick={onClose} disabled={salvando}>Cancelar</button>
                <button type="submit" className={modalStyles.primary} disabled={salvando || !form.nome.trim() || !form.email.trim()}>
                    {salvando ? 'Salvando...' : atendente ? 'Salvar' : 'Cadastrar atendente'}
                </button>
            </>}
        >
            <div className={modalStyles.grid2}>
                <label className={`${modalStyles.field} ${modalStyles.span2}`}>
                    Nome
                    <input type="text" required maxLength={80} autoFocus value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome e sobrenome" />
                </label>
                <label className={modalStyles.field}>
                    E-mail de acesso
                    <input type="email" required disabled={Boolean(atendente)} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="atendente@loja.com.br" />
                    {!atendente && <span className={modalStyles.hint}>Precisa ser um e-mail que ainda não tem cadastro no CNV.</span>}
                </label>
                <label className={modalStyles.field}>
                    Telefone / WhatsApp
                    <input type="tel" inputMode="tel" value={form.telefone} onChange={e => setForm({ ...form, telefone: e.target.value })} placeholder="(31) 99999-9999" />
                </label>
                {!atendente && (
                    <p className={`${modalStyles.hint} ${modalStyles.span2} ${modalStyles.flush}`}>
                        Ao cadastrar, mostramos uma senha provisória para você passar ao atendente. No primeiro acesso ele cria a própria senha.
                    </p>
                )}
                {erro && <div className={modalStyles.span2}><InlineNotice>{erro}</InlineNotice></div>}
            </div>
        </AdminModal>
    );
}

/** A senha provisória aparece uma vez só, para quem cadastrou repassar ao atendente. */
function SenhaProvisoriaModal({ nome, email, senha, onClose }: { nome: string; email: string; senha: string; onClose: () => void }) {
    const [copiado, setCopiado] = useState(false);
    const copiar = () => {
        void navigator.clipboard?.writeText(`Acesso ao CNV\nE-mail: ${email}\nSenha provisória: ${senha}`);
        setCopiado(true);
        setTimeout(() => setCopiado(false), 2000);
    };
    return (
        <AdminModal
            size="sm"
            title="Atendente cadastrado"
            subtitle={`Passe estes dados para ${nome}. A senha não aparece de novo.`}
            onClose={onClose}
            footer={<>
                <button type="button" className={modalStyles.secondary} onClick={copiar}>
                    <Copy size={15} aria-hidden="true" /> {copiado ? 'Copiado' : 'Copiar dados'}
                </button>
                <button type="button" className={modalStyles.primary} onClick={onClose}>Concluir</button>
            </>}
        >
            <div className={modalStyles.facts}>
                <div className={modalStyles.fact}>
                    <span className={modalStyles.factLabel}>E-mail de acesso</span>
                    <span className={modalStyles.factValue}>{email}</span>
                </div>
                <div className={modalStyles.fact}>
                    <span className={modalStyles.factLabel}>Senha provisória</span>
                    <strong className={modalStyles.factValue}>{senha}</strong>
                </div>
            </div>
            <p className={modalStyles.hint}>No primeiro acesso o atendente troca a senha.</p>
        </AdminModal>
    );
}

function Atendentes({ concessionariaId, emModal = false }: { concessionariaId?: string; emModal?: boolean }) {
    const { dados, erro, chamar, carregar } = useAtendentes(concessionariaId);
    const { confirm, notify, feedback } = useFeedback();
    const [formulario, setFormulario] = useState<{ atendente: Atendente | null } | null>(null);
    const [senha, setSenha] = useState<{ nome: string; email: string; senha: string } | null>(null);
    const [limite, setLimite] = useState('');
    const [ocupado, setOcupado] = useState(false);

    useEffect(() => { if (dados) setLimite(String(dados.limite)); }, [dados]);

    const executar = async (acao: () => Promise<unknown>, sucesso: string) => {
        setOcupado(true);
        try {
            await acao();
            notify(sucesso, 'positive');
            await carregar();
        } catch (e: any) {
            notify(e?.message || 'Não foi possível concluir. Tente de novo.');
        } finally {
            setOcupado(false);
        }
    };

    const alternar = async (a: Atendente) => {
        if (a.ativo) {
            const ok = await confirm({
                title: `Desativar ${a.nome}?`,
                description: 'O atendente sai do painel na hora e não consegue mais entrar. Nada do que ele fez é apagado, e você pode reativar depois.',
                confirmLabel: 'Desativar',
                danger: true,
            });
            if (!ok) return;
        }
        await executar(
            () => chamar(`/${a.id}`, { method: 'PATCH', body: JSON.stringify({ acao: a.ativo ? 'desativar' : 'reativar' }) }),
            a.ativo ? `${a.nome} foi desativado.` : `${a.nome} voltou a ter acesso.`,
        );
    };

    const remover = async (a: Atendente) => {
        const ok = await confirm({
            title: `Remover ${a.nome}?`,
            description: `O login ${a.email} é apagado e a sessão dele cai na hora. O estoque e os atendimentos da loja continuam como estão.`,
            confirmLabel: 'Remover atendente',
            danger: true,
        });
        if (!ok) return;
        await executar(() => chamar(`/${a.id}`, { method: 'DELETE' }), `${a.nome} foi removido.`);
    };

    const tornarAtendente = async (t: Titular) => {
        const ok = await confirm({
            title: `Tornar ${t.nome} atendente?`,
            description: 'Ele continua operando estoque, preços, repasse e atendimento, mas deixa de ver plano e cobrança e de gerenciar atendentes.',
            confirmLabel: 'Tornar atendente',
        });
        if (!ok) return;
        await executar(() => chamar(`/${t.id}`, { method: 'PATCH', body: JSON.stringify({ acao: 'tornar-atendente' }) }), `${t.nome} agora é atendente.`);
    };

    const salvarLimite = async (event: FormEvent) => {
        event.preventDefault();
        await executar(() => chamar('', { method: 'PUT', body: JSON.stringify({ limite }) }), 'Limite de atendentes atualizado.');
    };

    const semVaga = dados ? dados.ativos >= dados.limite : true;
    const novo = (
        <Button
            variant="primary"
            icon={<UserRoundPlus size={16} aria-hidden="true" />}
            onClick={() => setFormulario({ atendente: null })}
            disabled={!dados || semVaga}
            title={dados && semVaga ? 'Limite de atendentes ativos atingido' : undefined}
        >
            Novo atendente
        </Button>
    );
    const vagas = dados ? `${dados.ativos} de ${dados.limite} ${dados.limite === 1 ? 'vaga em uso' : 'vagas em uso'}` : '';

    const lista = (
        <Panel>
            <div className={pageStyles.tableWrap}>
                <table className={pageStyles.table}>
                    <thead>
                        <tr>
                            <th>Atendente</th>
                            <th>Telefone / WhatsApp</th>
                            <th>Situação</th>
                            <th>Último acesso</th>
                            <th aria-label="Ações" />
                        </tr>
                    </thead>
                    <tbody>
                        {!dados && !erro && <SkeletonRows rows={3} columns={5} />}
                        {dados?.atendentes.map(a => (
                            <tr key={a.id}>
                                <td className={pageStyles.colMain}><PrimaryCell title={a.nome} subtitle={a.email} /></td>
                                <td className={pageStyles.nowrap}>{a.telefone ? telefoneFormatado(a.telefone) : <span className={pageStyles.muted}>Não informado</span>}</td>
                                <td>{a.ativo ? <StatusBadge tone="positive">Ativo</StatusBadge> : <StatusBadge tone="negative">Desativado</StatusBadge>}</td>
                                <td className={pageStyles.nowrap}>{a.ultimoAcesso ? dataDoAcesso(a.ultimoAcesso) : <span className={pageStyles.muted}>Nunca acessou</span>}</td>
                                <td>
                                    <RowActions>
                                        <IconAction label={`Editar ${a.nome}`} onClick={() => setFormulario({ atendente: a })}>
                                            <Pencil size={17} aria-hidden="true" />
                                        </IconAction>
                                        <IconAction label={a.ativo ? `Desativar ${a.nome}` : `Reativar ${a.nome}`} onClick={() => { if (!ocupado) void alternar(a); }}>
                                            {a.ativo ? <Power size={17} aria-hidden="true" /> : <UserRoundCheck size={17} aria-hidden="true" />}
                                        </IconAction>
                                        <IconAction label={`Remover ${a.nome}`} tone="danger" onClick={() => { if (!ocupado) void remover(a); }}>
                                            <Trash2 size={17} aria-hidden="true" />
                                        </IconAction>
                                    </RowActions>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {dados && dados.atendentes.length === 0 && (
                <EmptyState
                    icon={<Headset size={20} />}
                    title="Nenhum atendente ainda"
                    description={dados.limite > 0
                        ? 'Cadastre quem atende na loja. Cada um entra com o próprio e-mail e vê o mesmo estoque.'
                        : 'Esta concessionária está sem vagas de atendente liberadas.'}
                    action={dados.limite > 0 ? novo : undefined}
                />
            )}

            {dados && (
                <PanelFooter aside={vagas}>
                    {dados.titulares.length > 0 && (
                        <>Titular: {dados.titulares.map((t, i) => (
                            <span key={t.id}>
                                {i > 0 && ', '}
                                <strong>{t.nome}</strong>
                                {dados.podeMudarLimite && dados.titulares.length > 1 && (
                                    <> (<button type="button" style={{ background: 'none', border: 0, padding: 0, color: 'var(--color-primary)', cursor: 'pointer', font: 'inherit' }} onClick={() => { if (!ocupado) void tornarAtendente(t); }}>tornar atendente</button>)</>
                                )}
                            </span>
                        ))}</>
                    )}
                </PanelFooter>
            )}
        </Panel>
    );

    const limiteDoCnv = dados?.podeMudarLimite && (
        <form onSubmit={salvarLimite} className={modalStyles.row} style={{ alignItems: 'end' }}>
            <label className={modalStyles.field}>
                Limite de atendentes ativos
                <input type="number" min={0} max={50} step={1} required value={limite} onChange={e => setLimite(e.target.value)} />
                <span className={modalStyles.hint}>Vale só para esta concessionária. Padrão: 5.</span>
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingBottom: 22 }}>
                <button type="submit" className={modalStyles.secondary} disabled={ocupado || limite === String(dados.limite)}>Salvar limite</button>
                {novo}
            </div>
        </form>
    );

    const modais = (
        <>
            {formulario && (
                <AtendenteModal
                    atendente={formulario.atendente}
                    chamar={chamar}
                    onClose={() => setFormulario(null)}
                    onSalvo={r => {
                        setFormulario(null);
                        if (r.senhaProvisoria) setSenha({ nome: r.nome, email: r.email, senha: r.senhaProvisoria });
                        else notify('Atendente atualizado.', 'positive');
                        void carregar();
                    }}
                />
            )}
            {senha && <SenhaProvisoriaModal {...senha} onClose={() => setSenha(null)} />}
            {feedback}
        </>
    );

    if (emModal) {
        return (
            <div className={modalStyles.stack}>
                {erro && <InlineNotice>{erro}</InlineNotice>}
                {limiteDoCnv}
                {lista}
                {modais}
            </div>
        );
    }

    return (
        <Page>
            <PageHeader
                title="Atendentes"
                count={dados ? dados.atendentes.length : null}
                description="Quem atende na loja, cada um com o próprio login. O atendente cuida do estoque, dos preços, do repasse e do atendimento. Plano, cobrança e cadastro da loja ficam com você."
                actions={novo}
            />
            {erro && <InlineNotice>{erro}</InlineNotice>}
            {dados && semVaga && dados.limite > 0 && (
                <InlineNotice tone="warning">
                    Você chegou ao limite de {dados.limite} {dados.limite === 1 ? 'atendente ativo' : 'atendentes ativos'}. Para cadastrar outro, desative ou remova um, ou peça ao CNV para aumentar o limite.
                </InlineNotice>
            )}
            {lista}
            {modais}
        </Page>
    );
}

/** Aba Atendentes do painel da concessionária (só o titular enxerga). */
export function AtendentesDaLoja() {
    return <Atendentes />;
}

/** Miolo dos atendentes de uma loja, sem página nem modal em volta: a ficha da concessionária (aba Acessos). */
export function AtendentesDaLojaMiolo({ concessionariaId }: { concessionariaId: string }) {
    return <Atendentes concessionariaId={concessionariaId} emModal />;
}

/** Atendentes de uma concessionária, na tela Concessionárias do admin. */
export function AtendentesDaLojaModal({ concessionaria, onClose }: { concessionaria: { id: string; nome: string }; onClose: () => void }) {
    return (
        <AdminModal
            size="lg"
            title={`Atendentes: ${concessionaria.nome}`}
            subtitle="Logins que operam o estoque, os preços, o repasse e o atendimento da loja, sem acesso a plano e cobrança."
            onClose={onClose}
            footer={<button type="button" className={modalStyles.secondary} onClick={onClose}>Fechar</button>}
        >
            <Atendentes concessionariaId={concessionaria.id} emModal />
        </AdminModal>
    );
}
