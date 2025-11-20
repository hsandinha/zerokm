'use client';

import { useState, useEffect, useCallback } from 'react';
import { QueryDocumentSnapshot } from 'firebase/firestore';
import { useTablesDatabase } from '../../lib/hooks/useTablesDatabase';
import { Marca, tablesService, PaginationResult } from '../../lib/services/tablesService';
import { Pagination } from '../Pagination';
import styles from './TablesManagement.module.css';

export function MarcasTable() {
    const { addMarca, updateMarca, deleteMarca } = useTablesDatabase();

    // Estados para paginação
    const [marcas, setMarcas] = useState<Marca[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | undefined>();
    const itemsPerPage = 50;
    const [useFallback, setUseFallback] = useState(false);

    const [showModal, setShowModal] = useState(false);
    const [editingMarca, setEditingMarca] = useState<Marca | null>(null);
    const [formData, setFormData] = useState({ nome: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const loadMarcas = useCallback(async (page: number = 1) => {
        try {
            setLoading(true);
            setError(null);

            console.log('Carregando marcas - página:', page);

            if (useFallback) {
                // Usar método antigo sempre
                console.log('Usando método antigo (fallback ativo)');
                const allMarcas = await tablesService.getAllMarcas();
                const startIndex = (page - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                const pageData = allMarcas.slice(startIndex, endIndex);

                console.log('Marcas carregadas:', pageData.length, 'total:', allMarcas.length);
                setMarcas(pageData);
                setTotalItems(allMarcas.length);
                setHasNextPage(endIndex < allMarcas.length);
                setCurrentPage(page);
            } else {
                // Tentar primeiro com paginação
                try {
                    console.log('Tentando carregar marcas com paginação...');
                    const result: PaginationResult<Marca> = await tablesService.getMarcasPaginated({
                        page,
                        itemsPerPage,
                        lastDoc: page === currentPage + 1 ? lastDoc : undefined
                    });

                    console.log('Marcas paginadas carregadas:', result.data.length, 'total:', result.total);
                    setMarcas(result.data);
                    setTotalItems(result.total);
                    setHasNextPage(result.hasNextPage);
                    setLastDoc(result.lastDoc);
                    setCurrentPage(page);
                } catch (paginationError) {
                    // Fallback: usar método antigo
                    console.log('Erro na paginação, ativando fallback:', paginationError);
                    setUseFallback(true);

                    const allMarcas = await tablesService.getAllMarcas();
                    const startIndex = (page - 1) * itemsPerPage;
                    const endIndex = startIndex + itemsPerPage;
                    const pageData = allMarcas.slice(startIndex, endIndex);

                    console.log('Marcas fallback carregadas:', pageData.length, 'total:', allMarcas.length);
                    setMarcas(pageData);
                    setTotalItems(allMarcas.length);
                    setHasNextPage(endIndex < allMarcas.length);
                    setCurrentPage(page);
                }
            }
        } catch (error) {
            console.error('Erro ao carregar marcas:', error);
            setError(`Erro ao carregar marcas: ${error}`);
        } finally {
            setLoading(false);
        }
    }, [currentPage, lastDoc, useFallback]);

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
                    await loadMarcas(currentPage); // Recarregar página atual
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
            setFormData({ nome: '' });
            setEditingMarca(null);
            setShowModal(false);
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
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm('Tem certeza que deseja excluir esta marca?')) {
            const success = await deleteMarca(id);
            if (success) {
                // Recarregar página atual após exclusão
                await loadMarcas(currentPage);
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



    const closeModal = () => {
        setShowModal(false);
        setEditingMarca(null);
        setFormData({ nome: '' });
    };

    return (
        <div className={styles.container}>
            {error && (
                <div className={styles.errorMessage}>
                    {error}
                </div>
            )}

            <div className={styles.header}>
                <h3>Gerenciar Marcas</h3>
                <button
                    className={styles.addButton}
                    onClick={() => setShowModal(true)}
                >
                    + Adicionar Marca
                </button>
            </div>            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Nome da Marca</th>
                            <th>Criado em</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {marcas.map(marca => (
                            <tr key={marca.id}>
                                <td className={styles.marcaName}>{marca.nome}</td>
                                <td>
                                    {marca.criadoEm ?
                                        (marca.criadoEm as any).toDate ?
                                            (marca.criadoEm as any).toDate().toLocaleDateString('pt-BR') :
                                            new Date(marca.criadoEm as any).toLocaleDateString('pt-BR')
                                        : 'N/A'
                                    }
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
                        ))}
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

            {/* Modal de Cadastro/Edição */}
            {showModal && (
                <div className={styles.overlay}>
                    <div className={styles.modal}>
                        <div className={styles.modalHeader}>
                            <h3>{editingMarca ? 'Editar Marca' : 'Adicionar Nova Marca'}</h3>
                            <button className={styles.closeButton} onClick={closeModal}>✕</button>
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
                                    onClick={closeModal}
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
                    </div>
                </div>
            )}
        </div>
    );
}