import type { ReactNode } from 'react';

/** Ícones de traço da landing page (mesmo desenho do lucide, sem depender do pacote no servidor). */
function Icone({ size = 20, strokeWidth = 1.8, children }: { size?: number; strokeWidth?: number; children: ReactNode }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            {children}
        </svg>
    );
}

type P = { size?: number };

export const IconArrowRight = ({ size = 18 }: P) => <Icone size={size} strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></Icone>;
export const IconSearch = ({ size = 16 }: P) => <Icone size={size} strokeWidth={2}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icone>;
export const IconBell = ({ size = 18 }: P) => <Icone size={size} strokeWidth={2}><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15z" /><path d="M10 20a2 2 0 0 0 4 0" /></Icone>;
export const IconTable = ({ size = 22 }: P) => <Icone size={size}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10" /></Icone>;
export const IconHeart = ({ size = 22 }: P) => <Icone size={size}><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></Icone>;
export const IconFile = ({ size = 22 }: P) => <Icone size={size}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></Icone>;
export const IconTruck = ({ size = 22 }: P) => <Icone size={size}><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.6" /><circle cx="17" cy="17.5" r="1.6" /></Icone>;
export const IconRepeat = ({ size = 22 }: P) => <Icone size={size}><path d="M4 12a7 7 0 0 1 12-5l2 2M20 12a7 7 0 0 1-12 5l-2-2" /><path d="M18 4v5h-5M6 20v-5h5" /></Icone>;
export const IconPhone = ({ size = 22 }: P) => <Icone size={size}><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M11 17h2" /></Icone>;
export const IconUpload = ({ size = 20 }: P) => <Icone size={size}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></Icone>;
export const IconMegaphone = ({ size = 20 }: P) => <Icone size={size}><path d="M4 10v4h3l6 4V6L7 10z" /><path d="M17 9a4 4 0 0 1 0 6" /></Icone>;
export const IconInbox = ({ size = 20 }: P) => <Icone size={size}><path d="M4 13l2-8h12l2 8v6H4z" /><path d="M4 13h5l1 2h4l1-2h5" /></Icone>;
export const IconChat = ({ size = 18 }: P) => <Icone size={size} strokeWidth={2}><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5z" /></Icone>;
export const IconCheck = ({ size = 20 }: P) => <Icone size={size} strokeWidth={2.2}><path d="m5 12 4.5 4.5L19 7" /></Icone>;
export const IconChevronDown = ({ size = 20 }: P) => <Icone size={size} strokeWidth={2}><path d="m6 9 6 6 6-6" /></Icone>;
export const IconMenu = ({ size = 20 }: P) => <Icone size={size} strokeWidth={2}><path d="M4 7h16M4 12h16M4 17h16" /></Icone>;
export const IconClose = ({ size = 20 }: P) => <Icone size={size} strokeWidth={2}><path d="M6 6l12 12M18 6 6 18" /></Icone>;
