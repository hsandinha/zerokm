'use client';

import { useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth'; // Importação necessária
import { auth } from '@/lib/firebase'; // Certifique-se que o caminho está correto
import styles from './LoginForm.module.css';

interface LoginFormProps {
    onLogin: (email: string, password: string) => void;
    isLoading: boolean;
    error?: string | null;
    showContactAdmin?: boolean;
    onContactAdmin?: () => void;
}

export function LoginForm({ onLogin, isLoading, error, showContactAdmin, onContactAdmin }: LoginFormProps) {
    // Estados do Login
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Novos Estados para "Esqueci a Senha"
    const [isResetMode, setIsResetMode] = useState(false);
    const [resetStatus, setResetStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [resetMessage, setResetMessage] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (email && password) {
            onLogin(email, password);
        }
    };

    // Função para enviar o e-mail de recuperação
    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email) {
            setResetMessage('Por favor, digite seu e-mail.');
            setResetStatus('error');
            return;
        }

        setResetStatus('loading');
        setResetMessage('');

        try {
            await sendPasswordResetEmail(auth, email);
            setResetStatus('success');
            setResetMessage('E-mail enviado! Verifique sua caixa de entrada e spam.');
        } catch (error: any) {
            console.error(error);
            setResetStatus('error');
            if (error.code === 'auth/user-not-found') {
                setResetMessage('Este e-mail não está cadastrado.');
            } else if (error.code === 'auth/invalid-email') {
                setResetMessage('Formato de e-mail inválido.');
            } else {
                setResetMessage('Erro ao enviar. Tente novamente mais tarde.');
            }
        }
    };

    // --- RENDERIZAÇÃO ---

    return (
        <div className={styles.loginContainer}>

            {/* MODO RECUPERAÇÃO DE SENHA */}
            {isResetMode ? (
                <form onSubmit={handleForgotPassword} className={styles.form}>
                    <div className={styles.resetHeader}>
                        <h3 className={styles.resetTitle}>Recuperar senha</h3>
                        <p className={styles.resetSubtitle}>
                        Digite seu e-mail para receber o link de redefinição.
                        </p>
                    </div>

                    {/* Mensagens de Sucesso ou Erro da Recuperação */}
                    {(resetStatus === 'error' || resetStatus === 'success') && (
                        <div className={`${styles.feedbackMessage} ${resetStatus === 'success' ? styles.feedbackSuccess : styles.feedbackError}`}>
                            {resetMessage}
                        </div>
                    )}

                    {resetStatus !== 'success' && (
                        <div className={styles.inputGroup}>
                            <label htmlFor="reset-email" className={styles.label}>
                                E-mail
                            </label>
                            <input
                                id="reset-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={styles.input}
                                placeholder="seu@email.com"
                                required
                                disabled={resetStatus === 'loading'}
                            />
                        </div>
                    )}

                    {resetStatus !== 'success' && (
                        <button
                            type="submit"
                            className={`${styles.submitButton} ${resetStatus === 'loading' ? styles.loading : ''}`}
                            disabled={resetStatus === 'loading' || !email}
                        >
                            {resetStatus === 'loading' ? 'Enviando...' : 'ENVIAR LINK'}
                        </button>
                    )}

                    <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => {
                            setIsResetMode(false);
                            setResetStatus('idle');
                            setResetMessage('');
                        }}
                    >
                        Voltar para o Login
                    </button>
                </form>
            ) : (
                /* MODO LOGIN (Seu formulário original) */
                <form onSubmit={handleSubmit} className={styles.form}>
                    {error && (
                        <div className={`${styles.feedbackMessage} ${styles.feedbackError}`}>
                            {error}
                        </div>
                    )}

                    {showContactAdmin && (
                        <button
                            type="button"
                            onClick={onContactAdmin}
                            className={styles.contactAdminButton}
                        >
                            Falar com a Administração
                        </button>
                    )}

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
                        <button
                            type="button"
                            className={styles.forgotPassword}
                            onClick={() => setIsResetMode(true)} // AÇÃO ADICIONADA AQUI
                        >
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
            )}
        </div>
    );
}
