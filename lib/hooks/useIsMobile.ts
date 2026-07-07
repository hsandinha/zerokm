'use client';

import { useEffect, useState } from 'react';

const MOBILE_QUERY = '(max-width: 768px)';

/**
 * Detecta viewport mobile via matchMedia. Retorna false no SSR/primeiro render
 * para evitar hydration mismatch.
 */
export function useIsMobile(): boolean {
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const mql = window.matchMedia(MOBILE_QUERY);
        const update = () => setIsMobile(mql.matches);
        update();
        mql.addEventListener('change', update);
        return () => mql.removeEventListener('change', update);
    }, []);

    return isMobile;
}
