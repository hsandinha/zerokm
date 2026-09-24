import { Inter } from 'next/font/google';
import { AdminThemeProvider } from '@/lib/contexts/ThemeContext';
import './design-system.css';

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-admin' });

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return <div className={inter.variable}><AdminThemeProvider>{children}</AdminThemeProvider></div>;
}
