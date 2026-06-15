import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Logo } from '@/components/Logo';

describe('Logo Component', () => {
    it('should render the logo image', () => {
        render(<Logo />);
        const img = screen.getByAltText('Logomarca CNV');
        expect(img).toBeInTheDocument();
    });

    it('should have correct src', () => {
        render(<Logo />);
        const img = screen.getByAltText('Logomarca CNV');
        expect(img).toHaveAttribute('src', '/images/logo.png');
    });

    it('should have proper dimensions', () => {
        render(<Logo />);
        const img = screen.getByAltText('Logomarca CNV');
        expect(img).toHaveAttribute('width', '240');
        expect(img).toHaveAttribute('height', '80');
    });

    it('should match snapshot', () => {
        const { container } = render(<Logo />);
        expect(container).toMatchSnapshot();
    });
});
