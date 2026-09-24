import type { Viewport } from 'next';
import { AdminDesignLayout } from '@/components/dashboard/AdminDesignLayout';

export const viewport: Viewport = { width: 'device-width', initialScale: 1, maximumScale: 5 };

/** Cliente no mesmo design system dos painéis da equipe. */
export default function DashboardProfileLayout({ children }: { children: React.ReactNode }) {
    return <AdminDesignLayout>{children}</AdminDesignLayout>;
}
