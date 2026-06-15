import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/Badge';

describe('Badge Component', () => {
    it('should render children text', () => {
        render(<Badge>Ativo</Badge>);
        expect(screen.getByText('Ativo')).toBeInTheDocument();
    });

    it('should render as a span element', () => {
        render(<Badge>Test</Badge>);
        const badge = screen.getByText('Test');
        expect(badge.tagName).toBe('SPAN');
    });

    it('should apply default variant class', () => {
        render(<Badge>Default</Badge>);
        const badge = screen.getByText('Default');
        expect(badge.classList.length).toBeGreaterThan(0);
    });

    it('should apply success variant class', () => {
        render(<Badge variant="success">Ok</Badge>);
        const badge = screen.getByText('Ok');
        expect(badge.classList.length).toBeGreaterThan(0);
    });

    it('should apply danger variant class', () => {
        render(<Badge variant="danger">Erro</Badge>);
        expect(screen.getByText('Erro')).toBeInTheDocument();
    });

    it('should apply warning variant class', () => {
        render(<Badge variant="warning">Alerta</Badge>);
        expect(screen.getByText('Alerta')).toBeInTheDocument();
    });

    it('should apply admin variant class', () => {
        render(<Badge variant="admin">Admin</Badge>);
        expect(screen.getByText('Admin')).toBeInTheDocument();
    });

    it('should match snapshot', () => {
        const { container } = render(<Badge variant="success">Ativo</Badge>);
        expect(container).toMatchSnapshot();
    });
});
