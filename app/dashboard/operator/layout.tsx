import type { Viewport } from 'next';
import { AdminDesignLayout } from '@/components/dashboard/AdminDesignLayout';

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 5 };

/** Mesmo design system do admin: todos os perfis da equipe usam o mesmo padrão visual. */
export default function DashboardProfileLayout({ children }: { children: React.ReactNode }) {
    return <AdminDesignLayout>{children}</AdminDesignLayout>;
}
