'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { KeyRound, UserPlus } from 'lucide-react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { InlineNotice } from '@/components/ui/Feedback';
import { StatusBadge, pageStyles } from '@/components/ui/Page';
import {
    criarUsuarioDaLoja, desvincularUsuarioDaLoja, listarUsuariosDaLoja, redefinirSenhaDoUsuarioDaLoja, type UsuarioDaLoja,
} from '@/app/dashboard/admin/users/actions';

/**
 * Logins de uma concessionária, criados e vinculados direto na tela
 * Concessionárias (pedido do Marcelo e do Márcio): na Equipe os contatos das
 * lojas se misturavam com a equipe interna e era difícil achar e vincular.
 *
 * O miolo (lista, redefinir senha, desvincular e novo usuário) serve dois
 * lugares: este modal e a aba Acessos da ficha da concessionária.
 */
export function UsuariosDaLoja({ concessionaria, onMudou, onOcupado }: {
    concessionaria: { id: string; nome: string };
    /** Chamado depois de criar, vincular ou desvincular (a ficha atualiza as pendências). */
    onMudou?: () => void;
    onOcupado?: (ocupado: boolean) => void;
}) {
    const [usuarios, setUsuarios] = useState<UsuarioDaLoja[] | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [form, setForm] = useState({ nome: '', email: '', senha: '' });
    const [salvando, setSalvandoEstado] = useState(false);
    const [redefinindo, setRedefinindo] = useState<{ uid: string; senha: string } | null>(null);

    const setSalvando = (v: boolean) => { setSalvandoEstado(v); onOcupado?.(v); };

    const carregar = useCallback(async () => {
        const r = await listarUsuariosDaLoja(concessionaria.id);
        if (r.success) setUsuarios(r.usuarios || []);
        else setErro(r.error === 'Unauthorized' ? 'Seu perfil não pode gerenciar usuários.' : r.error || 'Não foi possível carregar os usuários.');
    }, [concessionaria.id]);

    useEffect(() => { void carregar(); }, [carregar]);

    const criar = async (event: FormEvent) => {
        event.preventDefault();
        setSalvando(true);
        setErro(null);
        setAviso(null);
        const r = await criarUsuarioDaLoja({
            dealershipId: concessionaria.id,
            email: form.email,
            displayName: form.nome,
            password: form.senha || undefined,
        });
        setSalvando(false);
        if (!r.success) {
            setErro(r.error === 'Unauthorized' ? 'Seu perfil não pode criar usuários.' : r.error || 'Não foi possível criar o usuário.');
            return;
        }
        setAviso(r.vinculado
            ? `${form.email} já tinha login e foi vinculado a ${concessionaria.nome}.`
            : `Login criado. ${r.senhaProvisoria ? `Senha provisória: ${r.senhaProvisoria}. ` : ''}No primeiro acesso a pessoa troca a senha.`);
        setForm({ nome: '', email: '', senha: '' });
        await carregar();
        onMudou?.();
    };

    const desvincular = async (u: UsuarioDaLoja) => {
        setErro(null);
        setAviso(null);
        const r = await desvincularUsuarioDaLoja(u.uid);
        if (!r.success) {
            setErro(r.error || 'Não foi possível desvincular.');
            return;
        }
        setAviso(`${u.email} não acessa mais o painel de ${concessionaria.nome}.`);
        await carregar();
        onMudou?.();
    };

    const redefinir = async (event: FormEvent, u: UsuarioDaLoja) => {
        event.preventDefault();
        if (!redefinindo) return;
        setSalvando(true);
        setErro(null);
        setAviso(null);
        const r = await redefinirSenhaDoUsuarioDaLoja({ dealershipId: concessionaria.id, uid: u.uid, password: redefinindo.senha });
        setSalvando(false);
        if (!r.success) {
            setErro(r.error === 'Unauthorized' ? 'Seu perfil não pode redefinir senhas.' : r.error || 'Não foi possível redefinir a senha.');
            return;
        }
        setRedefinindo(null);
        setAviso(`Senha de ${u.email} redefinida. Passe a senha provisória para a pessoa: no próximo acesso ela cria a dela.`);
    };

    return (
        <div className={modalStyles.stack}>
            <section>
                <div className={modalStyles.sectionHead}><h3 className={modalStyles.sectionTitle}>Com acesso</h3></div>
                {usuarios === null && !erro && <p className={pageStyles.muted}>Carregando...</p>}
                {usuarios?.length === 0 && <p className={pageStyles.muted}>Nenhum usuário vinculado ainda.</p>}
                {usuarios && usuarios.length > 0 && (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {usuarios.map(u => (
                            <li key={u.uid} style={{ padding: '8px 0', borderBottom: '1px solid var(--admin-border, var(--color-highlight))' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                                    <span style={{ minWidth: 0 }}>
                                        <strong>{u.displayName || u.email}</strong>
                                        <span className={pageStyles.subLine}>{u.email}{u.lastSignInTime ? ` · último acesso ${new Date(u.lastSignInTime).toLocaleDateString('pt-BR')}` : ' · nunca acessou'}</span>
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {u.disabled && <StatusBadge tone="negative">Desativado</StatusBadge>}
                                        <button
                                            type="button"
                                            className={modalStyles.secondary}
                                            onClick={() => setRedefinindo(redefinindo?.uid === u.uid ? null : { uid: u.uid, senha: '' })}
                                            disabled={salvando}
                                        >
                                            <KeyRound size={15} aria-hidden="true" /> Redefinir senha
                                        </button>
                                        <button type="button" className={modalStyles.danger} onClick={() => desvincular(u)} disabled={salvando}>Desvincular</button>
                                    </span>
                                </div>
                                {redefinindo?.uid === u.uid && (
                                    <form onSubmit={e => redefinir(e, u)} className={modalStyles.row} style={{ alignItems: 'end', marginTop: 10 }}>
                                        <label className={modalStyles.field}>
                                            Nova senha provisória de {u.displayName || u.email}
                                            <input
                                                type="text"
                                                required
                                                minLength={6}
                                                autoFocus
                                                value={redefinindo.senha}
                                                onChange={e => setRedefinindo({ uid: u.uid, senha: e.target.value })}
                                                placeholder="Mínimo de 6 caracteres"
                                            />
                                        </label>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            <button type="button" className={modalStyles.secondary} onClick={() => setRedefinindo(null)} disabled={salvando}>Cancelar</button>
                                            <button type="submit" className={modalStyles.primary} disabled={salvando || redefinindo.senha.length < 6}>
                                                {salvando ? 'Salvando...' : 'Salvar senha'}
                                            </button>
                                        </div>
                                    </form>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <form onSubmit={criar} className={modalStyles.stack}>
                <div className={modalStyles.sectionHead}><h3 className={modalStyles.sectionTitle}>Novo usuário</h3></div>
                <div className={modalStyles.grid2}>
                    <label className={modalStyles.field}>
                        Nome
                        <input type="text" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Gerente da loja" />
                    </label>
                    <label className={modalStyles.field}>
                        E-mail de acesso
                        <input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="gerente@loja.com.br" />
                    </label>
                </div>
                <label className={modalStyles.field}>
                    Senha provisória (opcional)
                    <input type="text" minLength={6} value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="Em branco: gera uma senha aleatória" />
                    <span className={modalStyles.hint}>A pessoa troca a senha no primeiro acesso. Se o e-mail já tiver login, ele só é vinculado à loja.</span>
                </label>
                {erro && <InlineNotice>{erro}</InlineNotice>}
                {aviso && <InlineNotice tone="positive">{aviso}</InlineNotice>}
                <div>
                    <button type="submit" className={modalStyles.primary} disabled={salvando || !form.email.trim()}>
                        <UserPlus size={16} aria-hidden="true" /> {salvando ? 'Salvando...' : 'Criar e vincular'}
                    </button>
                </div>
            </form>
        </div>
    );
}

export function UsuariosDaLojaModal({ concessionaria, onClose }: { concessionaria: { id: string; nome: string }; onClose: () => void }) {
    const [salvando, setSalvando] = useState(false);
    return (
        <AdminModal
            size="md"
            title={`Usuários da loja: ${concessionaria.nome}`}
            subtitle="Quem acessa o painel da concessionária (estoque, preços e repasse)."
            onClose={onClose}
            busy={salvando}
            footer={<button type="button" className={modalStyles.secondary} onClick={onClose} disabled={salvando}>Fechar</button>}
        >
            <UsuariosDaLoja concessionaria={concessionaria} onOcupado={setSalvando} />
        </AdminModal>
    );
}
