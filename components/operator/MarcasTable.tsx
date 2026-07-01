'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTablesDatabase } from '../../lib/hooks/useTablesDatabase';
import { Marca, tablesService, PaginationResult } from '../../lib/services/tablesService';
import { Pagination } from '../Pagination';
import styles from './TablesManagement.module.css';
import { GenericDataTable, ColumnDef } from './GenericDataTable';

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

    const columns: ColumnDef<Marca>[] = [
        {
            key: 'nome',
            label: 'Nome da Marca',
            render: (marca) => <span className={styles.marcaName}>{marca.nome}</span>
        },
        {
            key: 'createdAt',
            label: 'Criado em',
            render: (marca) => formatDate(marca.createdAt)
        },
        {
            key: 'acoes',
            label: 'Ações',
            render: (marca) => (
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
            )
        }
    ];

    const formContent = (
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
    );

    return (
        <GenericDataTable<Marca>
            title="Gerenciar Marcas"
            error={error}
            items={filteredMarcas}
            columns={columns}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            showForm={showForm}
            isEditing={!!editingMarca}
            onAddClick={handleAddClick}
            onCloseForm={closeForm}
            formTitleAdd="Adicionar Nova Marca"
            formTitleEdit="Editar Marca"
            formDescriptionAdd="Cadastre novas marcas para facilitar o vínculo com os modelos."
            formDescriptionEdit="Atualize o nome e salve para manter a lista consistente."
            formContent={formContent}
            currentPage={currentPage}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={handlePageChange}
            loading={loading}
            emptyMessage="Nenhuma marca encontrada."
        />
    );
}