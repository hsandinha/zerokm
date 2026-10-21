'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { UserPlus } from 'lucide-react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { InlineNotice } from '@/components/ui/Feedback';
import { StatusBadge, pageStyles } from '@/components/ui/Page';
import {
    criarUsuarioDaLoja, desvincularUsuarioDaLoja, listarUsuariosDaLoja, type UsuarioDaLoja,
} from '@/app/dashboard/admin/users/actions';

/**
 * Logins de uma concessionária, criados e vinculados direto na tela
 * Concessionárias (pedido do Marcelo e do Márcio): na Equipe os contatos das
 * lojas se misturavam com a equipe interna e era difícil achar e vincular.
 */
export function UsuariosDaLojaModal({ concessionaria, onClose }: { concessionaria: { id: string; nome: string }; onClose: () => void }) {
    const [usuarios, setUsuarios] = useState<UsuarioDaLoja[] | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [form, setForm] = useState({ nome: '', email: '', senha: '' });
    const [salvando, setSalvando] = useState(false);

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
    };

    return (
        <AdminModal
            size="md"
            title={`Usuários da loja: ${concessionaria.nome}`}
            subtitle="Quem acessa o painel da concessionária (estoque, preços e repasse)."
            onClose={onClose}
            busy={salvando}
            footer={<button type="button" className={modalStyles.secondary} onClick={onClose} disabled={salvando}>Fechar</button>}
        >
            <div className={modalStyles.stack}>
                <section>
                    <div className={modalStyles.sectionHead}><h3 className={modalStyles.sectionTitle}>Com acesso</h3></div>
                    {usuarios === null && !erro && <p className={pageStyles.muted}>Carregando...</p>}
                    {usuarios?.length === 0 && <p className={pageStyles.muted}>Nenhum usuário vinculado ainda.</p>}
                    {usuarios && usuarios.length > 0 && (
                        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                            {usuarios.map(u => (
                                <li key={u.uid} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--admin-border, var(--color-highlight))' }}>
                                    <span style={{ minWidth: 0 }}>
                                        <strong>{u.displayName || u.email}</strong>
                                        <span className={pageStyles.subLine}>{u.email}{u.lastSignInTime ? ` · último acesso ${new Date(u.lastSignInTime).toLocaleDateString('pt-BR')}` : ' · nunca acessou'}</span>
                                    </span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        {u.disabled && <StatusBadge tone="negative">Desativado</StatusBadge>}
                                        <button type="button" className={modalStyles.danger} onClick={() => desvincular(u)} disabled={salvando}>Desvincular</button>
                                    </span>
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
                        <input type="text" minLength={6} value={form.senha} onChange={e => setForm({ ...form, senha: e.target.value })} placeholder="Em branco: mudar123" />
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
        </AdminModal>
    );
}
