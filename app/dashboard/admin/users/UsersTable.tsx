'use client';

import { useState, useEffect } from 'react';
import { AdminUser, listAllUsers, updateUserProfiles, toggleUserStatus, createUser, deleteUser } from './actions';
import { UserProfile } from '@/lib/types/auth';
import { toggleProfileSelection } from '@/lib/utils/userProfiles';
import { ConcessionariaService, Concessionaria } from '@/lib/services/concessionariaService';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { ContactRound, Pencil, Plus, Search, Trash2, UserCheck, UserX, Users } from 'lucide-react';
import {
    Avatar, Button, EmptyState, IconAction, Page, PageHeader, Panel, PanelFooter, PanelToolbar, PrimaryCell, RowActions,
    SearchField, Segmented, ShowingCount, SkeletonRows, SortHeader, StatCard, StatGrid, StatusBadge, TwoLine, nextSort, pageStyles,
    type BadgeTone, type SortDirection,
} from '@/components/ui/Page';
import { useFeedback } from '@/components/ui/Feedback';

const PROFILE_GROUPS: Array<{ key: string; label: string; hint: string; type: 'radio' | 'checkbox'; profiles: Array<{ value: UserProfile; label: string }> }> = [
    { key: 'diretivo', label: 'Diretivo', hint: 'escolha um', type: 'radio', profiles: [{ value: 'administrador', label: 'Administrador' }, { value: 'gerente', label: 'Gerente' }, { value: 'marketing', label: 'Marketing' }] },
    { key: 'operacional', label: 'Operacional', hint: 'escolha um', type: 'radio', profiles: [{ value: 'operador', label: 'Operador' }, { value: 'vendedor', label: 'Vendedor' }, { value: 'administrativo', label: 'Administrativo' }] },
    { key: 'concessionaria', label: 'Concessionária', hint: 'acesso ao painel da loja', type: 'checkbox', profiles: [{ value: 'concessionaria', label: 'Concessionária' }] },
];

/** Grupos de perfis. Radio com clique para desmarcar: cada grupo é opcional. */
function ProfileChoices({ name, selected, restricted, onToggle }: { name: string; selected: UserProfile[]; restricted: UserProfile[]; onToggle: (profile: UserProfile) => void }) {
    return <>
        {PROFILE_GROUPS.map(group => (
            <fieldset key={group.key} className={modalStyles.group}>
                <legend className={modalStyles.groupLabel}>{group.label} <span className={modalStyles.groupHint}>· {group.hint}</span></legend>
                <div className={modalStyles.choices}>
                    {group.profiles.map(profile => {
                        const disabled = restricted.includes(profile.value);
                        return (
                            <label key={profile.value} className={modalStyles.choice}>
                                {group.type === 'radio'
                                    ? <input type="radio" name={`${name}-${group.key}`} checked={selected.includes(profile.value)} onClick={() => !disabled && onToggle(profile.value)} disabled={disabled} readOnly />
                                    : <input type="checkbox" checked={selected.includes(profile.value)} onChange={() => !disabled && onToggle(profile.value)} disabled={disabled} />}
                                {profile.label}
                            </label>
                        );
                    })}
                </div>
            </fieldset>
        ))}
    </>;
}

function DealershipSelect({ dealerships, value, onChange, required }: { dealerships: Concessionaria[]; value: string; onChange: (value: string) => void; required?: boolean }) {
    return (
        <label className={modalStyles.field}>
            Vincular concessionária
            <select value={value} onChange={event => onChange(event.target.value)} required={required}>
                <option value="">Selecione uma concessionária...</option>
                {dealerships.map(dealership => <option key={dealership.id} value={dealership.id}>{dealership.nome}</option>)}
            </select>
        </label>
    );
}

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

type Coluna = 'usuario' | 'perfis' | 'status' | 'acesso' | 'criado';
type Segmento = 'todos' | 'equipe' | 'clientes' | 'inativos';

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
}

export function UsersTable({ onViewInCRM, restrictedProfiles = [] }: UsersTableProps) {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [crmDataMap, setCrmDataMap] = useState<Map<string, CrmEntry>>(new Map());
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [selectedProfiles, setSelectedProfiles] = useState<UserProfile[]>([]);
    const [dealerships, setDealerships] = useState<Concessionaria[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [sort, setSort] = useState<{ column: Coluna | null; direction: SortDirection }>({ column: null, direction: 'asc' });
    const [segmento, setSegmento] = useState<Segmento>('todos');
    const [saving, setSaving] = useState(false);
    const { confirm, notify, feedback } = useFeedback();

    // Add User Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newUser, setNewUser] = useState({
        displayName: '',
        email: '',
        password: '',
        allowedProfiles: ['operador'] as UserProfile[],
        dealershipId: '',
    });
    const [isCreating, setIsCreating] = useState(false);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const data = await listAllUsers();
            setUsers(data);
        } catch (error) {
            console.error('Failed to fetch users', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchDealerships = async () => {
        try {
            const data = await ConcessionariaService.getAllConcessionarias();
            setDealerships(data);
        } catch (error) {
            console.error('Failed to fetch dealerships', error);
        }
    };

    useEffect(() => {
        fetchUsers();
        fetchDealerships();
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

    const handleCreateUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsCreating(true);

        try {
            const result = await createUser({
                email: newUser.email,
                password: newUser.password,
                displayName: newUser.displayName,
                allowedProfiles: newUser.allowedProfiles,
                dealershipId: newUser.allowedProfiles.includes('concessionaria') ? newUser.dealershipId : undefined,
            });

            if (result.success) {
                setIsAddModalOpen(false);
                setNewUser({
                    displayName: '',
                    email: '',
                    password: '',
                    allowedProfiles: ['operador'],
                    dealershipId: '',
                });
                fetchUsers();
                notify('Usuário criado. Ele já pode entrar com o e-mail e a senha inicial.', 'positive');
            } else {
                notify(`Não foi possível criar o usuário: ${result.error}`);
            }
        } catch (error) {
            console.error('Error creating user:', error);
            notify('Falha de conexão ao criar o usuário. Tente de novo.');
        } finally {
            setIsCreating(false);
        }
    };

    const toggleNewUserProfile = (profile: UserProfile) => {
        setNewUser({ ...newUser, allowedProfiles: toggleProfileSelection(newUser.allowedProfiles, profile) });
    };

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
            selectedProfiles.includes('concessionaria') ? selectedDealershipId : undefined
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
                : segmento === 'clientes' ? ehCliente(u)
                    : !ehCliente(u);
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
    const equipe = users.filter(u => !ehCliente(u)).length;
    const clientes = users.length - equipe;
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
                description="Quem acessa a plataforma e com quais perfis. Assinaturas de clientes ficam no CRM."
                actions={<Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setIsAddModalOpen(true)}>Novo usuário</Button>}
            />

            <StatGrid>
                <StatCard label="Total de acessos" icon={<Users size={18} />} value={loading ? '-' : users.length} caption="Equipe, concessionárias e clientes" />
                <StatCard label="Ativos" icon={<UserCheck size={18} />} value={loading ? '-' : ativos} progress={pct(ativos)} caption={`${Math.round(pct(ativos))}% da base`} />
                <StatCard label="Equipe interna" icon={<ContactRound size={18} />} value={loading ? '-' : equipe} caption="Sem perfil de cliente" />
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
                            { value: 'equipe', label: 'Equipe', count: equipe },
                            { value: 'clientes', label: 'Clientes', count: clientes },
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
                        ? <EmptyState icon={<Users size={20} />} title="Nenhum usuário cadastrado" description="Crie o primeiro acesso da equipe." action={<Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setIsAddModalOpen(true)}>Novo usuário</Button>} />
                        : <EmptyState icon={<Search size={20} />} title="Nenhum usuário encontrado" description="Ajuste a busca ou o filtro." />
                )}

                {!loading && users.length > 0 && (
                    <PanelFooter aside={sort.column ? 'Ordenado pela coluna escolhida' : 'Na ordem de cadastro'}>
                        <ShowingCount shown={filteredAndSorted.length} total={users.length} singular="usuário" plural="usuários" />
                    </PanelFooter>
                )}
            </Panel>

            {isAddModalOpen && (
                <AdminModal
                    title="Novo usuário"
                    subtitle="Cria o acesso e define o que a pessoa pode usar na plataforma."
                    onClose={() => setIsAddModalOpen(false)}
                    busy={isCreating}
                    onSubmit={handleCreateUser}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={() => setIsAddModalOpen(false)} disabled={isCreating}>Cancelar</button>
                        <button type="submit" className={modalStyles.primary} disabled={isCreating}>{isCreating ? 'Criando...' : 'Criar usuário'}</button>
                    </>}
                >
                    <div className={modalStyles.stack}>
                        <div className={modalStyles.grid2}>
                            <label className={`${modalStyles.field} ${modalStyles.span2}`}>
                                Nome completo
                                <input type="text" value={newUser.displayName} onChange={e => setNewUser({ ...newUser, displayName: e.target.value })} required placeholder="Ex.: João Silva" />
                            </label>
                            <label className={modalStyles.field}>
                                E-mail
                                <input type="email" value={newUser.email} onChange={e => setNewUser({ ...newUser, email: e.target.value })} required placeholder="email@exemplo.com" />
                            </label>
                            <label className={modalStyles.field}>
                                Senha inicial
                                <input type="password" value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} required placeholder="Mínimo 6 caracteres" minLength={6} />
                            </label>
                        </div>
                        <ProfileChoices name="new" selected={newUser.allowedProfiles} restricted={restrictedProfiles} onToggle={toggleNewUserProfile} />
                        {newUser.allowedProfiles.includes('concessionaria') && (
                            <DealershipSelect dealerships={dealerships} value={newUser.dealershipId} onChange={value => setNewUser({ ...newUser, dealershipId: value })} required />
                        )}
                    </div>
                </AdminModal>
            )}

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
                        <ProfileChoices name="edit" selected={selectedProfiles} restricted={restrictedProfiles} onToggle={toggleProfile} />
                        {(selectedProfiles.includes('cliente') || selectedProfiles.includes('gratis')) && (
                            <p className={`${modalStyles.hint} ${modalStyles.flush}`}>
                                Este usuário também tem perfil de {selectedProfiles.includes('cliente') ? 'cliente' : 'teste grátis'}. Esse acesso é controlado pela assinatura, no CRM.
                            </p>
                        )}
                        {selectedProfiles.includes('concessionaria') && (
                            <DealershipSelect dealerships={dealerships} value={selectedDealershipId} onChange={setSelectedDealershipId} />
                        )}
                    </div>
                </AdminModal>
            )}
            {feedback}
        </Page>
    );
}
