'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { signInWithEmailAndPassword, updatePassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import styles from './page.module.css';
import { VideoBackground } from '../components/login/VideoBackground';
import { LoginForm } from '../components/login/LoginForm';
import { Logo } from '../components/Logo';
import { SessionProvider } from '../components/providers/SessionProvider';

import { UserProfile } from '@/lib/types/auth';
import { checkUserAndLogin, getUserAllowedProfiles, markUserAsSetup } from './actions';

function LoginContent() {
    const [isLoading, setIsLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showContactAdmin, setShowContactAdmin] = useState(false);

    // Estados para seleção de perfil
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [availableProfiles, setAvailableProfiles] = useState<UserProfile[]>([]);
    const [pendingAuthData, setPendingAuthData] = useState<{ token: string, email: string } | null>(null);

    // Estado para troca de senha
    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState<string | null>(null);

    const router = useRouter();
    const { data: session, status } = useSession();

    // Controlar loading inicial
    useEffect(() => {
        const timer = setTimeout(() => {
            setInitialLoading(false);
        }, 500); // Pequeno delay para evitar flash

        return () => clearTimeout(timer);
    }, []);

    const redirectToDashboard = useCallback((profile: UserProfile) => {
        console.log('Redirecting to dashboard for profile:', profile);
        switch (profile) {
            case 'administrador':
            case 'gerente':
                router.replace('/dashboard/admin');
                break;
            case 'concessionaria':
                router.replace('/dashboard/dealership');
                break;
            case 'cliente':
                router.replace('/dashboard/cliente');
                break;
            case 'operador':
            default:
                router.replace('/dashboard/operator');
                break;
        }
    }, [router]);

    // Se já está autenticado, redireciona (apenas uma vez)
    useEffect(() => {
        if (status === 'authenticated' && session?.user && !isLoading) {
            const profile = session.user.profile as UserProfile;
            redirectToDashboard(profile);
        }
    }, [status, session, isLoading, redirectToDashboard]);

    const handleContactAdmin = () => {
        window.location.href = 'mailto:admin@zerokm.com.br?subject=Solicitação de Acesso - Zero KM';
    };

    const handleLogin = async (email: string, password: string) => {
        setIsLoading(true);
        setError(null);
        setShowContactAdmin(false);

        try {
            // 1. Validar credenciais no servidor (Admin SDK + Client SDK)
            const formData = new FormData();
            formData.append('email', email);
            formData.append('password', password);

            const result = await checkUserAndLogin(formData);

            if (!result.success) {
                setError(result.message || 'Erro ao fazer login');
                if (result.type === 'USER_NOT_FOUND') {
                    setShowContactAdmin(true);
                }
                setIsLoading(false);
                return;
            }

            // 2. Se passou na validação do servidor, faz o login real no cliente para persistir a sessão
            const userCredential = await signInWithEmailAndPassword(auth, email, password);

            // 3. Obter o token ID do Firebase
            const token = await userCredential.user.getIdToken();

            // 4. Verificar perfis disponíveis para este usuário
            const { profiles, forcePasswordChange } = await getUserAllowedProfiles(email);

            console.log('Profiles found:', profiles); // Debug log

            if (!profiles || profiles.length === 0) {
                setError('Nenhum perfil associado a este usuário.');
                setIsLoading(false);
                return;
            }

            // 5. Verificar se precisa trocar a senha
            if (forcePasswordChange) {
                setPendingAuthData({ token, email });
                setShowPasswordModal(true);
                setIsLoading(false);
                return;
            }

            // 6. Se tiver mais de um perfil, mostrar modal de seleção
            if (profiles.length > 1) {
                setAvailableProfiles(profiles);
                setPendingAuthData({ token, email });
                setShowProfileModal(true);
                setIsLoading(false);
                return;
            }

            // 7. Se tiver apenas um perfil, prosseguir com o login
            await completeLogin(token, profiles[0]);

        } catch (error: any) {
            console.error('Erro no login:', error);
            setError('Ocorreu um erro ao fazer login. Tente novamente.');
            setIsLoading(false);
        }
    };

    const completeLogin = async (token: string, selectedProfile: UserProfile) => {
        try {
            // Autenticar com NextAuth (cria a sessão de cookie)
            const nextAuthResult = await signIn('credentials', {
                token,
                selectedProfile,
                redirect: false
            });

            if (nextAuthResult?.error) {
                console.error('Erro no NextAuth:', nextAuthResult.error);
                setError('Erro ao criar sessão. Tente novamente.');
                setIsLoading(false);
                return;
            }

            // Redirecionamento é tratado pelo useEffect quando o status mudar para authenticated
            // Mas podemos forçar aqui também para ser mais rápido
            redirectToDashboard(selectedProfile);

        } catch (error) {
            console.error('Erro ao completar login:', error);
            setError('Erro inesperado ao finalizar login.');
            setIsLoading(false);
        }
    };

    const handleProfileSelect = (profile: UserProfile) => {
        if (pendingAuthData) {
            setIsLoading(true);
            setShowProfileModal(false);
            completeLogin(pendingAuthData.token, profile);
        }
    };

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordError(null);

        if (newPassword.length < 6) {
            setPasswordError('A senha deve ter pelo menos 6 caracteres.');
            return;
        }

        if (newPassword !== confirmPassword) {
            setPasswordError('As senhas não coincidem.');
            return;
        }

        setIsLoading(true);

        try {
            // Atualizar senha no Firebase Auth (Client SDK)
            if (auth.currentUser) {
                await updatePassword(auth.currentUser, newPassword);

                // Marcar usuário como configurado no Firestore (Server Action)
                if (pendingAuthData?.email) {
                    await markUserAsSetup(pendingAuthData.email);
                }

                // Prosseguir com o login
                setShowPasswordModal(false);

                // Recarregar perfis para continuar o fluxo
                if (pendingAuthData) {
                    const { profiles } = await getUserAllowedProfiles(pendingAuthData.email);

                    if (profiles.length > 1) {
                        setAvailableProfiles(profiles);
                        setShowProfileModal(true);
                        setIsLoading(false);
                    } else {
                        await completeLogin(pendingAuthData.token, profiles[0]);
                    }
                }
            } else {
                throw new Error('Usuário não autenticado');
            }
        } catch (error: any) {
            console.error('Erro ao atualizar senha:', error);
            setPasswordError('Erro ao atualizar senha. Tente novamente.');
            setIsLoading(false);
        }
    };

    // Mostra loading enquanto verifica a sessão ou durante carregamento inicial
    if (status === 'loading' || initialLoading) {
        return (
            <div className={styles.loadingContainer}>
                <div className={styles.loadingContent}>
                    <Logo />
                    <div className={styles.loadingSpinner}></div>
                    <p className={styles.loadingText}>
                        {status === 'loading' ? 'Verificando autenticação...' : 'Carregando...'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Seção esquerda com vídeo e welcome text */}
            <div className={styles.leftSection}>
                <div className={styles.videoContainer}>
                    <video
                        className={styles.videoBackground}
                        src="/video.mp4"
                        autoPlay
                        muted
                        loop
                        playsInline
                        title="Automobile Video Background"
                    />
                </div>
            </div>

            {/* Seção direita com formulário */}
            <div className={styles.rightSection}>
                <div className={styles.content}>
                    <div className={styles.header}>
                        <Logo />
                        <h2 className={styles.signInTitle}>Sign In</h2>
                        <p className={styles.subtitle}>Entre com suas credenciais para acessar o sistema</p>
                    </div>

                    <LoginForm
                        onLogin={handleLogin}
                        isLoading={isLoading}
                        error={error}
                        showContactAdmin={showContactAdmin}
                        onContactAdmin={handleContactAdmin}
                    />
                </div>
            </div>

            {/* Modal de Seleção de Perfil */}
            {showProfileModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <h3 className={styles.modalTitle}>Selecione o Perfil</h3>
                        <p className={styles.modalSubtitle}>Como você deseja acessar o sistema?</p>

                        <div className={styles.profileList}>
                            {availableProfiles
                                .filter(p => !(p === 'administrador' && availableProfiles.includes('gerente')))
                                .map((profile) => (
                                    <button
                                        key={profile}
                                        className={styles.profileButton}
                                        onClick={() => handleProfileSelect(profile)}
                                    >
                                        <span className={styles.profileIcon}>
                                            {(profile === 'administrador' || profile === 'gerente') && '🛡️'}
                                            {profile === 'operador' && '👨‍💼'}
                                            {profile === 'concessionaria' && '🏢'}
                                            {profile === 'cliente' && '👤'}
                                        </span>
                                        <span className={styles.profileName}>
                                            {profile === 'gerente' ? 'Administrador' : profile.charAt(0).toUpperCase() + profile.slice(1)}
                                        </span>
                                    </button>
                                ))}
                        </div>

                        <button
                            className={styles.cancelButton}
                            onClick={() => {
                                setShowProfileModal(false);
                                setPendingAuthData(null);
                                setIsLoading(false);
                            }}
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}

            {/* Modal de Troca de Senha */}
            {showPasswordModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <h3 className={styles.modalTitle}>Definir Nova Senha</h3>
                        <p className={styles.modalSubtitle}>
                            Para sua segurança, você precisa definir uma nova senha no primeiro acesso.
                        </p>

                        <form onSubmit={handlePasswordChange}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                                    Nova Senha
                                </label>
                                <input
                                    type="password"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '0.5rem',
                                        fontSize: '1rem'
                                    }}
                                    required
                                    minLength={6}
                                    placeholder="Mínimo 6 caracteres"
                                />
                            </div>

                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500, color: '#374151' }}>
                                    Confirmar Nova Senha
                                </label>
                                <input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.75rem',
                                        border: '1px solid #d1d5db',
                                        borderRadius: '0.5rem',
                                        fontSize: '1rem'
                                    }}
                                    required
                                    minLength={6}
                                    placeholder="Repita a nova senha"
                                />
                            </div>

                            {passwordError && (
                                <div style={{
                                    color: '#dc2626',
                                    fontSize: '0.875rem',
                                    marginBottom: '1rem',
                                    textAlign: 'center',
                                    backgroundColor: '#fee2e2',
                                    padding: '0.5rem',
                                    borderRadius: '0.375rem'
                                }}>
                                    {passwordError}
                                </div>
                            )}

                            <button
                                type="submit"
                                style={{
                                    width: '100%',
                                    padding: '0.75rem',
                                    backgroundColor: '#3b82f6',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '0.5rem',
                                    fontSize: '1rem',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    transition: 'background-color 0.2s'
                                }}
                                disabled={isLoading}
                            >
                                {isLoading ? 'Atualizando...' : 'Atualizar Senha'}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function LoginPage() {
    return (
        <SessionProvider>
            <LoginContent />
        </SessionProvider>
    );
}