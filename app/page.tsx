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
    const router = useRouter();
    const { data: session, status } = useSession();

    // Se já está autenticado, redireciona
    useEffect(() => {
        if (status === 'authenticated' && session) {
            // Redireciona para o dashboard padrão (pode ser customizado baseado no usuário)
            router.push('/dashboard/operator');
        }
    }, [status, session, router]);

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

    // Mostra loading enquanto verifica a sessão
    if (status === 'loading') {
        return (
            <div className={styles.container}>
                <div className={styles.loadingScreen}>
                    <Logo />
                    <div className={styles.loadingSpinner}></div>
                    <p>Verificando autenticação...</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Seção esquerda com vídeo e welcome text */}
            <div className={styles.leftSection}>
                <div className={styles.videoContainer}>
                    <iframe
                        className={styles.videoBackground}
                        src="https://player.vimeo.com/video/354473209?autoplay=1&loop=1&muted=1&background=1&quality=720p"
                        frameBorder="0"
                        allow="autoplay; fullscreen"
                        title="Automobile Video Background"
                    ></iframe>
                </div>

                <div className={styles.welcomeContent}>
                    <h1 className={styles.welcomeTitle}>
                        Welcome<br />
                        Back
                    </h1>
                    <p className={styles.welcomeSubtitle}>
                        Acesse a plataforma mais completa para vendas de veículos zero quilômetro no Brasil
                    </p>
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