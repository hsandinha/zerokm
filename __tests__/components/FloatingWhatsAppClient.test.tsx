import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FloatingWhatsAppClient } from '@/components/lp/FloatingWhatsAppClient';

describe('FloatingWhatsAppClient', () => {
    // ── Teste Unitário ──
    it('should not render when whatsappNumber is empty', () => {
        const { container } = render(<FloatingWhatsAppClient whatsappNumber="" />);
        expect(container.firstChild).toBeNull();
    });

    it('should render when a valid whatsappNumber is provided', () => {
        render(<FloatingWhatsAppClient whatsappNumber="5511926384826" />);
        const link = screen.getByRole('link');
        expect(link).toBeInTheDocument();
    });

    // ── Teste de Integração (link correto) ──
    it('should link to the correct wa.me URL with the provided number', () => {
        render(<FloatingWhatsAppClient whatsappNumber="5511926384826" />);
        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('href', 'https://wa.me/5511926384826');
    });

    it('should open link in a new tab (target=_blank)', () => {
        render(<FloatingWhatsAppClient whatsappNumber="5511999999999" />);
        const link = screen.getByRole('link');
        expect(link).toHaveAttribute('target', '_blank');
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });

    // ── Teste de Acessibilidade (a11y) ──
    it('should have an accessible aria-label', () => {
        render(<FloatingWhatsAppClient whatsappNumber="5511926384826" />);
        const link = screen.getByLabelText('Atendimento via WhatsApp');
        expect(link).toBeInTheDocument();
    });

    it('should contain an SVG icon for WhatsApp', () => {
        render(<FloatingWhatsAppClient whatsappNumber="5511926384826" />);
        const link = screen.getByRole('link');
        const svg = link.querySelector('svg');
        expect(svg).toBeInTheDocument();
    });

    // ── Teste de Snapshot ──
    it('should match snapshot', () => {
        const { container } = render(<FloatingWhatsAppClient whatsappNumber="5511926384826" />);
        expect(container).toMatchSnapshot();
    });
});
