import React from 'react';
import styles from './TablesManagement.module.css';
import { Pagination } from '../Pagination';

export interface ColumnDef<T> {
    key: string;
    label: string;
    render: (item: T) => React.ReactNode;
}

interface GenericDataTableProps<T> {
    title: string;
    error: string | null;
    items: T[];
    columns: ColumnDef<T>[];
    
    // Search
    searchTerm: string;
    onSearchChange: (term: string) => void;
    
    // Form / Modal
    showForm: boolean;
    isEditing: boolean;
    onAddClick: () => void;
    onCloseForm: () => void;
    formTitleAdd: string;
    formTitleEdit: string;
    formDescriptionAdd: string;
    formDescriptionEdit: string;
    formContent: React.ReactNode;
    
    // Pagination
    currentPage: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    loading: boolean;
    
    // Custom Actions
    customActions?: React.ReactNode;
    emptyMessage?: string;
}

export function GenericDataTable<T>({
    title,
    error,
    items,
    columns,
    searchTerm,
    onSearchChange,
    showForm,
    isEditing,
    onAddClick,
    onCloseForm,
    formTitleAdd,
    formTitleEdit,
    formDescriptionAdd,
    formDescriptionEdit,
    formContent,
    currentPage,
    totalItems,
    itemsPerPage,
    onPageChange,
    loading,
    customActions,
    emptyMessage = "Nenhum registro encontrado."
}: GenericDataTableProps<T>) {
    return (
        <div className={styles.container}>
            {error && (
                <div className={styles.errorMessage}>
                    {error}
                </div>
            )}

            <div className={styles.header}>
                <h3>{title}</h3>
                <div className={styles.headerActions}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Buscar..."
                        value={searchTerm}
                        onChange={(e) => onSearchChange(e.target.value)}
                    />
                    {customActions}
                    <button
                        className={styles.addButton}
                        onClick={onAddClick}
                    >
                        {showForm ? (isEditing ? 'Cancelar edição' : 'Cancelar') : '+ Adicionar'}
                    </button>
                </div>
            </div>

            {showForm && (
                <div className={styles.inlineFormWrapper}>
                    <section className={styles.inlineFormPanel}>
                        <div className={styles.inlineFormHeader}>
                            <div>
                                <h4>{isEditing ? formTitleEdit : formTitleAdd}</h4>
                                <p>{isEditing ? formDescriptionEdit : formDescriptionAdd}</p>
                            </div>
                            <button type="button" className={styles.inlineFormClose} onClick={onCloseForm}>
                                {isEditing ? 'Cancelar edição' : 'Fechar formulário'}
                            </button>
                        </div>
                        {formContent}
                    </section>
                </div>
            )}

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            {columns.map((col) => (
                                <th key={col.key}>{col.label}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {items.length === 0 ? (
                            <tr>
                                <td colSpan={columns.length} className={styles.emptyMessage}>
                                    {emptyMessage}
                                </td>
                            </tr>
                        ) : (
                            items.map((item, index) => (
                                <tr key={index}>
                                    {columns.map((col) => (
                                        <td key={col.key}>
                                            {col.render(item)}
                                        </td>
                                    ))}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            <Pagination
                currentPage={currentPage}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={onPageChange}
                loading={loading}
            />
        </div>
    );
}
