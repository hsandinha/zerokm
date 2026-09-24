import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WhatsAppTheme } from '../../wa/components/admin-theme';
import { AdminThemeProvider, useTheme } from '../../lib/contexts/ThemeContext';

function Toggle() {
    const { theme, toggleTheme } = useTheme();
    return <button onClick={toggleTheme}>{theme}</button>;
}

describe('tema administrativo', () => {
    it('começa claro, preserva o tema global e restaura a preferência própria', async () => {
        localStorage.removeItem('cnv-admin-theme');
        localStorage.setItem('theme', 'dark');
        document.documentElement.dataset.theme = 'dark';
        const view = render(<AdminThemeProvider><WhatsAppTheme><Toggle /></WhatsAppTheme></AdminThemeProvider>);
        fireEvent.click(screen.getByRole('button', { name: 'light' }));
        expect(localStorage.getItem('cnv-admin-theme')).toBe('dark');
        expect(document.getElementById('wa-raiz')).toHaveClass('wa-dark');
        expect(localStorage.getItem('theme')).toBe('dark');
        expect(document.documentElement.dataset.theme).toBe('dark');
        view.unmount();
        render(<AdminThemeProvider><WhatsAppTheme><Toggle /></WhatsAppTheme></AdminThemeProvider>);
        await waitFor(() => expect(screen.getByRole('button', { name: 'dark' })).toBeInTheDocument());
    });
});
