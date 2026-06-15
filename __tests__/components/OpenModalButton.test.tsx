import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SessionProvider } from 'next-auth/react';
import { OpenModalButton } from '@/components/lp/OpenModalButton';

// Wrapper com sessão não autenticada (usuário não logado)
function Wrapper({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider session={null}>
            {children}
        </SessionProvider>
    );
}

describe('OpenModalButton', () => {
    // ── Teste Unitário ──
    it('should render with the provided children text', () => {
        render(<OpenModalButton type="cliente">Começar grátis</OpenModalButton>, { wrapper: Wrapper });
        expect(screen.getByText('Começar grátis')).toBeInTheDocument();
    });

    it('should render as a button element', () => {
        render(<OpenModalButton type="cliente">Test</OpenModalButton>, { wrapper: Wrapper });
        const button = screen.getByRole('button');
        expect(button).toBeInTheDocument();
        expect(button).toHaveAttribute('type', 'button');
    });

    // ── Teste de Integração (evento customizado — usuário NÃO logado) ──
    it('should dispatch open-register custom event with type "cliente" when clicked', () => {
        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
        render(<OpenModalButton type="cliente">Registrar</OpenModalButton>, { wrapper: Wrapper });

        fireEvent.click(screen.getByRole('button'));

        expect(dispatchSpy).toHaveBeenCalledOnce();
        const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
        expect(event.type).toBe('open-register');
        expect(event.detail).toEqual({ type: 'cliente' });
    });

    it('should dispatch open-register custom event with type "concessionaria" when clicked', () => {
        const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
        render(<OpenModalButton type="concessionaria">Cadastro Conc.</OpenModalButton>, { wrapper: Wrapper });

        fireEvent.click(screen.getByRole('button'));

        const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
        expect(event.detail).toEqual({ type: 'concessionaria' });
    });

    // ── Teste de Props (className e style) ──
    it('should apply custom className', () => {
        render(<OpenModalButton type="cliente" className="custom-class">Go</OpenModalButton>, { wrapper: Wrapper });
        expect(screen.getByRole('button')).toHaveClass('custom-class');
    });

    it('should apply custom style', () => {
        render(
            <OpenModalButton type="cliente" style={{ backgroundColor: 'red' }}>
                Styled
            </OpenModalButton>,
            { wrapper: Wrapper }
        );
        const button = screen.getByRole('button');
        expect(button.getAttribute('style')).toContain('background-color');
    });

    // ── Teste de Snapshot ──
    it('should match snapshot for type cliente', () => {
        const { container } = render(
            <OpenModalButton type="cliente" className="btnPrimary">
                Começar grátis
            </OpenModalButton>,
            { wrapper: Wrapper }
        );
        expect(container).toMatchSnapshot();
    });
});
