'use client';

import { useState, useEffect } from 'react';
import { QueryDocumentSnapshot } from 'firebase/firestore';
import { useTablesDatabase } from '../../lib/hooks/useTablesDatabase';
import { Cor, tablesService, PaginationResult } from '../../lib/services/tablesService';
import { Pagination } from '../Pagination';
import styles from './TablesManagement.module.css';

export function CoresTable() {
    const { addCor, updateCor, deleteCor } = useTablesDatabase();

    // Estados para paginação
    const [cores, setCores] = useState<Cor[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [lastDoc, setLastDoc] = useState<QueryDocumentSnapshot | undefined>();
    const itemsPerPage = 50;

    const [showModal, setShowModal] = useState(false);
    const [editingCor, setEditingCor] = useState<Cor | null>(null);
    const [formData, setFormData] = useState({ nome: '', hex: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Funções de paginação com fallback
    const loadCores = async (page: number = 1) => {
        try {
            setLoading(true);
            setError(null);

            // Tentar primeiro com paginação
            try {
                const result: PaginationResult<Cor> = await tablesService.getCoresPaginated({
                    page,
                    itemsPerPage,
                    lastDoc: page === currentPage + 1 ? lastDoc : undefined
                });

                setCores(result.data);
                setTotalItems(result.total);
                setHasNextPage(result.hasNextPage);
                setLastDoc(result.lastDoc);
                setCurrentPage(page);
            } catch (paginationError) {
                // Fallback: usar método antigo
                console.log('Fallback para método antigo de cores');
                const allCores = await tablesService.getAllCores();
                const startIndex = (page - 1) * itemsPerPage;
                const endIndex = startIndex + itemsPerPage;
                const pageData = allCores.slice(startIndex, endIndex);

                setCores(pageData);
                setTotalItems(allCores.length);
                setHasNextPage(endIndex < allCores.length);
                setCurrentPage(page);
            }
        } catch (error) {
            console.error('Erro ao carregar cores:', error);
            setError('Erro ao carregar cores');
        } finally {
            setLoading(false);
        }
    };

    const handlePageChange = (page: number) => {
        loadCores(page);
    };    // Carregar cores na inicialização
    useEffect(() => {
        loadCores(1);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            if (editingCor && editingCor.id) {
                // Atualizar cor existente
                const success = await updateCor(editingCor.id, {
                    nome: formData.nome.toUpperCase(),
                    hex: formData.hex
                });

                if (success) {
                    console.log('Cor atualizada com sucesso!');
                    await loadCores(currentPage);
                } else {
                    alert('Erro ao atualizar cor');
                    return;
                }
            } else {
                // Adicionar nova cor
                const success = await addCor({
                    nome: formData.nome.toUpperCase(),
                    hex: formData.hex
                });

                if (success) {
                    console.log('Cor adicionada com sucesso!');
                    await loadCores(1);
                } else {
                    alert('Erro ao adicionar cor');
                    return;
                }
            }

            // Resetar formulário
            setFormData({ nome: '', hex: '' });
            setEditingCor(null);
            setShowModal(false);
        } catch (error) {
            console.error('Erro ao salvar cor:', error);
            alert('Erro ao salvar cor');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (cor: Cor) => {
        setEditingCor(cor);
        setFormData({ nome: cor.nome, hex: cor.hex || '' });
        setShowModal(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm('Tem certeza que deseja excluir esta cor?')) {
            const success = await deleteCor(id);
            if (success) {
                await loadCores(currentPage);
            } else {
                alert('Erro ao excluir cor');
            }
        }
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingCor(null);
        setFormData({ nome: '', hex: '' });
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h3>Gerenciar Cores</h3>
                <button
                    className={styles.addButton}
                    onClick={() => setShowModal(true)}
                >
                    + Adicionar Cor
                </button>
            </div>

            <div className={styles.tableContainer}>
                <table className={styles.table}>
                    <thead>
                        <tr>
                            <th>Cor</th>
                            <th>Nome da Cor</th>
                            <th>Código Hex</th>
                            <th>Criado em</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {cores.length === 0 ? (
                            <tr>
                                <td colSpan={5} className={styles.emptyMessage}>
                                    Nenhuma cor cadastrada. Clique em "+ Adicionar Cor" para começar.
                                </td>
                            </tr>
                        ) : (
                            cores.map(cor => (
                                <tr key={cor.id}>
                                    <td>
                                        <div
                                            className={styles.colorPreview}
                                            style={{ backgroundColor: cor.hex || '#cccccc' }}
                                            title={cor.hex}
                                        ></div>
                                    </td>
                                    <td className={styles.corName}>{cor.nome}</td>
                                    <td className={styles.hexCode}>{cor.hex}</td>
                                    <td>{cor.criadoEm instanceof Date ? cor.criadoEm.toLocaleDateString('pt-BR') : cor.criadoEm?.toString()}</td>
                                    <td>
                                        <div className={styles.actions}>
                                            <button
                                                className={styles.editButton}
                                                onClick={() => handleEdit(cor)}
                                            >
                                                ✏️ Editar
                                            </button>
                                            <button
                                                className={styles.deleteButton}
                                                onClick={() => cor.id && handleDelete(cor.id)}
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

            {/* Modal de Cadastro/Edição */}
            {showModal && (
                <div className={styles.overlay}>
                    <div className={styles.modal}>
                        <div className={styles.modalHeader}>
                            <h3>{editingCor ? 'Editar Cor' : 'Adicionar Nova Cor'}</h3>
                            <button className={styles.closeButton} onClick={closeModal}>✕</button>
                        </div>

                        <form onSubmit={handleSubmit} className={styles.form}>
                            <div className={styles.formGroup}>
                                <label htmlFor="nome">Nome da Cor*</label>
                                <input
                                    type="text"
                                    id="nome"
                                    value={formData.nome}
                                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                    placeholder="Ex: BRANCO POLAR"
                                    required
                                    className={styles.input}
                                />
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="hex">Código da Cor (Opcional)</label>
                                <div className={styles.colorInputGroup}>
                                    <input
                                        type="color"
                                        id="colorPicker"
                                        value={formData.hex || '#ffffff'}
                                        onChange={(e) => setFormData({ ...formData, hex: e.target.value })}
                                        className={styles.colorPicker}
                                    />
                                    <input
                                        type="text"
                                        id="hex"
                                        value={formData.hex}
                                        onChange={(e) => setFormData({ ...formData, hex: e.target.value })}
                                        placeholder="#ffffff"
                                        className={styles.input}
                                        pattern="^#[0-9A-Fa-f]{6}$"
                                        title="Digite um código hexadecimal válido (ex: #ffffff)"
                                    />
                                </div>
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
                                    {(isSubmitting || loading) ? 'Salvando...' : (editingCor ? 'Atualizar' : 'Adicionar')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}