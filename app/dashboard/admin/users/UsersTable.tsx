'use client';

import { useState, useEffect } from 'react';
import { AdminUser, listAllUsers, updateUserProfiles, toggleUserStatus, createUser } from './actions';
import { UserProfile } from '@/lib/types/auth';
import { ConcessionariaService, Concessionaria } from '@/lib/services/concessionariaService';
import styles from './UsersTable.module.css';

export function UsersTable() {
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
    const [selectedProfiles, setSelectedProfiles] = useState<UserProfile[]>([]);
    const [canViewLocation, setCanViewLocation] = useState(false);
    const [dealerships, setDealerships] = useState<Concessionaria[]>([]);

    // Add User Modal State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newUser, setNewUser] = useState({
        displayName: '',
        email: '',
        password: '',
        allowedProfiles: ['operador'] as UserProfile[],
        dealershipId: '',
        canViewLocation: false
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
                canViewLocation: newUser.canViewLocation
            });

            if (result.success) {
                setIsAddModalOpen(false);
                setNewUser({
                    displayName: '',
                    email: '',
                    password: '',
                    allowedProfiles: ['operador'],
                    dealershipId: '',
                    canViewLocation: false
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
        const currentProfiles = newUser.allowedProfiles;
        if (currentProfiles.includes(profile)) {
            // Don't allow removing the last profile
            if (currentProfiles.length > 1) {
                setNewUser({
                    ...newUser,
                    allowedProfiles: currentProfiles.filter(p => p !== profile)
                });
            }
        } else {
            setNewUser({
                ...newUser,
                allowedProfiles: [...currentProfiles, profile]
            });
        }
    };

    const [selectedDealershipId, setSelectedDealershipId] = useState<string>('');

    const handleEdit = (user: AdminUser) => {
        setEditingUser(user);
        setSelectedProfiles(user.allowedProfiles || []);
        setSelectedDealershipId(user.dealershipId || '');
        setCanViewLocation(user.canViewLocation || false);
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

    const handleSaveProfiles = async () => {
        if (!editingUser) return;

        const result = await updateUserProfiles(
            editingUser.uid,
            selectedProfiles,
            undefined,
            selectedProfiles.includes('concessionaria') ? selectedDealershipId : undefined,
            canViewLocation
        );

        if (result.success) {
            setEditingUser(null);
            fetchUsers();
        } else {
            alert('Erro ao salvar perfis');
        }
    };

    const toggleProfile = (profile: UserProfile) => {
        if (selectedProfiles.includes(profile)) {
            setSelectedProfiles(selectedProfiles.filter(p => p !== profile));
        } else {
            setSelectedProfiles([...selectedProfiles, profile]);
        }
    };

    const getProfileBadgeClass = (profile: string) => {
        switch (profile) {
            case 'administrador': return styles.badgeAdmin;
            case 'operador': return styles.badgeOperator;
            case 'concessionaria': return styles.badgeDealership;
            case 'cliente': return styles.badgeClient;
            default: return styles.badgeOperator;
        }
    };

    if (loading) return <div>Carregando usuários...</div>;

    return (
        <div className={styles.tableContainer}>
            <div className={styles.headerActions}>
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
                        <th>Usuário</th>
                        <th>Perfis de Acesso</th>
                        <th>Status</th>
                        <th>Criado em</th>
                        <th>Ações</th>
                    </tr>
                </thead>
                <tbody>
                    {users.map(user => (
                        <tr key={user.uid}>
                            <td>
                                <div className={styles.userInfo}>
                                    <span className={styles.userName}>{user.displayName || 'Sem nome'}</span>
                                    <span className={styles.userEmail}>{user.email}</span>
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
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Add User Modal */}
            {isAddModalOpen && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <h3 className={styles.modalTitle}>Adicionar Novo Usuário</h3>
                        <form onSubmit={handleCreateUser}>
                            <div className={styles.formGroup}>
                                <label className={styles.label}>Nome Completo</label>
                                <input
                                    type="text"
                                    className={styles.input}
                                    value={newUser.displayName}
                                    onChange={e => setNewUser({ ...newUser, displayName: e.target.value })}
                                    required
                                    placeholder="Ex: João Silva"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>E-mail</label>
                                <input
                                    type="email"
                                    className={styles.input}
                                    value={newUser.email}
                                    onChange={e => setNewUser({ ...newUser, email: e.target.value })}
                                    required
                                    placeholder="email@exemplo.com"
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Senha Inicial</label>
                                <input
                                    type="password"
                                    className={styles.input}
                                    value={newUser.password}
                                    onChange={e => setNewUser({ ...newUser, password: e.target.value })}
                                    required
                                    placeholder="Mínimo 6 caracteres"
                                    minLength={6}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label className={styles.label}>Perfis de Acesso</label>
                                <div className={styles.checkboxGroup}>
                                    {['administrador', 'operador', 'concessionaria', 'cliente'].map((profile) => (
                                        <label key={profile} className={styles.checkboxLabel}>
                                            <input
                                                type="checkbox"
                                                checked={newUser.allowedProfiles.includes(profile as UserProfile)}
                                                onChange={() => toggleNewUserProfile(profile as UserProfile)}
                                            />
                                            {profile.charAt(0).toUpperCase() + profile.slice(1)}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className={styles.checkboxGroup} style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                                <label className={styles.checkboxLabel}>
                                    <input
                                        type="checkbox"
                                        checked={newUser.canViewLocation}
                                        onChange={(e) => setNewUser({ ...newUser, canViewLocation: e.target.checked })}
                                    />
                                    Pode visualizar localização exata
                                </label>
                            </div>

                            {newUser.allowedProfiles.includes('concessionaria') && (
                                <div className={styles.formGroup}>
                                    <label className={styles.label}>Vincular Concessionária</label>
                                    <select
                                        className={styles.input}
                                        value={newUser.dealershipId}
                                        onChange={e => setNewUser({ ...newUser, dealershipId: e.target.value })}
                                        required
                                    >
                                        <option value="">Selecione uma concessionária...</option>
                                        {dealerships.map(dealership => (
                                            <option key={dealership.id} value={dealership.id}>
                                                {dealership.nome}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className={styles.modalActions}>
                                <button
                                    type="button"
                                    className={styles.cancelButton}
                                    onClick={() => setIsAddModalOpen(false)}
                                    disabled={isCreating}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className={styles.saveButton}
                                    disabled={isCreating}
                                >
                                    {isCreating ? 'Criando...' : 'Criar Usuário'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingUser && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modal}>
                        <h3 className={styles.modalTitle}>Editar Acessos: {editingUser.email}</h3>

                        <div className={styles.checkboxGroup}>
                            <label className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={selectedProfiles.includes('administrador')}
                                    onChange={() => toggleProfile('administrador')}
                                />
                                Administrador
                            </label>
                            <label className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={selectedProfiles.includes('operador')}
                                    onChange={() => toggleProfile('operador')}
                                />
                                Operador
                            </label>
                            <label className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={selectedProfiles.includes('concessionaria')}
                                    onChange={() => toggleProfile('concessionaria')}
                                />
                                Concessionária
                            </label>
                            <label className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={selectedProfiles.includes('cliente')}
                                    onChange={() => toggleProfile('cliente')}
                                />
                                Cliente
                            </label>
                        </div>

                        <div className={styles.checkboxGroup} style={{ marginTop: '1rem', borderTop: '1px solid #eee', paddingTop: '1rem' }}>
                            <label className={styles.checkboxLabel}>
                                <input
                                    type="checkbox"
                                    checked={canViewLocation}
                                    onChange={(e) => setCanViewLocation(e.target.checked)}
                                />
                                Pode visualizar localização exata
                            </label>
                        </div>

                        {selectedProfiles.includes('concessionaria') && (
                            <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
                                <label className={styles.label}>Vincular Concessionária</label>
                                <select
                                    className={styles.input}
                                    value={selectedDealershipId}
                                    onChange={e => setSelectedDealershipId(e.target.value)}
                                >
                                    <option value="">Selecione uma concessionária...</option>
                                    {dealerships.map(dealership => (
                                        <option key={dealership.id} value={dealership.id}>
                                            {dealership.nome}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className={styles.modalActions}>
                            <button className={styles.cancelButton} onClick={() => setEditingUser(null)}>Cancelar</button>
                            <button className={styles.saveButton} onClick={handleSaveProfiles}>Salvar Alterações</button>
                        </div>
                    </div>
                </div>
            )
            }


        </div >
    );
}
