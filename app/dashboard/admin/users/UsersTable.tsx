'use client';

import { useState, useEffect } from 'react';
import { AdminUser, listAllUsers, updateUserProfiles, toggleUserStatus, createUser, deleteUser } from './actions';
import { UserProfile } from '@/lib/types/auth';
import { toggleProfileSelection } from '@/lib/utils/userProfiles';
import { ConcessionariaService, Concessionaria } from '@/lib/services/concessionariaService';
import styles from './UsersTable.module.css';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';

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
    const [sortColumn, setSortColumn] = useState<'usuario' | 'perfis' | 'status' | 'criado' | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

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
                alert('Usuário criado com sucesso!');
            } else {
                alert('Erro ao criar usuário: ' + result.error);
            }
        } catch (error) {
            console.error('Error creating user:', error);
            alert('Erro inesperado ao criar usuário');
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
        if (!confirm(`Tem certeza que deseja ${user.disabled ? 'ativar' : 'desativar'} este usuário?`)) return;

        const result = await toggleUserStatus(user.uid, !user.disabled);
        if (result.success) {
            fetchUsers();
        } else {
            alert('Erro ao atualizar status');
        }
    };

    const handleDeleteUser = async (user: AdminUser) => {
        if (!confirm(`ATENÇÃO: Tem certeza que deseja EXCLUIR permanentemente o usuário "${user.displayName || user.email}"?\n\nEsta ação não pode ser desfeita!`)) return;

        const result = await deleteUser(user.uid);
        if (result.success) {
            alert('Usuário excluído com sucesso!');
            fetchUsers();
        } else {
            alert('Erro ao excluir usuário: ' + result.error);
        }
    };

    const handleSaveProfiles = async () => {
        if (!editingUser) return;

        const result = await updateUserProfiles(
            editingUser.uid,
            selectedProfiles,
            undefined,
            selectedProfiles.includes('concessionaria') ? selectedDealershipId : undefined
        );

        if (result.success) {
            setEditingUser(null);
            fetchUsers();
        } else {
            alert('Erro ao salvar perfis');
        }
    };

    const toggleProfile = (profile: UserProfile) => {
        setSelectedProfiles(toggleProfileSelection(selectedProfiles, profile));
    };

    const getProfileBadgeClass = (profile: string) => {
        switch (profile) {
            case 'administrador': return styles.badgeAdmin;
            case 'gerente': return styles.badgeManager;
            case 'operador': return styles.badgeOperator;
            case 'concessionaria': return styles.badgeDealership;
            case 'cliente': return styles.badgeClient;
            default: return styles.badgeOperator;
        }
    };

    const handleSort = (col: 'usuario' | 'perfis' | 'status' | 'criado') => {
        if (sortColumn === col) {
            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(col);
            setSortDirection('asc');
        }
    };

    const sortIcon = (col: 'usuario' | 'perfis' | 'status' | 'criado') => {
        if (sortColumn !== col) return <span className={styles.sortIcon}>↕</span>;
        return <span className={styles.sortIconActive}>{sortDirection === 'asc' ? '↑' : '↓'}</span>;
    };

    const term = searchTerm.toLowerCase();
    const filteredAndSorted = [...users]
        .filter(u => {
            if (!term) return true;
            const name = (u.displayName || '').toLowerCase();
            const email = (u.email || '').toLowerCase();
            const perfis = (u.allowedProfiles || []).join(' ').toLowerCase();
            const status = (u.disabled ? 'inativo' : 'ativo');
            const criado = new Date(u.creationTime || '').toLocaleDateString();
            return name.includes(term) || email.includes(term) || perfis.includes(term) || status.includes(term) || criado.includes(term);
        })
        .sort((a, b) => {
            if (!sortColumn) return 0;
            let valA = '';
            let valB = '';
            if (sortColumn === 'usuario') {
                valA = (a.displayName || a.email || '').toLowerCase();
                valB = (b.displayName || b.email || '').toLowerCase();
            } else if (sortColumn === 'perfis') {
                valA = (a.allowedProfiles || []).join(',').toLowerCase();
                valB = (b.allowedProfiles || []).join(',').toLowerCase();
            } else if (sortColumn === 'status') {
                valA = a.disabled ? 'inativo' : 'ativo';
                valB = b.disabled ? 'inativo' : 'ativo';
            } else if (sortColumn === 'criado') {
                valA = a.creationTime || '';
                valB = b.creationTime || '';
            }
            const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
            return sortDirection === 'asc' ? cmp : -cmp;
        });

    if (loading) return <div>Carregando usuários...</div>;

    return (
        <div className={styles.tableContainer}>
            <div className={styles.headerActions}>
                <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Buscar em todas as colunas..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                <button
                    className={styles.addButton}
                    onClick={() => setIsAddModalOpen(true)}
                >
                    <span>+</span> Adicionar Usuário
                </button>
            </div>

            <table className={styles.table}>
                <thead>
                    <tr>
                        <th className={styles.sortable} onClick={() => handleSort('usuario')}>Usuário {sortIcon('usuario')}</th>
                        <th className={styles.sortable} onClick={() => handleSort('perfis')}>Perfis de Acesso {sortIcon('perfis')}</th>
                        <th className={styles.sortable} onClick={() => handleSort('status')}>Status {sortIcon('status')}</th>
                        <th className={styles.sortable} onClick={() => handleSort('criado')}>Criado em {sortIcon('criado')}</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredAndSorted.map(user => (
                        <tr key={user.uid}>
                            <td>
                                <div className={styles.userInfo}>
                                    <span className={styles.userName}>{user.displayName || 'Sem nome'}</span>
                                    <span className={styles.userEmail}>{user.email}</span>
                                    {user.invitedBy && (
                                        <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#4338ca', display: 'inline-flex', alignItems: 'center', gap: '4px', background: '#e0e7ff', padding: '2px 6px', borderRadius: '4px', alignSelf: 'flex-start' }}>
                                            <span>🔗 Convidado por: {user.invitedBy.name} ({user.invitedBy.email})</span>
                                        </div>
                                    )}
                                    {user.invitedUsers && user.invitedUsers.length > 0 && (
                                        <div style={{ marginTop: '0.25rem', fontSize: '0.75rem', color: '#047857', display: 'flex', flexDirection: 'column', gap: '2px', background: '#d1fae5', padding: '4px 6px', borderRadius: '4px', alignSelf: 'flex-start' }}>
                                            <span style={{ fontWeight: 600 }}>👥 Convidou ({user.invitedUsers.length}):</span>
                                            {user.invitedUsers.map(iu => (
                                                <span key={iu.email} style={{ paddingLeft: '4px' }}>- {iu.name} ({iu.email})</span>
                                            ))}
                                        </div>
                                    )}
                                    {(user.allowedProfiles?.includes('cliente') || user.allowedProfiles?.includes('gratis')) && (() => {
                                        const sub = crmDataMap.get(user.email || '');
                                        if (!sub) return null;
                                        const color = sub.status === 'active' ? '#10b981' : sub.status === 'expired' ? '#ef4444' : '#f59e0b';
                                        const label = sub.status === 'active' ? 'Ativo' : sub.status === 'expired' ? 'Expirado' : 'Sem plano';
                                        let detail = sub.planName ? ` • ${sub.planName}` : '';
                                        if (sub.status === 'active' && sub.expiresAt) {
                                            const expDate = new Date(sub.expiresAt).toLocaleDateString('pt-BR');
                                            detail += ` • até ${expDate}`;
                                            if (sub.daysUntilExpiry !== null && sub.daysUntilExpiry <= 7) detail += ` (⚠️ ${sub.daysUntilExpiry}d)`;
                                        } else if (sub.status === 'expired' && sub.daysUntilExpiry !== null) {
                                            detail += ` há ${Math.abs(sub.daysUntilExpiry)}d`;
                                        }
                                        return (
                                            <span className={styles.subscriptionBadge} style={{ color }}>
                                                ● {label}{detail}
                                            </span>
                                        );
                                    })()}
                                </div>
                            </td>
                            <td>
                                {user.allowedProfiles && user.allowedProfiles.length > 0 ? (
                                    user.allowedProfiles.map(p => (
                                        <span key={p} className={`${styles.badge} ${getProfileBadgeClass(p)}`}>
                                            {p}
                                        </span>
                                    ))
                                ) : (
                                    <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Nenhum perfil</span>
                                )}
                            </td>
                            <td>
                                <span className={user.disabled ? styles.statusDisabled : styles.statusActive}>
                                    {user.disabled ? 'Inativo' : 'Ativo'}
                                </span>
                            </td>
                            <td>{new Date(user.creationTime || '').toLocaleDateString()}</td>
                            <td>
                                <div className={styles.actions}>
                                    <button className={`${styles.button} ${styles.btnEdit}`} onClick={() => handleEdit(user)}>
                                        Editar Perfis
                                    </button>
                                    <button className={`${styles.button} ${styles.btnToggle}`} onClick={() => handleToggleStatus(user)}>
                                        {user.disabled ? 'Ativar' : 'Desativar'}
                                    </button>
                                    {onViewInCRM && (user.allowedProfiles?.includes('cliente') || user.allowedProfiles?.includes('gratis')) && (
                                        <button
                                            className={`${styles.button} ${styles.btnCRM}`}
                                            onClick={() => onViewInCRM(user.email || '')}
                                            title="Ver detalhes no CRM"
                                        >
                                            🎯 CRM
                                        </button>
                                    )}
                                    <button className={`${styles.button} ${styles.btnDelete}`} onClick={() => handleDeleteUser(user)}>
                                        Excluir
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {isAddModalOpen && (
                <AdminModal
                    title="Adicionar usuário"
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
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={() => setEditingUser(null)}>Cancelar</button>
                        <button type="button" className={modalStyles.primary} onClick={handleSaveProfiles}>Salvar alterações</button>
                    </>}
                >
                    <div className={modalStyles.stack}>
                        <ProfileChoices name="edit" selected={selectedProfiles} restricted={restrictedProfiles} onToggle={toggleProfile} />
                        {(selectedProfiles.includes('cliente') || selectedProfiles.includes('gratis')) && (
                            <p className={modalStyles.hint} style={{ margin: 0 }}>
                                Este usuário também tem perfil de {selectedProfiles.includes('cliente') ? 'cliente' : 'teste grátis'}. Esse acesso é controlado pela assinatura, no CRM.
                            </p>
                        )}
                        {selectedProfiles.includes('concessionaria') && (
                            <DealershipSelect dealerships={dealerships} value={selectedDealershipId} onChange={setSelectedDealershipId} />
                        )}
                    </div>
                </AdminModal>
            )}
        </div >
    );
}
