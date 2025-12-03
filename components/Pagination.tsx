'use client';

interface PaginationProps {
    currentPage: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    loading?: boolean;
    hasNextPage?: boolean;
}

export function Pagination({
    currentPage,
    totalItems,
    itemsPerPage,
    onPageChange,
    loading = false,
    hasNextPage,
}: PaginationProps) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    const getPageNumbers = () => {
        const delta = 2;
        const range = [];
        const rangeWithDots = [];

        for (let i = Math.max(2, currentPage - delta);
            i <= Math.min(totalPages - 1, currentPage + delta);
            i++) {
            range.push(i);
        }

        if (currentPage - delta > 2) {
            rangeWithDots.push(1, '...');
        } else {
            rangeWithDots.push(1);
        }

        rangeWithDots.push(...range);

        if (currentPage + delta < totalPages - 1) {
            rangeWithDots.push('...', totalPages);
        } else {
            rangeWithDots.push(totalPages);
        }

        return rangeWithDots;
    };

    return (
        <div className="pagination-container">
            <div className="pagination-info">
                <span>
                    Mostrando {startItem} a {endItem} de {totalItems} registros
                </span>
            </div>

            <div className="pagination-controls">
                {/* Botão Anterior */}
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="pagination-button"
                >
                    ← Anterior
                </button>

                {/* Números das páginas */}
                {totalPages > 1 && (
                    <div className="pagination-numbers">
                        {getPageNumbers().map((page, index) => (
                            <button
                                key={index}
                                onClick={() => typeof page === 'number' && onPageChange(page)}
                                disabled={page === '...' || page === currentPage}
                                className={`pagination-number ${page === currentPage ? 'active' : ''
                                    } ${page === '...' ? 'dots' : ''}`}
                            >
                                {page}
                            </button>
                        ))}
                    </div>
                )}

                {/* Botão Próximo */}
                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={hasNextPage === false || currentPage === totalPages}
                    className="pagination-button"
                >
                    Próximo →
                </button>
            </div>

            <style jsx>{`
                .pagination-container {
                    display: flex;
                    flex-direction: column;
                    gap: 1rem;
                    padding: 1rem 0;
                    border-top: 1px solid var(--color-highlight);
                    margin-top: 1rem;
                }

                .pagination-info {
                    color: var(--color-text-muted);
                    font-size: 0.875rem;
                    text-align: center;
                }

                .pagination-controls {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    flex-wrap: wrap;
                }

                .pagination-numbers {
                    display: flex;
                    gap: 0.25rem;
                }

                .pagination-button {
                    padding: 0.5rem 1rem;
                    border: 1px solid var(--color-highlight);
                    background: var(--color-surface);
                    color: var(--color-text);
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    font-size: 0.875rem;
                    font-weight: 500;
                }

                .pagination-button:hover:not(:disabled) {
                    background: var(--color-highlight);
                    border-color: var(--color-text-muted);
                }

                .pagination-button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }

                .pagination-number {
                    width: 2.5rem;
                    height: 2.5rem;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border: 1px solid var(--color-highlight);
                    background: var(--color-surface);
                    color: var(--color-text);
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.15s ease;
                    font-size: 0.875rem;
                    font-weight: 500;
                }

                .pagination-number:hover:not(:disabled):not(.dots) {
                    background: var(--color-highlight);
                    border-color: var(--color-text-muted);
                }

                .pagination-number.active {
                    background: var(--color-accent);
                    color: white;
                    border-color: var(--color-accent);
                }

                .pagination-number.dots {
                    border: none;
                    background: transparent;
                    cursor: default;
                }

                .pagination-number:disabled {
                    cursor: not-allowed;
                }



                @media (max-width: 640px) {
                    .pagination-controls {
                        flex-direction: column;
                        gap: 1rem;
                    }

                    .pagination-numbers {
                        order: -1;
                    }

                    .pagination-button {
                        min-width: 120px;
                    }
                }
            `}</style>
        </div>
    );
}