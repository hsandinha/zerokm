'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import styles from './page.module.css';
import { VideoBackground } from '../components/login/VideoBackground';
import { LoginForm } from '../components/login/LoginForm';
import { Logo } from '../components/Logo';
import { SessionProvider } from '../components/providers/SessionProvider';

import { UserProfile } from '@/lib/types/auth';

function LoginContent() {
    const [isLoading, setIsLoading] = useState(false);
    const [initialLoading, setInitialLoading] = useState(true);
    const router = useRouter();
    const { data: session, status } = useSession();

    // Controlar loading inicial
    useEffect(() => {
        const timer = setTimeout(() => {
            setInitialLoading(false);
        }, 500); // Pequeno delay para evitar flash

        return () => clearTimeout(timer);
    }, []);

    // Se já está autenticado, redireciona (apenas uma vez)
    useEffect(() => {
        if (status === 'authenticated' && session && !isLoading) {
            // Redireciona para o dashboard padrão
            router.replace('/dashboard/operator');
        }
    }, [status, session, router, isLoading]);

    const handleLogin = async (email: string, password: string, profile: UserProfile) => {
        setIsLoading(true);

        try {
            // Simular autenticação tradicional (mantém funcionalidade existente)
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Redirecionar baseado no perfil
            switch (profile) {
                case 'administrador':
                    router.push('/dashboard/admin');
                    break;
                case 'operador':
                    router.push('/dashboard/operator');
                    break;
                case 'concessionaria':
                    router.push('/dashboard/dealership');
                    break;
                case 'cliente':
                    router.push('/dashboard/cliente');
                    break;
                default:
                    // Perfil não reconhecido, manter na página atual
                    break;
            }
        } catch (error) {
            console.error('Erro no login:', error);
        } finally {
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

                    <LoginForm onLogin={handleLogin} isLoading={isLoading} />
                </div>
            </div>
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