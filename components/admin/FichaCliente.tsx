'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AdminModal, modalStyles } from './AdminModal';
import crmStyles from './CRMManagement.module.css';
import styles from './FichaCliente.module.css';
import { StatusBadge, type BadgeTone } from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';
import { ClienteFinanceiro } from './ClienteFinanceiro';
import { ClienteLogoField } from './ClienteLogoField';
import { ValorCombinadoCliente } from './ValorCombinadoCliente';
import { AtribuirPlanoModal } from './cliente/AtribuirPlano';
import { ConvidadosDoCliente } from './cliente/ConvidadosDoCliente';
import { AtendimentoDoCliente } from './cliente/AtendimentoDoCliente';
import {
    STATUS_LABELS, STATUS_TONE, brl, carregarPlanosDoLojista, emailLink, formatDate, getPaymentInfo, whatsappLink,
    type CRMClient, type PlanoDoLojista,
} from './cliente/tipos';
import { pendenciasDoCliente } from '@/lib/utils/pendenciasDoCliente';
import { linkInstagram, normalizarInstagram } from '@/lib/utils/instagram';
import { getUserAccessStatus, updateUserProfiles, toggleUserStatus, deleteUser } from '@/app/dashboard/admin/users/actions';
import { toggleProfileSelection, DIRETIVO_PROFILES, OPERACIONAL_PROFILES, CLIENT_PROFILES } from '@/lib/utils/userProfiles';
import type { UserProfile } from '@/lib/types/auth';

export type AbaDaFicha = 'dados' | 'acessos' | 'planos' | 'cobrancas' | 'atividade';

const ABAS: Array<[AbaDaFicha, string]> = [
    ['dados', 'Dados'],
    ['acessos', 'Acessos'],
    ['planos', 'Planos e assinaturas'],
    ['cobrancas', 'Cobranças'],
    ['atividade', 'Atividade'],
];

const NOME_PERFIL: Record<string, string> = {
    administrador: 'Administrador', gerente: 'Gerente', marketing: 'Marketing',
    operador: 'Operador', vendedor: 'Vendedor', administrativo: 'Administrativo', concessionaria: 'Concessionária',
};

type FormDeDados = {
    displayName: string;
    phoneNumber: string;
    cpf: string;
    instagram: string;
    address: { street: string; number: string; complement: string; neighborhood: string; city: string; state: string; zipCode: string };
};

export interface FichaClienteModalProps {
    /** _id do usuário (o `id` da lista do CRM). */
    userId: string;
    abaInicial?: AbaDaFicha;
    onClose: () => void;
    /** Algo mudou no cadastro (dados, plano, acesso, convidados): a lista de quem abriu deve recarregar. */
    onMudou?: () => void;
}

function Secao({ titulo, aside, perigo, children }: { titulo: string; aside?: ReactNode; perigo?: boolean; children: ReactNode }) {
    return (
        <div className={crmStyles.clientSection}>
            <div className={crmStyles.clientSectionHeader}>
                <span className={`${crmStyles.clientSectionTitle} ${perigo ? crmStyles.dangerTitle : ''}`}>{titulo}</span>
                {aside}
            </div>
            {children}
        </div>
    );
}

function Campo({ rotulo, largo, children }: { rotulo: string; largo?: boolean; children: ReactNode }) {
    return (
        <div className={`${crmStyles.clientFormField} ${largo ? crmStyles.spanFull : ''}`}>
            <label className={crmStyles.clientFormLabel}>{rotulo}</label>
            {children}
        </div>
    );
}

/**
 * Ficha do lojista: tudo de uma conta num modal só. Dados, acessos (login do
 * titular e convidados), planos e assinaturas (plano de zero km e atendimento),
 * cobranças e atividade. Substitui o modal de detalhe do CRM e reaproveita as
 * mesmas rotas (/api/admin/crm/**, /api/admin/clientes/**, /api/admin/cobrancas).
 */
export function FichaClienteModal({ userId, abaInicial = 'dados', onClose, onMudou }: FichaClienteModalProps) {
    const [client, setClient] = useState<CRMClient | null>(null);
    const [erroDeCarga, setErroDeCarga] = useState<string | null>(null);
    const [aba, setAba] = useState<AbaDaFicha>(abaInicial);
    const [plans, setPlans] = useState<PlanoDoLojista[]>([]);
    const [vendedores, setVendedores] = useState<{ id: string; displayName: string }[]>([]);
    const { confirm, notify, feedback } = useFeedback();

    // Dados
    const [editForm, setEditForm] = useState<FormDeDados | null>(null);
    const [salvandoDados, setSalvandoDados] = useState(false);
    const [erroDados, setErroDados] = useState<string | null>(null);
    const [vinculandoVendedor, setVinculandoVendedor] = useState(false);

    // Acessos (Firebase)
    const [acesso, setAcesso] = useState<{ disabled: boolean; profiles: UserProfile[] } | null>(null);
    const [acessoLoading, setAcessoLoading] = useState(false);
    const [acessoMsg, setAcessoMsg] = useState<{ ok: boolean; texto: string } | null>(null);
    const [senhaProvisoria, setSenhaProvisoria] = useState<string | null>(null);

    // Planos
    const [atribuindo, setAtribuindo] = useState(false);
    const [cobrando, setCobrando] = useState(false);
    const [renovandoTeste, setRenovandoTeste] = useState(false);
    const [avisoTeste, setAvisoTeste] = useState<{ ok: boolean; msg: string } | null>(null);

    const carregar = useCallback(async () => {
        try {
            const res = await fetch(`/api/admin/crm?id=${encodeURIComponent(userId)}`, { cache: 'no-store' });
            const data = await res.json();
            const achado: CRMClient | undefined = data?.client ?? (data?.clients || []).find((c: CRMClient) => c.id === userId);
            if (achado) {
                setClient(achado);
                setErroDeCarga(null);
            } else {
                setErroDeCarga(data?.error || 'Cliente não encontrado.');
            }
        } catch {
            setErroDeCarga('Erro ao carregar o cliente.');
        }
    }, [userId]);

    useEffect(() => { carregar(); }, [carregar]);

    useEffect(() => {
        carregarPlanosDoLojista().then(setPlans).catch(() => { /* sem planos, só não dá para atribuir */ });
        fetch('/api/admin/vendedores')
            .then(r => r.json())
            .then((data: any) => {
                if (Array.isArray(data)) setVendedores(data.map(u => ({ id: u._id || u.id || '', displayName: u.displayName || u.email })));
            })
            .catch(() => {});
    }, []);

    const mudou = useCallback(() => { carregar(); onMudou?.(); }, [carregar, onMudou]);

    // O estado do login vive no Firebase: uma consulta só, ao abrir a ficha.
    const firebaseUid = client?.firebaseUid || null;
    const carregarAcesso = useCallback(async (uid: string) => {
        setAcessoLoading(true);
        setAcessoMsg(null);
        const r = await getUserAccessStatus(uid);
        if (r.success) setAcesso({ disabled: !!r.disabled, profiles: (r.allowedProfiles ?? []) as UserProfile[] });
        else setAcessoMsg({ ok: false, texto: r.error || 'Falha ao consultar o acesso.' });
        setAcessoLoading(false);
    }, []);
    useEffect(() => { if (firebaseUid) carregarAcesso(firebaseUid); }, [firebaseUid, carregarAcesso]);

    const pendencias = useMemo(
        () => (client ? pendenciasDoCliente({ ...client, loginDesativado: acesso?.disabled ?? null }) : []),
        [client, acesso],
    );

    if (!client) {
        return (
            <AdminModal size="xl" title="Ficha do cliente" onClose={onClose}>
                {erroDeCarga
                    ? <InlineNotice>{erroDeCarga}</InlineNotice>
                    : <p className={`${modalStyles.hint} ${modalStyles.flush}`}>Carregando a ficha...</p>}
            </AdminModal>
        );
    }

    const nome = client.displayName || client.email;
    const wa = whatsappLink(client.phoneNumber, client.displayName, client.status);
    const corDaConclusao = client.profileCompletion < 40 ? 'var(--color-negative)' : client.profileCompletion < 100 ? 'var(--color-warning)' : 'var(--color-positive)';

    /* ───────── Dados ───────── */

    const editar = () => {
        setEditForm({
            displayName: client.displayName,
            phoneNumber: client.phoneNumber,
            cpf: client.cpf || '',
            instagram: client.instagram || '',
            address: {
                street: client.address?.street || '',
                number: client.address?.number || '',
                complement: client.address?.complement || '',
                neighborhood: client.address?.neighborhood || '',
                city: client.address?.city || '',
                state: client.address?.state || '',
                zipCode: client.address?.zipCode || '',
            },
        });
        setErroDados(null);
    };

    const mudarEndereco = (campo: keyof FormDeDados['address'], valor: string) =>
        setEditForm(f => (f ? { ...f, address: { ...f.address, [campo]: valor } } : f));

    const mudarCep = async (val: string) => {
        const zipCode = val.replace(/\D/g, '');
        mudarEndereco('zipCode', zipCode.length > 5 ? `${zipCode.slice(0, 5)}-${zipCode.slice(5, 8)}` : zipCode);
        if (zipCode.length !== 8) return;
        try {
            const res = await fetch(`https://viacep.com.br/ws/${zipCode}/json/`);
            const data = await res.json();
            if (data.erro) return;
            setEditForm(f => f ? {
                ...f,
                address: {
                    ...f.address,
                    street: data.logradouro || f.address.street,
                    neighborhood: data.bairro || f.address.neighborhood,
                    city: data.localidade || f.address.city,
                    state: data.uf || f.address.state,
                },
            } : f);
        } catch (err) {
            console.error('Erro ao buscar CEP:', err);
        }
    };

    const salvarDados = async () => {
        if (!editForm) return;
        setSalvandoDados(true);
        setErroDados(null);
        try {
            const res = await fetch('/api/admin/crm/edit', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: client.id, ...editForm }),
            });
            const data = await res.json();
            if (data.ok) {
                setClient({
                    ...client,
                    displayName: editForm.displayName,
                    phoneNumber: editForm.phoneNumber,
                    cpf: editForm.cpf,
                    instagram: editForm.instagram.trim() ? (normalizarInstagram(editForm.instagram) || editForm.instagram) : '',
                    address: editForm.address,
                });
                setEditForm(null);
                mudou();
            } else {
                setErroDados(data.error || 'Erro ao salvar.');
            }
        } catch {
            setErroDados('Erro de conexão.');
        } finally {
            setSalvandoDados(false);
        }
    };

    const vincularVendedor = async (vendedorId: string) => {
        setVinculandoVendedor(true);
        try {
            const res = await fetch('/api/admin/crm/assign-vendedor', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ clientId: client.id, vendedorId }),
            });
            if (res.ok) {
                setClient({ ...client, vendedorId });
                onMudou?.();
            } else {
                notify('Não foi possível trocar o responsável.');
            }
        } catch {
            notify('Falha de conexão ao trocar o responsável.');
        } finally {
            setVinculandoVendedor(false);
        }
    };

    const texto = (campo: keyof Omit<FormDeDados, 'address'>, valor: string, placeholder?: string) => editForm
        ? <input className={crmStyles.planSelect} value={editForm[campo]} onChange={e => setEditForm(f => (f ? { ...f, [campo]: e.target.value } : f))} placeholder={placeholder} />
        : <span className={crmStyles.clientFormValue}>{valor || '-'}</span>;

    const endereco = (campo: keyof FormDeDados['address'], placeholder: string, maxLength?: number) => editForm
        ? <input className={crmStyles.planSelect} value={editForm.address[campo]} onChange={e => (campo === 'zipCode' ? mudarCep(e.target.value) : mudarEndereco(campo, e.target.value))} placeholder={placeholder} maxLength={maxLength} />
        : <span className={crmStyles.clientFormValue}>{client.address?.[campo] || '-'}</span>;

    /* ───────── Acessos ───────── */

    const alternarLogin = async () => {
        if (!client.firebaseUid || !acesso) return;
        const novo = !acesso.disabled;
        const ok = await confirm(novo
            ? { title: 'Desativar acesso', description: <><strong>{nome}</strong> perde o acesso na hora. A assinatura e os dados continuam salvos.</>, confirmLabel: 'Desativar acesso', danger: true }
            : { title: 'Ativar acesso', description: <><strong>{nome}</strong> volta a entrar na plataforma.</>, confirmLabel: 'Ativar acesso' });
        if (!ok) return;
        setAcessoLoading(true);
        const r = await toggleUserStatus(client.firebaseUid, novo);
        if (r.success) {
            setAcesso({ ...acesso, disabled: novo });
            setAcessoMsg({ ok: true, texto: novo ? 'Acesso desativado.' : 'Acesso reativado.' });
        } else {
            setAcessoMsg({ ok: false, texto: 'Não foi possível alterar o status.' });
        }
        setAcessoLoading(false);
    };

    const salvarPerfis = async () => {
        if (!client.firebaseUid || !acesso) return;
        setAcessoLoading(true);
        const r = await updateUserProfiles(client.firebaseUid, acesso.profiles);
        if (r.success) {
            setAcessoMsg({ ok: true, texto: 'Perfis atualizados. Se o cliente perdeu os perfis de cliente, ele passa a aparecer só na tela Equipe.' });
            mudou();
        } else {
            setAcessoMsg({ ok: false, texto: 'Não foi possível salvar os perfis.' });
        }
        setAcessoLoading(false);
    };

    const gerarSenha = async () => {
        const ok = await confirm({
            title: 'Gerar nova senha provisória',
            description: <>A senha atual de <strong>{nome}</strong> deixa de valer. Ele entra com a nova e escolhe a própria senha no primeiro acesso.</>,
            confirmLabel: 'Gerar senha',
        });
        if (!ok) return;
        setAcessoLoading(true);
        setSenhaProvisoria(null);
        try {
            const res = await fetch('/api/admin/crm/acesso', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: client.id }),
            });
            const data = await res.json();
            if (res.ok && data.senhaProvisoria) {
                setSenhaProvisoria(data.senhaProvisoria);
                setAcessoMsg(null);
            } else {
                setAcessoMsg({ ok: false, texto: data.error || 'Não foi possível gerar a senha.' });
            }
        } catch {
            setAcessoMsg({ ok: false, texto: 'Erro de conexão.' });
        } finally {
            setAcessoLoading(false);
        }
    };

    const excluir = async () => {
        if (!client.firebaseUid) return;
        const ok = await confirm({
            title: 'Excluir cliente',
            description: <>Apaga o login, o perfil e o histórico de assinatura de <strong>{nome}</strong>. Não dá para desfazer.</>,
            confirmLabel: 'Excluir cliente',
            danger: true,
        });
        if (!ok) return;
        setAcessoLoading(true);
        const r = await deleteUser(client.firebaseUid);
        if (r.success) {
            onMudou?.();
            onClose();
        } else {
            setAcessoMsg({ ok: false, texto: r.error || 'Não foi possível excluir.' });
            setAcessoLoading(false);
        }
    };

    /* ───────── Planos ───────── */

    const cobrarCartao = async () => {
        const ok = await confirm({
            title: 'Cobrar no cartão',
            description: <>Cobra agora o cartão salvo de <strong>{nome}</strong> e renova o plano atual.</>,
            confirmLabel: 'Cobrar e renovar',
        });
        if (!ok) return;
        setCobrando(true);
        try {
            const res = await fetch('/api/admin/crm/charge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: client.id }),
            });
            const data = await res.json();
            if (data.ok) {
                notify('Cobrança aprovada. Plano renovado.', 'positive');
                mudou();
            } else {
                notify(data.error || 'Cobrança recusada pelo cartão.');
            }
        } catch {
            notify('Falha de conexão ao cobrar o cartão.');
        } finally {
            setCobrando(false);
        }
    };

    const renovarTeste = async () => {
        setRenovandoTeste(true);
        setAvisoTeste(null);
        try {
            const res = await fetch('/api/admin/crm/renew-trial', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: client.id }),
            });
            const data = await res.json();
            if (data.ok) {
                setAvisoTeste({ ok: true, msg: 'Teste renovado por mais 24h.' });
                setClient({ ...client, freeTrialExpiresAt: data.freeTrialExpiresAt, freeTrialExpired: false });
                onMudou?.();
            } else {
                setAvisoTeste({ ok: false, msg: data.error || 'Erro ao renovar o teste.' });
            }
        } catch {
            setAvisoTeste({ ok: false, msg: 'Erro de conexão.' });
        } finally {
            setRenovandoTeste(false);
        }
    };

    const situacao: { rotulo: string; tom: BadgeTone } = client.activationMethod === 'cortesia' && client.status === 'active'
        ? { rotulo: 'Cortesia', tom: 'accent' }
        : client.profileType === 'gratis' && client.status !== 'active'
            ? { rotulo: 'Teste grátis', tom: 'warning' }
            : { rotulo: STATUS_LABELS[client.status], tom: STATUS_TONE[client.status] };

    return (
        <>
            <AdminModal
                size="xl"
                onClose={onClose}
                bodyClassName={crmStyles.clientModalBody}
                leading={<div className={crmStyles.clientModalAvatar}>{nome[0].toUpperCase()}</div>}
                title={client.displayName || '(sem nome)'}
                titleAside={<>
                    <StatusBadge tone={situacao.tom}>{situacao.rotulo}</StatusBadge>
                    {pendencias.map(p => (
                        <button key={p.codigo} type="button" className={styles.selo} title={`${p.detalhe} Clique para resolver.`} aria-label={`Pendência: ${p.rotulo}`} onClick={() => setAba(p.aba)}>
                            <StatusBadge tone={p.tom} dot={false}>{p.rotulo}</StatusBadge>
                        </button>
                    ))}
                </>}
                subtitle={<>
                    <span>{client.email}{client.phoneNumber ? ` · ${client.phoneNumber}` : ''}</span>
                    {/* O essencial no cabeçalho: plano e vencimento sem trocar de aba. */}
                    <div className={crmStyles.headerFacts}>
                        <span className={crmStyles.fact}><em>Plano</em>{client.planName || 'Sem plano'}</span>
                        <span className={crmStyles.fact}>
                            <em>{client.status === 'expired' ? 'Expirou' : 'Expira'}</em>
                            {client.expiresAt ? formatDate(client.expiresAt) : '-'}
                        </span>
                        <span className={crmStyles.fact}><em>Pagamento</em>{getPaymentInfo(client)?.label || 'Sem pagamento'}</span>
                        {typeof client.valorPlano === 'number' && (
                            <span className={crmStyles.fact}>
                                <em>{client.valorCombinadoAtivo ? 'Valor combinado' : 'Valor'}</em>
                                {brl(client.valorPlano)}{client.billingType === 'annual' ? '/ano' : '/mês'}
                            </span>
                        )}
                    </div>
                </>}
                toolbar={
                    <div className={crmStyles.clientModalTabs} role="tablist" aria-label="Seções da ficha">
                        {ABAS.map(([id, rotulo]) => (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={aba === id}
                                className={`${crmStyles.clientModalTab} ${aba === id ? crmStyles.clientModalTabActive : ''}`}
                                onClick={() => setAba(id)}
                            >
                                {rotulo}
                            </button>
                        ))}
                    </div>
                }
            >
                {aba === 'dados' && (
                    <div>
                        <Secao titulo="Informações pessoais" aside={!editForm && <button type="button" className={crmStyles.editToggleBtn} onClick={editar}>Editar</button>}>
                            <div className={crmStyles.clientFormGrid}>
                                <Campo rotulo="Nome">{texto('displayName', client.displayName)}</Campo>
                                <Campo rotulo="CPF / CNPJ">{texto('cpf', client.cpf, '000.000.000-00')}</Campo>
                                <Campo rotulo="Telefone">{texto('phoneNumber', client.phoneNumber, '(11) 99999-9999')}</Campo>
                                <Campo rotulo="E-mail"><span className={`${crmStyles.clientFormValue} ${styles.apagado}`}>{client.email}</span></Campo>
                                <Campo rotulo="Instagram">
                                    {editForm
                                        ? texto('instagram', client.instagram || '', '@loja')
                                        : linkInstagram(client.instagram)
                                            ? <a className={crmStyles.clientFormValue} href={linkInstagram(client.instagram)!} target="_blank" rel="noopener noreferrer">{client.instagram}</a>
                                            : <span className={crmStyles.clientFormValue}>-</span>}
                                </Campo>
                                <Campo rotulo="Responsável">
                                    <select
                                        className={crmStyles.planSelect}
                                        value={client.vendedorId || ''}
                                        onChange={e => vincularVendedor(e.target.value)}
                                        disabled={vinculandoVendedor}
                                        aria-label="Responsável pelo cliente"
                                    >
                                        <option value="">Sem vendedor</option>
                                        {vendedores.map(v => <option key={v.id} value={v.id}>{v.displayName}</option>)}
                                    </select>
                                </Campo>
                                <Campo rotulo="Cadastrado em"><span className={crmStyles.clientFormValue}>{formatDate(client.createdAt)}</span></Campo>
                            </div>
                        </Secao>

                        {/* Logo do orçamento: só a equipe coloca, depois da assinatura. */}
                        <Secao titulo="Logo no orçamento">
                            <ClienteLogoField userId={client.id} nomeCliente={client.displayName} />
                        </Secao>

                        <Secao titulo="Endereço">
                            <div className={crmStyles.clientFormGrid}>
                                <Campo rotulo="CEP">{endereco('zipCode', '00000-000')}</Campo>
                                <Campo rotulo="Estado">{endereco('state', 'SP', 2)}</Campo>
                                <Campo rotulo="Rua" largo>{endereco('street', 'Av. Paulista')}</Campo>
                                <Campo rotulo="Número">{endereco('number', '123')}</Campo>
                                <Campo rotulo="Complemento">{endereco('complement', 'Apto 42')}</Campo>
                                <Campo rotulo="Bairro">{endereco('neighborhood', 'Bela Vista')}</Campo>
                                <Campo rotulo="Cidade">{endereco('city', 'São Paulo')}</Campo>
                            </div>
                        </Secao>

                        <Secao titulo="Perfil preenchido" aside={<span className={styles.percentual} style={{ color: corDaConclusao }}>{client.profileCompletion}%</span>}>
                            <div className={crmStyles.completionBarWrap}>
                                <div className={crmStyles.completionBarFill} style={{ width: `${client.profileCompletion}%`, background: corDaConclusao }} />
                            </div>
                        </Secao>

                        {editForm && (
                            <div className={modalStyles.stack}>
                                {erroDados && <InlineNotice>{erroDados}</InlineNotice>}
                                <div className={styles.acoes}>
                                    <button type="button" className={modalStyles.secondary} onClick={() => setEditForm(null)} disabled={salvandoDados}>Cancelar</button>
                                    <button type="button" className={modalStyles.primary} onClick={salvarDados} disabled={salvandoDados}>{salvandoDados ? 'Salvando...' : 'Salvar'}</button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {aba === 'acessos' && (
                    <div>
                        <Secao titulo="Login do titular">
                            {acessoMsg && <div className={crmStyles.noticeGap}><InlineNotice tone={acessoMsg.ok ? 'positive' : 'negative'}>{acessoMsg.texto}</InlineNotice></div>}

                            {!client.firebaseUid ? (
                                <InlineNotice tone="warning">Este cadastro não tem login vinculado: o acesso não é gerenciável por aqui.</InlineNotice>
                            ) : acessoLoading && !acesso ? (
                                <p className={`${modalStyles.hint} ${modalStyles.flush}`}>Consultando acesso...</p>
                            ) : acesso ? (
                                <>
                                    <div className={styles.linha}>
                                        <StatusBadge tone={acesso.disabled ? 'negative' : 'positive'}>{acesso.disabled ? 'Login desativado' : 'Login ativo'}</StatusBadge>
                                        <span className={styles.apagado}>{client.email}</span>
                                        <button type="button" className={crmStyles.textBtn} disabled={acessoLoading} onClick={alternarLogin}>
                                            {acesso.disabled ? 'Reativar acesso' : 'Desativar acesso'}
                                        </button>
                                        <button type="button" className={crmStyles.textBtn} disabled={acessoLoading} onClick={gerarSenha}>
                                            Gerar nova senha provisória
                                        </button>
                                    </div>
                                    {senhaProvisoria && (
                                        <div className={crmStyles.passwordBox} role="status">
                                            <strong>Senha provisória criada.</strong>
                                            <span>Envie para o cliente. Ele troca por uma senha própria no primeiro acesso.</span>
                                            <code className={crmStyles.passwordValue}>{senhaProvisoria}</code>
                                        </div>
                                    )}
                                </>
                            ) : !acessoMsg ? (
                                <button type="button" className={crmStyles.textBtn} onClick={() => carregarAcesso(client.firebaseUid!)}>Carregar acesso</button>
                            ) : null}
                        </Secao>

                        {!client.isInvitee && (
                            <Secao titulo="Convidados (telas extras)">
                                <p className={`${modalStyles.hint} ${styles.explicacao}`}>
                                    Cada convidado tem login próprio e usa o plano desta conta. O valor por tela extra entra na cobrança do titular.
                                </p>
                                <ConvidadosDoCliente clienteEmail={client.email} onMudou={mudou} />
                            </Secao>
                        )}

                        {acesso && (
                            <Secao titulo="Perfis">
                                <p className={`${modalStyles.hint} ${styles.explicacao}`}>
                                    Conceder perfil de equipe faz a pessoa aparecer também na tela Equipe. O vínculo com uma concessionária é feito na ficha da loja, em Concessionárias.
                                </p>
                                {/* cliente/gratis não são clicáveis em lugar nenhum: quem concede e retira é a
                                    assinatura (atribuir plano, teste, pagamento). Aqui só informam o estado atual. */}
                                <div className={styles.linha}>
                                    {CLIENT_PROFILES.filter(p => acesso.profiles.includes(p)).map(perfil => (
                                        <StatusBadge key={perfil} tone="info" dot={false}>{perfil === 'gratis' ? 'Teste grátis' : 'Cliente'} · via assinatura</StatusBadge>
                                    ))}
                                </div>
                                <div className={`${modalStyles.choices} ${styles.perfis}`}>
                                    {[...DIRETIVO_PROFILES, ...OPERACIONAL_PROFILES, 'concessionaria' as UserProfile].map(perfil => (
                                        <label key={perfil} className={modalStyles.choice}>
                                            <input
                                                type="checkbox"
                                                checked={acesso.profiles.includes(perfil)}
                                                onChange={() => setAcesso({ ...acesso, profiles: toggleProfileSelection(acesso.profiles, perfil) })}
                                            />
                                            {NOME_PERFIL[perfil] ?? perfil}
                                        </label>
                                    ))}
                                </div>
                                <button type="button" className={crmStyles.textBtn} disabled={acessoLoading} onClick={salvarPerfis}>Salvar perfis</button>
                            </Secao>
                        )}

                        {client.firebaseUid && (
                            <Secao titulo="Zona de risco" perigo>
                                <button type="button" className={`${crmStyles.textBtn} ${crmStyles.textBtnDanger}`} disabled={acessoLoading} onClick={excluir}>
                                    Excluir usuário definitivamente
                                </button>
                            </Secao>
                        )}
                    </div>
                )}

                {aba === 'planos' && (
                    <div>
                        <Secao titulo="Plano de zero km" aside={<StatusBadge tone={STATUS_TONE[client.status]}>{STATUS_LABELS[client.status]}</StatusBadge>}>
                            {client.isInvitee && (
                                <div className={crmStyles.noticeGap}><InlineNotice tone="warning">Esta conta é uma tela extra: o plano e a cobrança são os da conta principal.</InlineNotice></div>
                            )}
                            <div className={crmStyles.clientFormGrid}>
                                <Campo rotulo="Plano" largo>
                                    <span className={`${crmStyles.clientFormValue} ${styles.linha}`}>
                                        {client.planName
                                            ? `${client.planName} (${client.planType === 'monthly' ? (client.billingType === 'annual' ? 'anual' : 'mensal') : 'créditos'})`
                                            : 'Nenhum plano'}
                                        {client.billingType === 'annual' && client.planType === 'monthly' && <StatusBadge tone="positive" dot={false}>Anual</StatusBadge>}
                                        {client.activationMethod === 'cortesia' && <StatusBadge tone="accent" dot={false}>Cortesia</StatusBadge>}
                                        {client.activationMethod === 'boleto' && <StatusBadge dot={false}>Boleto</StatusBadge>}
                                    </span>
                                </Campo>
                                <Campo rotulo={client.status === 'expired' ? 'Venceu em' : 'Vence em'}>
                                    <span className={crmStyles.clientFormValue} style={{ color: client.status === 'expired' ? 'var(--color-negative)' : (client.daysUntilExpiry !== null && client.daysUntilExpiry <= 7) ? 'var(--color-warning)' : 'inherit' }}>
                                        {client.expiresAt ? formatDate(client.expiresAt) : '-'}
                                        {client.daysUntilExpiry !== null && (
                                            <span className={crmStyles.daysHint}>
                                                {client.daysUntilExpiry >= 0 ? ` (${client.daysUntilExpiry}d)` : ` (há ${Math.abs(client.daysUntilExpiry)}d)`}
                                            </span>
                                        )}
                                    </span>
                                </Campo>
                                <Campo rotulo="Créditos avulsos">
                                    <span className={crmStyles.clientFormValue}>
                                        {client.credits > 0 ? <span className={crmStyles.credits}>{client.credits}</span> : '0'}
                                    </span>
                                </Campo>
                                <Campo rotulo="Pagamento"><span className={crmStyles.clientFormValue}>{getPaymentInfo(client)?.label || 'Sem pagamento'}</span></Campo>
                                {client.hasCard && (
                                    <Campo rotulo="Cartão">
                                        <span className={crmStyles.clientFormValue}>
                                            {client.cardBrand ? `${client.cardBrand} ` : ''}
                                            {client.cardLastFour ? `•••• ${client.cardLastFour}` : 'Cadastrado'}
                                        </span>
                                    </Campo>
                                )}
                            </div>

                            <div className={`${styles.acoes} ${styles.acoesDoPlano}`}>
                                {!client.isInvitee && (
                                    <button type="button" className={modalStyles.primary} onClick={() => setAtribuindo(true)}>
                                        {client.status === 'active' ? 'Trocar ou renovar plano' : client.status === 'expired' ? 'Renovar plano' : 'Ativar plano'}
                                    </button>
                                )}
                                {client.status === 'expired' && client.hasCard && (
                                    <button type="button" className={modalStyles.secondary} disabled={cobrando} onClick={cobrarCartao}>
                                        {cobrando ? 'Processando...' : 'Cobrar cartão'}
                                    </button>
                                )}
                                {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className={modalStyles.secondary}>WhatsApp</a>}
                                <a href={emailLink(client.email, client.displayName, client.status)} className={modalStyles.secondary}>Enviar e-mail</a>
                                {client.profileCompletion < 100 && (
                                    <a
                                        href={`mailto:${client.email}?subject=${encodeURIComponent('Complete seu cadastro na ZeroKM')}&body=${encodeURIComponent(`Olá ${client.displayName || ''},\n\nSeu cadastro na plataforma ZeroKM está ${client.profileCompletion}% completo. Para aproveitar todos os recursos, por favor finalize seu perfil em: ${typeof window !== 'undefined' ? window.location.origin : ''}/dashboard/profile\n\nAtenciosamente,\nEquipe ZeroKM`)}`}
                                        className={modalStyles.secondary}
                                    >
                                        Solicitar conclusão ({client.profileCompletion}%)
                                    </a>
                                )}
                            </div>
                            <p className={`${modalStyles.hint} ${styles.explicacao}`}>
                                Em Ativar plano você escolhe mensal, anual ou créditos, e a origem: recebimento por fora ou cortesia.
                            </p>
                        </Secao>

                        {client.profileType === 'gratis' && (
                            <Secao titulo="Teste grátis (24h)" aside={client.freeTrialExpired ? <StatusBadge tone="negative">Expirado</StatusBadge> : <StatusBadge tone="positive">{client.freeTrialExpiresAt ? 'Ativo' : 'Não iniciado'}</StatusBadge>}>
                                <div className={styles.linha}>
                                    <span className={crmStyles.clientFormValue} style={{ color: client.freeTrialExpired ? 'var(--color-negative)' : 'inherit' }}>
                                        {client.freeTrialExpiresAt ? `Vai até ${new Date(client.freeTrialExpiresAt).toLocaleString('pt-BR')}` : 'Nunca iniciado'}
                                    </span>
                                    <button type="button" className={crmStyles.textBtn} disabled={renovandoTeste} onClick={renovarTeste}>
                                        {renovandoTeste ? 'Renovando...' : client.freeTrialExpiresAt ? 'Renovar 24h' : 'Liberar 24h de teste'}
                                    </button>
                                </div>
                                {avisoTeste && <InlineNotice tone={avisoTeste.ok ? 'positive' : 'negative'}>{avisoTeste.msg}</InlineNotice>}
                            </Secao>
                        )}

                        {!client.isInvitee && (
                            <Secao titulo="Valor combinado">
                                <ValorCombinadoCliente userId={client.id} onChange={mudou} />
                            </Secao>
                        )}

                        <Secao titulo="Atendimento por WhatsApp">
                            <AtendimentoDoCliente userId={client.id} />
                        </Secao>

                        {client.status === 'no_plan' && (
                            <div className={crmStyles.conversionTip}>
                                <strong>Dica de conversão:</strong> Este cliente se cadastrou mas ainda não assinou nenhum plano. Entre em contato e ofereça um período de teste ou desconto.
                            </div>
                        )}
                        {client.status === 'expired' && (
                            <div className={crmStyles.renewalTip}>
                                <strong>Oportunidade de renovação:</strong> Plano expirado há {client.daysUntilExpiry !== null ? Math.abs(client.daysUntilExpiry) : '?'} dia(s). Excelente momento para reativar.
                            </div>
                        )}
                    </div>
                )}

                {aba === 'cobrancas' && (
                    <Secao titulo="Cobranças e envios">
                        <ClienteFinanceiro userId={client.id} />
                    </Secao>
                )}

                {aba === 'atividade' && <AtividadeDoCliente client={client} />}
            </AdminModal>

            {atribuindo && (
                <AtribuirPlanoModal
                    client={client}
                    plans={plans}
                    onClose={() => setAtribuindo(false)}
                    onAtribuido={() => { setAtribuindo(false); notify('Plano atualizado.', 'positive'); mudou(); }}
                />
            )}
            {feedback}
        </>
    );
}

type Evento = { quando: string; titulo: string; detalhe?: string; tom?: BadgeTone };

const SITUACAO_DA_COBRANCA: Record<string, { rotulo: string; tom: BadgeTone }> = {
    approved: { rotulo: 'Pagamento confirmado', tom: 'positive' },
    pending: { rotulo: 'Cobrança aguardando pagamento', tom: 'warning' },
    in_process: { rotulo: 'Pagamento em análise', tom: 'warning' },
    rejected: { rotulo: 'Pagamento recusado', tom: 'negative' },
    cancelled: { rotulo: 'Cobrança cancelada', tom: 'neutral' },
    refunded: { rotulo: 'Pagamento estornado', tom: 'neutral' },
    charged_back: { rotulo: 'Chargeback', tom: 'negative' },
};

/**
 * Linha do tempo da conta. O CRM não guardava um histórico próprio: ela é
 * montada com o que já existe (cadastro, teste, assinatura e cobranças).
 */
function AtividadeDoCliente({ client }: { client: CRMClient }) {
    const [cobrancas, setCobrancas] = useState<any[] | null>(null);

    useEffect(() => {
        fetch(`/api/admin/cobrancas?tudo=true&limit=20&userId=${encodeURIComponent(client.id)}`)
            .then(r => r.json())
            .then(body => setCobrancas(Array.isArray(body?.data) ? body.data : []))
            .catch(() => setCobrancas([]));
    }, [client.id]);

    const eventos = useMemo(() => {
        const lista: Evento[] = [];
        if (client.createdAt) lista.push({ quando: client.createdAt, titulo: 'Cadastro criado', detalhe: client.email });
        if (client.freeTrialExpiresAt) {
            lista.push({
                quando: client.freeTrialExpiresAt,
                titulo: client.freeTrialExpired ? 'Teste grátis encerrado' : 'Teste grátis termina',
                tom: client.freeTrialExpired ? 'negative' : 'warning',
            });
        }
        if (client.expiresAt) {
            lista.push({
                quando: client.expiresAt,
                titulo: client.status === 'expired' ? 'Plano venceu' : 'Plano vence',
                detalhe: client.planName || undefined,
                tom: client.status === 'expired' ? 'negative' : 'info',
            });
        }
        for (const c of cobrancas || []) {
            const s = SITUACAO_DA_COBRANCA[c.status] || { rotulo: 'Cobrança registrada', tom: 'neutral' as BadgeTone };
            lista.push({ quando: c.criadoEm, titulo: s.rotulo, detalhe: `${c.plano || 'Plano'} · ${brl(Number(c.valor || 0))}`, tom: s.tom });
            if (c.email?.enviadoEm) lista.push({ quando: c.email.enviadoEm, titulo: 'Boleto enviado por e-mail', detalhe: c.email.para || undefined });
        }
        return lista
            .filter(e => e.quando && !Number.isNaN(new Date(e.quando).getTime()))
            .sort((a, b) => new Date(b.quando).getTime() - new Date(a.quando).getTime());
    }, [client, cobrancas]);

    return (
        <Secao titulo="Atividade da conta">
            <p className={`${modalStyles.hint} ${styles.explicacao}`}>Cadastro, teste, assinatura e as 20 cobranças mais recentes, do mais novo para o mais antigo.</p>
            {cobrancas === null && <p className={`${modalStyles.hint} ${modalStyles.flush}`}>Carregando as cobranças...</p>}
            <ol className={styles.linhaDoTempo}>
                {eventos.map((e, i) => (
                    <li key={`${e.quando}-${i}`} className={styles.evento}>
                        <span className={styles.quando}>{new Date(e.quando).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                        <span className={styles.oQue}>
                            <StatusBadge tone={e.tom ?? 'neutral'}>{e.titulo}</StatusBadge>
                            {e.detalhe && <span className={styles.apagado}>{e.detalhe}</span>}
                        </span>
                    </li>
                ))}
            </ol>
        </Secao>
    );
}
