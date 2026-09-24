import { Inter } from 'next/font/google';
import { AdminThemeProvider } from '@/lib/contexts/ThemeContext';
import '@/app/dashboard/admin/design-system.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-admin' });

/** Fonte, tema (claro/escuro salvo por usuário) e tokens do design system da equipe. */
export function AdminDesignLayout({ children }: { children: React.ReactNode }) {
    return <div className={inter.variable}><AdminThemeProvider>{children}</AdminThemeProvider></div>;
}
