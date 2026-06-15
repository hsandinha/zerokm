import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SummaryCard } from '@/components/SummaryCard';

describe('SummaryCard Component', () => {
    it('should render title and value', () => {
        render(<SummaryCard title="Veículos Totais" value="1.234" />);
        expect(screen.getByText('Veículos Totais')).toBeInTheDocument();
        expect(screen.getByText('1.234')).toBeInTheDocument();
    });

    it('should render subtitle when provided', () => {
        render(<SummaryCard title="Test" value="10" subtitle="Últimos 30 dias" />);
        expect(screen.getByText('Últimos 30 dias')).toBeInTheDocument();
    });

    it('should not render subtitle when not provided', () => {
        render(<SummaryCard title="Test" value="10" />);
        const subtitles = screen.queryByText('Últimos 30 dias');
        expect(subtitles).not.toBeInTheDocument();
    });

    it('should render change text when provided', () => {
        render(<SummaryCard title="Test" value="10" change="+15%" trend="up" />);
        expect(screen.getByText('+15%')).toBeInTheDocument();
    });

    it('should render icon when provided', () => {
        render(<SummaryCard title="Test" value="10" icon="🚗" />);
        expect(screen.getByText('🚗')).toBeInTheDocument();
    });

    it('should not render change when not provided', () => {
        const { container } = render(<SummaryCard title="Test" value="10" />);
        // Should have no change div
        expect(container.querySelector('[class*="change"]')).toBeNull();
    });

    it('should render value as strong element', () => {
        render(<SummaryCard title="Test" value="999" />);
        const value = screen.getByText('999');
        expect(value.tagName).toBe('STRONG');
    });

    it('should render as article element', () => {
        render(<SummaryCard title="Test" value="10" />);
        const article = screen.getByRole('article');
        expect(article).toBeInTheDocument();
    });

    it('should match snapshot with all props', () => {
        const { container } = render(
            <SummaryCard 
                title="Veículos" 
                value="1.234" 
                subtitle="No estoque" 
                accent="success" 
                change="+12%" 
                trend="up" 
                icon="🚗" 
            />
        );
        expect(container).toMatchSnapshot();
    });
});
