'use client';

import { useState, useEffect } from 'react';
import { AdminUser, listAllUsers, updateUserProfiles, toggleUserStatus, deleteUser } from './actions';
import { UserProfile } from '@/lib/types/auth';
import { toggleProfileSelection } from '@/lib/utils/userProfiles';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { ContactRound, Info, Pencil, Search, Trash2, UserCheck, UserX, Users } from 'lucide-react';
import {
    Avatar, Button, Callout, EmptyState, IconAction, Page, PageHeader, Panel, PanelFooter, PanelToolbar, PrimaryCell, RowActions,
    SearchField, Segmented, ShowingCount, SkeletonRows, SortHeader, StatCard, StatGrid, StatusBadge, TwoLine, nextSort, pageStyles,
    type BadgeTone, type SortDirection,
} from '@/components/ui/Page';
import { useFeedback } from '@/components/ui/Feedback';
import { NovoCadastroButton } from '@/components/admin/NovoCadastro';
import { PerfisDaEquipe } from '@/components/admin/PerfisDaEquipe';

interface CrmEntry {
    status: 'active' | 'expired' | 'no_plan';
    expiresAt: string | null;
    planName: string | null;
    daysUntilExpiry: number | null;
}

const NOME_PERFIL: Partial<Record<UserProfile, string>> = {
    administrador: 'Administrador', admin: 'Administrador', gerente: 'Gerente', marketing: 'Marketing',
    operador: 'Operador', operator: 'Operador', vendedor: 'Vendedor', administrativo: 'Administrativo',
    concessionaria: 'Concessionária', dealership: 'Concessionária', cliente: 'Cliente', gratis: 'Teste grátis',
};

const TOM_PERFIL: Partial<Record<UserProfile, BadgeTone>> = {
    administrador: 'accent', admin: 'accent', gerente: 'accent',
    concessionaria: 'info', dealership: 'info', cliente: 'positive', gratis: 'warning',
};

const ehCliente = (u: AdminUser) => !!u.allowedProfiles?.some(p => p === 'cliente' || p === 'gratis');
/**
 * Usuário só de concessionária (o login da loja). Não aparece na Equipe: é
 * criado e gerido na ficha de cada loja, em Concessionárias. Cliente puro já
 * fica de fora em listAllUsers (é do CRM).
 */
const ehLoja = (u: AdminUser) => !ehCliente(u) && (u.allowedProfiles?.length ?? 0) > 0
    && u.allowedProfiles.every(p => p === 'concessionaria' || p === 'dealership');

type Coluna = 'usuario' | 'perfis' | 'status' | 'acesso' | 'criado';
type Segmento = 'todos' | 'ativos' | 'inativos';

function dataCurta(valor?: string | null) {
    if (!valor) return '';
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
}

function tempoRelativo(valor?: string | null) {
    if (!valor) return '';
    const d = new Date(valor).getTime();
    if (Number.isNaN(d)) return '';
    const dias = Math.floor((Date.now() - d) / 86_400_000);
    if (dias <= 0) return 'hoje';
    if (dias === 1) return 'ontem';
    if (dias < 30) return `há ${dias} dias`;
    const meses = Math.floor(dias / 30);
    if (meses < 12) return meses === 1 ? 'há 1 mês' : `há ${meses} meses`;
    const anos = Math.floor(meses / 12);
    return anos === 1 ? 'há 1 ano' : `há ${anos} anos`;
}

interface UsersTableProps {
    onViewInCRM?: (email: string) => void;
    restrictedProfiles?: UserProfile[];
    /** Atalhos do aviso "onde ficam os outros logins". Sem o destino, o aviso fica só com o texto. */
    destinos?: { concessionarias?: () => void; crm?: () => void };
}

export function UsersTable({ onViewInCRM, restrictedProfiles = [], destinos }: UsersTableProps) {
    // Só a equipe interna: o login de concessionária fica na ficha da loja e o cliente, no CRM.
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [crmDataMap, setCrmDataMap] = useState<Map<string, CrmEntry>>(new Map());
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [selectedProfiles, setSelectedProfiles] = useState<UserProfile[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [sort, setSort] = useState<{ column: Coluna | null; direction: SortDirection }>({ column: null, direction: 'asc' });
    const [segmento, setSegmento] = useState<Segmento>('todos');
    const [saving, setSaving] = useState(false);
    const { confirm, notify, feedback } = useFeedback();

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const data = await listAllUsers();
            setUsers(data.filter(u => !ehLoja(u)));
        } catch (error) {
            console.error('Failed to fetch users', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetch('/api/admin/crm')
            .then(r => r.json())
            .then(data => {
                if (data.clients) {
                    const map = new Map<string, CrmEntry>();
                    data.clients.forEach((c: any) => {
                        map.set(c.email, {
                            status: c.status,
                            expiresAt: c.expiresAt,
                            planName: c.planName,
                            daysUntilExpiry: c.daysUntilExpiry,
                        });
                    });
                    setCrmDataMap(map);
                }
            })
            .catch(() => {});
    }, []);

    const [selectedDealershipId, setSelectedDealershipId] = useState<string>('');

    const handleEdit = (user: AdminUser) => {
        setEditingUser(user);
        setSelectedProfiles(user.allowedProfiles || []);
        setSelectedDealershipId(user.dealershipId || '');
    };

    const handleToggleStatus = async (user: AdminUser) => {
        const nome = user.displayName || user.email;
        const ok = await confirm(user.disabled
            ? { title: 'Ativar acesso', description: <><strong>{nome}</strong> volta a entrar na plataforma com os perfis que já tinha.</>, confirmLabel: 'Ativar acesso' }
            : { title: 'Desativar acesso', description: <><strong>{nome}</strong> perde o acesso na hora. Os dados continuam salvos e dá para ativar de novo.</>, confirmLabel: 'Desativar acesso', danger: true });
        if (!ok) return;

        const result = await toggleUserStatus(user.uid, !user.disabled);
        if (result.success) {
            notify(user.disabled ? 'Acesso ativado.' : 'Acesso desativado.', 'positive');
            fetchUsers();
        } else {
            notify('Não foi possível alterar o acesso. Tente de novo.');
        }
    };

    const handleDeleteUser = async (user: AdminUser) => {
        const ok = await confirm({
            title: 'Excluir usuário',
            description: <>O acesso de <strong>{user.displayName || user.email}</strong> é apagado de vez e não dá para desfazer. Se for só suspender, use Desativar.</>,
            confirmLabel: 'Excluir usuário',
            danger: true,
        });
        if (!ok) return;

        const result = await deleteUser(user.uid);
        if (result.success) {
            notify('Usuário excluído.', 'positive');
            fetchUsers();
        } else {
            notify(`Não foi possível excluir o usuário: ${result.error}`);
        }
    };

    const handleSaveProfiles = async () => {
        if (!editingUser) return;
        setSaving(true);
        const result = await updateUserProfiles(
            editingUser.uid,
            selectedProfiles,
            undefined,
            selectedProfiles.includes('concessionaria') ? (selectedDealershipId || undefined) : undefined
        );
        setSaving(false);

        if (result.success) {
            setEditingUser(null);
            notify('Acessos atualizados.', 'positive');
            fetchUsers();
        } else {
            notify('Não foi possível salvar os acessos. Tente de novo.');
        }
    };

    const toggleProfile = (profile: UserProfile) => {
        setSelectedProfiles(toggleProfileSelection(selectedProfiles, profile));
    };

    const handleSort = (column: Coluna) => setSort(atual => nextSort(atual, column));

    const term = searchTerm.trim().toLowerCase();
    const noSegmento = (u: AdminUser) =>
        segmento === 'todos' ? true
            : segmento === 'inativos' ? u.disabled
                : !u.disabled;
    const filteredAndSorted = [...users]
        .filter(noSegmento)
        .filter(u => {
            if (!term) return true;
            const name = (u.displayName || '').toLowerCase();
            const email = (u.email || '').toLowerCase();
            const perfis = (u.allowedProfiles || []).map(p => `${p} ${NOME_PERFIL[p] ?? ''}`).join(' ').toLowerCase();
            const status = (u.disabled ? 'inativo' : 'ativo');
            return name.includes(term) || email.includes(term) || perfis.includes(term) || status.includes(term);
        })
        .sort((a, b) => {
            if (!sort.column) return 0;
            let valA = '';
            let valB = '';
            if (sort.column === 'usuario') {
                valA = (a.displayName || a.email || '').toLowerCase();
                valB = (b.displayName || b.email || '').toLowerCase();
            } else if (sort.column === 'perfis') {
                valA = (a.allowedProfiles || []).join(',').toLowerCase();
                valB = (b.allowedProfiles || []).join(',').toLowerCase();
            } else if (sort.column === 'status') {
                valA = a.disabled ? 'inativo' : 'ativo';
                valB = b.disabled ? 'inativo' : 'ativo';
            } else {
                const campo = sort.column === 'acesso' ? 'lastSignInTime' : 'creationTime';
                valA = String(new Date(a[campo] || 0).getTime()).padStart(15, '0');
                valB = String(new Date(b[campo] || 0).getTime()).padStart(15, '0');
            }
            const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
            return sort.direction === 'asc' ? cmp : -cmp;
        });

    const ativos = users.filter(u => !u.disabled).length;
    const administradores = users.filter(u => u.allowedProfiles?.some(p => p === 'administrador' || p === 'admin')).length;
    const inativos = users.length - ativos;
    const trintaDias = Date.now() - 30 * 86_400_000;
    const acessaram = users.filter(u => u.lastSignInTime && new Date(u.lastSignInTime).getTime() >= trintaDias).length;
    const pct = (n: number) => (users.length ? (n / users.length) * 100 : 0);

    const assinatura = (user: AdminUser) => {
        if (!ehCliente(user)) return null;
        const sub = crmDataMap.get(user.email || '');
        if (!sub) return null;
        const partes: string[] = [sub.status === 'active' ? 'Assinatura ativa' : sub.status === 'expired' ? 'Assinatura expirada' : 'Sem plano'];
        if (sub.planName) partes.push(sub.planName);
        if (sub.status === 'active' && sub.expiresAt) {
            partes.push(`até ${new Date(sub.expiresAt).toLocaleDateString('pt-BR')}`);
            if (sub.daysUntilExpiry !== null && sub.daysUntilExpiry <= 7) partes.push(sub.daysUntilExpiry <= 0 ? 'vence hoje' : `vence em ${sub.daysUntilExpiry} ${sub.daysUntilExpiry === 1 ? 'dia' : 'dias'}`);
        } else if (sub.status === 'expired' && sub.daysUntilExpiry !== null) {
            partes.push(`há ${Math.abs(sub.daysUntilExpiry)} dias`);
        }
        return partes.join(' · ');
    };

    const convites = (user: AdminUser) => {
        const linhas: string[] = [];
        if (user.invitedBy) linhas.push(`Convidado por ${user.invitedBy.name} (${user.invitedBy.email})`);
        if (user.invitedUsers?.length) linhas.push(`Convidou ${user.invitedUsers.length}: ${user.invitedUsers.map(iu => `${iu.name} (${iu.email})`).join(', ')}`);
        return linhas;
    };

    return (
        <Page>
            <PageHeader
                title="Equipe"
                count={loading ? null : users.length}
                description="A equipe interna: quem trabalha na plataforma e com quais perfis."
                actions={<NovoCadastroButton perfilInicial="equipe" onFechar={fetchUsers} />}
            />

            <Callout
                icon={<Info size={18} aria-hidden="true" />}
                title="Aqui fica só a equipe interna"
                action={(destinos?.concessionarias || destinos?.crm) ? <>
                    {destinos.concessionarias && <Button onClick={destinos.concessionarias}>Ir para Concessionárias</Button>}
                    {destinos.crm && <Button onClick={destinos.crm}>Ir para o CRM</Button>}
                </> : undefined}
            >
                Logins de concessionária ficam na ficha de cada loja, em Concessionárias. Clientes ficam no CRM.
            </Callout>

            <StatGrid>
                <StatCard label="Equipe interna" icon={<Users size={18} />} value={loading ? '-' : users.length} caption="Pessoas com acesso de equipe" />
                <StatCard label="Ativos" icon={<UserCheck size={18} />} value={loading ? '-' : ativos} progress={pct(ativos)} caption={`${Math.round(pct(ativos))}% da base`} />
                <StatCard label="Administradores" icon={<ContactRound size={18} />} value={loading ? '-' : administradores} caption="Com acesso total" />
                <StatCard label="Entraram em 30 dias" icon={<UserCheck size={18} />} value={loading ? '-' : acessaram} progress={pct(acessaram)} caption="Último acesso no último mês" />
            </StatGrid>

            <Panel>
                <PanelToolbar>
                    <Segmented<Segmento>
                        label="Filtrar usuários"
                        value={segmento}
                        onChange={setSegmento}
                        options={[
                            { value: 'todos', label: 'Todos', count: users.length },
                            { value: 'ativos', label: 'Ativos', count: ativos },
                            { value: 'inativos', label: 'Inativos', count: inativos },
                        ]}
                    />
                    <SearchField value={searchTerm} onChange={setSearchTerm} placeholder="Nome, e-mail ou perfil" />
                </PanelToolbar>

                <div className={pageStyles.tableWrap}>
                    <table className={pageStyles.table}>
                        <thead>
                            <tr>
                                <SortHeader label="Usuário" column="usuario" sort={sort} onSort={handleSort} />
                                <SortHeader label="Perfis de acesso" column="perfis" sort={sort} onSort={handleSort} />
                                <SortHeader label="Situação" column="status" sort={sort} onSort={handleSort} />
                                <SortHeader label="Último acesso" column="acesso" sort={sort} onSort={handleSort} />
                                <SortHeader label="Criado em" column="criado" sort={sort} onSort={handleSort} />
                                <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && <SkeletonRows rows={5} columns={6} />}
                            {!loading && filteredAndSorted.map(user => {
                                const extras = convites(user);
                                const sub = assinatura(user);
                                return (
                                    <tr key={user.uid} data-inactive={user.disabled}>
                                        <td className={pageStyles.colMain}>
                                            <PrimaryCell
                                                leading={<Avatar name={user.displayName || user.email || '?'} src={user.photoURL} />}
                                                title={user.displayName || 'Sem nome'}
                                                subtitle={<>
                                                    {user.email}
                                                    {extras.map(linha => <span key={linha} className={pageStyles.subLine}>{linha}</span>)}
                                                </>}
                                            />
                                        </td>
                                        <td>
                                            {user.allowedProfiles?.length
                                                ? <span className={pageStyles.badgeList}>{user.allowedProfiles.map(p => <StatusBadge key={p} tone={TOM_PERFIL[p] ?? 'neutral'} dot={false}>{NOME_PERFIL[p] ?? p}</StatusBadge>)}</span>
                                                : <span className={pageStyles.muted}>Nenhum perfil</span>}
                                        </td>
                                        <td>
                                            <TwoLine
                                                top={user.disabled ? <StatusBadge tone="negative">Inativo</StatusBadge> : <StatusBadge tone="positive">Ativo</StatusBadge>}
                                                bottom={sub ?? undefined}
                                            />
                                        </td>
                                        <td>{user.lastSignInTime ? <TwoLine nowrap top={dataCurta(user.lastSignInTime)} bottom={tempoRelativo(user.lastSignInTime)} /> : <span className={pageStyles.muted}>Nunca entrou</span>}</td>
                                        <td><TwoLine nowrap top={dataCurta(user.creationTime)} bottom={tempoRelativo(user.creationTime)} /></td>
                                        <td>
                                            <RowActions>
                                                {onViewInCRM && ehCliente(user) && (
                                                    <IconAction label="Ver no CRM" onClick={() => onViewInCRM(user.email || '')}>
                                                        <ContactRound size={17} aria-hidden="true" />
                                                    </IconAction>
                                                )}
                                                <IconAction label="Editar acessos" onClick={() => handleEdit(user)}>
                                                    <Pencil size={17} aria-hidden="true" />
                                                </IconAction>
                                                <IconAction label={user.disabled ? 'Ativar acesso' : 'Desativar acesso'} onClick={() => handleToggleStatus(user)}>
                                                    {user.disabled ? <UserCheck size={17} aria-hidden="true" /> : <UserX size={17} aria-hidden="true" />}
                                                </IconAction>
                                                <IconAction label="Excluir usuário" tone="danger" onClick={() => handleDeleteUser(user)}>
                                                    <Trash2 size={17} aria-hidden="true" />
                                                </IconAction>
                                            </RowActions>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {!loading && filteredAndSorted.length === 0 && (
                    users.length === 0
                        ? <EmptyState icon={<Users size={20} />} title="Nenhum usuário cadastrado" description="Crie o primeiro acesso da equipe." action={<NovoCadastroButton perfilInicial="equipe" onFechar={fetchUsers} />} />
                        : <EmptyState icon={<Search size={20} />} title="Nenhum usuário encontrado" description="Ajuste a busca ou o filtro." />
                )}

                {!loading && users.length > 0 && (
                    <PanelFooter aside={sort.column ? 'Ordenado pela coluna escolhida' : 'Na ordem de cadastro'}>
                        <ShowingCount shown={filteredAndSorted.length} total={users.length} singular="usuário" plural="usuários" />
                    </PanelFooter>
                )}
            </Panel>

            {editingUser && (
                <AdminModal
                    title="Editar acessos"
                    subtitle={editingUser.email}
                    onClose={() => setEditingUser(null)}
                    busy={saving}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={() => setEditingUser(null)} disabled={saving}>Cancelar</button>
                        <button type="button" className={modalStyles.primary} onClick={handleSaveProfiles} disabled={saving}>{saving ? 'Salvando...' : 'Salvar alterações'}</button>
                    </>}
                >
                    <div className={modalStyles.stack}>
                        <PerfisDaEquipe name="edit" selected={selectedProfiles} restricted={restrictedProfiles} onToggle={toggleProfile} />
                        {(selectedProfiles.includes('cliente') || selectedProfiles.includes('gratis')) && (
                            <p className={`${modalStyles.hint} ${modalStyles.flush}`}>
                                Este usuário também tem perfil de {selectedProfiles.includes('cliente') ? 'cliente' : 'teste grátis'}. Esse acesso é controlado pela assinatura, no CRM.
                            </p>
                        )}
                        {selectedProfiles.includes('concessionaria') && (
                            <p className={`${modalStyles.hint} ${modalStyles.flush}`}>
                                Este usuário também é login de concessionária. O vínculo com a loja é mantido e é gerido na ficha da loja, em Concessionárias.
                            </p>
                        )}
                    </div>
                </AdminModal>
            )}
            {feedback}
        </Page>
    );
}
