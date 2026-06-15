'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTablesDatabase } from '../../lib/hooks/useTablesDatabase';
import { Marca, tablesService, PaginationResult } from '../../lib/services/tablesService';
import { Pagination } from '../Pagination';
import styles from './TablesManagement.module.css';

const formatDate = (dateString: string | Date | undefined) => {
    if (!dateString) return 'N/A';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return 'N/A';
        return date.toLocaleDateString('pt-BR');
    } catch (e) {
        return 'N/A';
    }
};

export function MarcasTable() {
    const { addMarca, updateMarca, deleteMarca } = useTablesDatabase();

    // Estados para paginação
    const [marcas, setMarcas] = useState<Marca[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [hasNextPage, setHasNextPage] = useState(false);
    const itemsPerPage = 50;
    const lastDocRef = useRef<any>(undefined);
    const currentPageRef = useRef(1);

    const [showForm, setShowForm] = useState(false);
    const [editingMarca, setEditingMarca] = useState<Marca | null>(null);
    const [formData, setFormData] = useState({ nome: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');

    const loadMarcas = useCallback(async (page: number = 1) => {
        try {
            setLoading(true);
            setError(null);

            console.log('Carregando marcas - página:', page);

            const result: PaginationResult<Marca> = await tablesService.getMarcasPaginated({
                page,
                itemsPerPage,
                lastDoc: page === currentPageRef.current + 1 ? lastDocRef.current : undefined
            });

            console.log('Marcas paginadas carregadas:', result.data.length, 'total:', result.total);
            setMarcas(result.data);
            setTotalItems(result.total);
            setHasNextPage(result.hasNextPage);
            lastDocRef.current = result.lastDoc;
            currentPageRef.current = page;
            setCurrentPage(page);

        } catch (error) {
            console.error('Erro ao carregar marcas:', error);
            setError(`Erro ao carregar marcas: ${error}`);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            if (editingMarca && editingMarca.id) {
                // Atualizar marca existente
                const success = await updateMarca(editingMarca.id, {
                    nome: formData.nome.toUpperCase()
                });

                if (success) {
                    console.log('Marca atualizada com sucesso!');
                    await loadMarcas(currentPageRef.current); // Recarregar página atual
                } else {
                    alert('Erro ao atualizar marca');
                    return;
                }
            } else {
                // Adicionar nova marca
                const success = await addMarca({
                    nome: formData.nome.toUpperCase()
                });

                if (success) {
                    console.log('Marca adicionada com sucesso!');
                    await loadMarcas(1); // Voltar para primeira página para ver o novo item
                } else {
                    alert('Erro ao adicionar marca');
                    return;
                }
            }

            // Resetar formulário
            closeForm();
        } catch (error) {
            console.error('Erro ao salvar marca:', error);
            alert('Erro ao salvar marca');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (marca: Marca) => {
        setEditingMarca(marca);
        setFormData({ nome: marca.nome });
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm('Tem certeza que deseja excluir esta marca?')) {
            const success = await deleteMarca(id);
            if (success) {
                // Recarregar página atual após exclusão
                await loadMarcas(currentPageRef.current);
            } else {
                alert('Erro ao excluir marca');
            }
        }
    };

    // Funções de paginação com fallback
    const handlePageChange = (page: number) => {
        loadMarcas(page);
    };

    // Carregar marcas na inicialização
    useEffect(() => {
        loadMarcas(1);
    }, [loadMarcas]);



    const closeForm = () => {
        setShowForm(false);
        setEditingMarca(null);
        setFormData({ nome: '' });
    };

    const handleAddClick = () => {
        if (showForm) {
            closeForm();
            return;
        }
        setEditingMarca(null);
        setFormData({ nome: '' });
        setShowForm(true);
    };

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filteredMarcas = normalizedSearch
        ? marcas.filter((marca) => marca.nome.toLowerCase().includes(normalizedSearch))
        : marcas;

    return (
        <div className={styles.container}>
            {error && (
                <div className={styles.errorMessage}>
                    {error}
                </div>
            )}

            <div className={styles.header}>
                <h3>Gerenciar Marcas</h3>
                <div className={styles.headerActions}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Buscar por nome..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <button
                        className={styles.addButton}
                        onClick={handleAddClick}
                    >
                        {showForm ? (editingMarca ? 'Cancelar edição' : 'Cancelar') : '+ Adicionar Marca'}
                    </button>
                </div>
            </div>

            {showForm && (
                <div className={styles.inlineFormWrapper}>
                    <section className={styles.inlineFormPanel}>
                        <div className={styles.inlineFormHeader}>
                            <div>
                                <h4>{editingMarca ? 'Editar Marca' : 'Adicionar Nova Marca'}</h4>
                                <p>{editingMarca ? 'Atualize o nome e salve para manter a lista consistente.' : 'Cadastre novas marcas para facilitar o vínculo com os modelos.'}</p>
                            </div>
                            <button type="button" className={styles.inlineFormClose} onClick={closeForm}>
                                {editingMarca ? 'Cancelar edição' : 'Fechar formulário'}
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className={styles.form}>
                            <div className={styles.formGroup}>
                                <label htmlFor="nome">Nome da Marca*</label>
                                <input
                                    type="text"
                                    id="nome"
                                    value={formData.nome}
                                    onChange={(e) => setFormData({ nome: e.target.value })}
                                    placeholder="Ex: TOYOTA"
                                    required
                                    className={styles.input}
                                />
                            </div>

                            <div className={styles.modalActions}>
                                <button
                                    type="button"
                                    className={styles.cancelButton}
                                    onClick={closeForm}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className={styles.submitButton}
                                    disabled={isSubmitting || loading}
                                >
                                    {(isSubmitting || loading) ? 'Salvando...' : (editingMarca ? 'Atualizar' : 'Adicionar')}
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            )}

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Nome da Marca</th>
                            <th>Criado em</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredMarcas.length === 0 ? (
                            <tr>
                                <td colSpan={3} className={styles.emptyMessage}>Nenhuma marca encontrada.</td>
                            </tr>
                        ) : (
                            filteredMarcas.map(marca => (
                                <tr key={marca.id}>
                                    <td className={styles.marcaName}>{marca.nome}</td>
                                    <td>
                                        {formatDate(marca.createdAt)}
                                    </td>
                                    <td>
                                        <div className={styles.actions}>
                                            <button
                                                className={styles.editButton}
                                                onClick={() => handleEdit(marca)}
                                            >
                                                ✏️ Editar
                                            </button>
                                            <button
                                                className={styles.deleteButton}
                                                onClick={() => marca.id && handleDelete(marca.id)}
                                            >
                                                🗑️ Excluir
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Paginação */}
            <Pagination
                currentPage={currentPage}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                loading={loading}
            />

        </div>
    );
}