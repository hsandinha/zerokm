'use client';

import { useState } from 'react';
import { signIn, getSession } from 'next-auth/react';
import { UserProfile } from '@/lib/types/auth';
import styles from './LoginForm.module.css';

interface LoginFormProps {
    onLogin: (email: string, password: string, profile: UserProfile) => void;
    isLoading: boolean;
}

const profiles = [
    { value: 'concessionaria', label: 'Concessionária', icon: '🏢' },
    { value: 'operador', label: 'Operador', icon: '👤' },
    { value: 'administrador', label: 'Administrador', icon: '⚙️' },
    { value: 'cliente', label: 'Cliente', icon: '🚗' }
] as const;

export function LoginForm({ onLogin, isLoading }: LoginFormProps) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [profile, setProfile] = useState<UserProfile>('cliente');
    const [showPassword, setShowPassword] = useState(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (email && password) {
            onLogin(email, password, profile);
        }
    };

    const handleGoogleLogin = async () => {
        try {
            // Temporariamente usar login simples enquanto resolve problemas do NextAuth
            onLogin(profile + '@example.com', 'demo123', profile);

            /* 
            const result = await signIn('google', {
                callbackUrl: getRedirectUrl(profile),
                redirect: false
            });

            if (result?.ok) {
                // Redireciona baseado no perfil selecionado
                window.location.href = getRedirectUrl(profile);
            }
            */
        } catch (error) {
            console.error('Erro no login com Google:', error);
        }
    };

    const getRedirectUrl = (userProfile: UserProfile) => {
        switch (userProfile) {
            case 'concessionaria':
                return '/dealership';
            case 'operador':
                return '/operator';
            case 'administrador':
                return '/admin';
            case 'cliente':
                return '/cliente';
            default:
                return '/operator';
        }
    };

    return (
        <div className={styles.loginContainer}>
            {/* Seletor de Perfil */}
            <div className={styles.profileSelector}>
                <label className={styles.label}>Tipo de Usuário</label>
                <select
                    value={profile}
                    onChange={(e) => setProfile(e.target.value as UserProfile)}
                    className={styles.select}
                >
                    {profiles.map((p) => (
                        <option key={p.value} value={p.value}>
                            {p.icon} {p.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Login com Google */}
            <button
                type="button"
                onClick={handleGoogleLogin}
                className={styles.googleButton}
                disabled={isLoading}
            >
                <svg className={styles.googleIcon} viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continuar com Google
            </button>

            {/* Separador */}
            <div className={styles.separator}>
                <span>ou</span>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>

                <div className={styles.inputGroup}>
                    <label htmlFor="email" className={styles.label}>
                        E-mail
                    </label>
                    <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className={styles.input}
                        placeholder="seu@email.com"
                        required
                    />
                </div>

                <div className={styles.inputGroup}>
                    <label htmlFor="password" className={styles.label}>
                        Senha
                    </label>
                    <div className={styles.passwordContainer}>
                        <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className={styles.input}
                            placeholder="••••••••"
                            required
                        />
                        <button
                            type="button"
                            className={styles.passwordToggle}
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            {showPassword ? '👁️' : '👁️‍🗨️'}
                        </button>
                    </div>
                </div>

                <div className={styles.options}>
                    <label className={styles.checkbox}>
                        <input type="checkbox" />
                        <span>Lembrar de mim</span>
                    </label>
                    <button type="button" className={styles.forgotPassword}>
                        Esqueceu sua senha?
                    </button>
                </div>

                <button
                    type="submit"
                    className={`${styles.submitButton} ${isLoading ? styles.loading : ''}`}
                    disabled={isLoading || !email || !password}
                >
                    {isLoading ? (
                        <>
                            <span className={styles.spinner}></span>
                            Entrando...
                        </>
                    ) : (
                        'ENTRAR'
                    )}
                </button>
            </form>
        </div>
    );
}