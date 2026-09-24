import type { Viewport } from 'next';
import { Inter } from 'next/font/google';
import { AdminThemeProvider } from '@/lib/contexts/ThemeContext';
import './design-system.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-admin' });

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 5 };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return <div className={inter.variable}><AdminThemeProvider>{children}</AdminThemeProvider></div>;
}
