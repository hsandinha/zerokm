import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SemaforoIndicator } from '@/components/SemaforoIndicator';

describe('SemaforoIndicator Component', () => {
    it('should render label text', () => {
        render(<SemaforoIndicator status="verde" label="Sistema Operacional" />);
        expect(screen.getByText('Sistema Operacional')).toBeInTheDocument();
    });

    it('should render detail when provided', () => {
        render(<SemaforoIndicator status="verde" label="API" detail="Latência: 45ms" />);
        expect(screen.getByText('Latência: 45ms')).toBeInTheDocument();
    });

    it('should not render detail when not provided', () => {
        render(<SemaforoIndicator status="verde" label="API" />);
        expect(screen.queryByText('Latência')).not.toBeInTheDocument();
    });

    it('should render three light indicators', () => {
        const { container } = render(<SemaforoIndicator status="verde" label="Test" />);
        const lights = container.querySelectorAll('[class*="light"]');
        expect(lights.length).toBeGreaterThanOrEqual(3);
    });

    it('should render label as strong element', () => {
        render(<SemaforoIndicator status="amarelo" label="Alerta" />);
        const label = screen.getByText('Alerta');
        expect(label.tagName).toBe('STRONG');
    });

    it('should render with status verde', () => {
        const { container } = render(<SemaforoIndicator status="verde" label="OK" />);
        expect(container.firstChild).toBeInTheDocument();
    });

    it('should render with status amarelo', () => {
        const { container } = render(<SemaforoIndicator status="amarelo" label="Atenção" />);
        expect(container.firstChild).toBeInTheDocument();
    });

    it('should render with status vermelho', () => {
        const { container } = render(<SemaforoIndicator status="vermelho" label="Crítico" />);
        expect(container.firstChild).toBeInTheDocument();
    });

    it('should match snapshot', () => {
        const { container } = render(
            <SemaforoIndicator status="amarelo" label="Atenção" detail="CPU em 85%" />
        );
        expect(container).toMatchSnapshot();
    });
});
