'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTablesDatabase } from '../../lib/hooks/useTablesDatabase';
import { Modelo, tablesService, PaginationResult } from '../../lib/services/tablesService';
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

export function ModelosTable() {
    const { marcas, addModelo, updateModelo, deleteModelo, importModelosFromCSV } = useTablesDatabase();

    // Estados para paginação
    const [modelos, setModelos] = useState<Modelo[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const [hasNextPage, setHasNextPage] = useState(false);
    const itemsPerPage = 50;
    const lastDocRef = useRef<any>(undefined);
    const currentPageRef = useRef(1);

    const [showForm, setShowForm] = useState(false);
    const [editingModelo, setEditingModelo] = useState<Modelo | null>(null);
    const [formData, setFormData] = useState({ nome: '', marca: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [importResults, setImportResults] = useState<{ success: number; headers?: string[]; errors: Array<{ line: number; reason: string; raw?: string; columns?: string[] }> } | null>(null);
    const [importProgress, setImportProgress] = useState<{ current: number; total: number; isImporting: boolean }>({
        current: 0,
        total: 0,
        isImporting: false
    });
    const [searchTerm, setSearchTerm] = useState('');

    const loadModelos = useCallback(async (page: number = 1, search: string = '') => {
        try {
            setLoading(true);
            setError(null);

            // Montar URL com parâmetros de busca
            const params = new URLSearchParams({
                page: page.toString(),
                limit: itemsPerPage.toString()
            });
            
            if (search.trim()) {
                params.append('search', search.trim());
            }

            const response = await fetch(`/api/tables/modelos?${params.toString()}`);
            if (!response.ok) throw new Error('Failed to fetch modelos');
            
            const result = await response.json();

            setModelos(result.data || []);
            setTotalItems(result.total || 0);
            setHasNextPage(result.hasNextPage || false);
            currentPageRef.current = page;
            setCurrentPage(page);

        } catch (error) {
            console.error('Erro ao carregar modelos:', error);
            setError('Erro ao carregar modelos');
        } finally {
            setLoading(false);
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            if (editingModelo && editingModelo.id) {
                // Atualizar modelo existente
                const success = await updateModelo(editingModelo.id, {
                    nome: formData.nome.toUpperCase(),
                    marca: formData.marca
                });

                if (success) {
                    console.log('Modelo atualizado com sucesso!');
                    await loadModelos(currentPageRef.current);
                } else {
                    alert('Erro ao atualizar modelo');
                    return;
                }
            } else {
                // Adicionar novo modelo
                const success = await addModelo({
                    nome: formData.nome.toUpperCase(),
                    marca: formData.marca
                });

                if (success) {
                    console.log('Modelo adicionado com sucesso!');
                    await loadModelos(1);
                } else {
                    alert('Erro ao adicionar modelo');
                    return;
                }
            }

            // Resetar formulário
            closeForm();
        } catch (error) {
            console.error('Erro ao salvar modelo:', error);
            alert('Erro ao salvar modelo');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (modelo: Modelo) => {
        setEditingModelo(modelo);
        setFormData({ nome: modelo.nome, marca: modelo.marca });
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (confirm('Tem certeza que deseja excluir este modelo?')) {
            const success = await deleteModelo(id);
            if (success) {
                await loadModelos(currentPageRef.current);
            } else {
                alert('Erro ao excluir modelo');
            }
        }
    };

    // Funções de paginação com fallback
    const handlePageChange = (page: number) => {
        loadModelos(page, searchTerm);
    };

    // Carregar modelos na inicialização
    useEffect(() => {
        loadModelos(1, searchTerm);
    }, [loadModelos, searchTerm]);

    // Debounce da busca
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            if (currentPage !== 1) {
                setCurrentPage(1);
            }
            loadModelos(1, searchTerm);
        }, 300);

        return () => clearTimeout(timeoutId);
    }, [searchTerm]);

    const closeForm = () => {
        setShowForm(false);
        setEditingModelo(null);
        setFormData({ nome: '', marca: '' });
    };

    const handleAddClick = () => {
        if (showForm) {
            closeForm();
            return;
        }
        setEditingModelo(null);
        setFormData({ nome: '', marca: '' });
        setShowForm(true);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type === 'text/csv') {
            setCsvFile(file);
        } else {
            alert('Por favor, selecione um arquivo CSV válido.');
        }
    };

    const handleImportCSV = async () => {
        if (!csvFile) {
            alert('Selecione um arquivo CSV primeiro.');
            return;
        }

        try {
            const text = await csvFile.text();
            const lines = text.split('\n').filter(line => line.trim()).length - 1;

            setImportProgress({ current: 0, total: lines, isImporting: true });

            const results = await importModelosFromCSV(text, (current, total) => {
                setImportProgress({ current, total, isImporting: true });
            });

            setImportResults(results);
            setImportProgress({ current: 0, total: 0, isImporting: false });

            if (results.success > 0) {
                alert(`Importação concluída! ${results.success} modelos importados com sucesso.`);
                if (results.errors.length > 0) {
                    console.warn('Erros durante a importação:', results.errors);
                }
            } else {
                alert('Nenhum modelo foi importado. Verifique o formato do arquivo.');
            }
        } catch (error) {
            console.error('Erro na importação:', error);
            alert('Erro ao processar o arquivo CSV.');
            setImportProgress({ current: 0, total: 0, isImporting: false });
        }
    };

    const columns: ColumnDef<Modelo>[] = [
        {
            key: 'nome',
            label: 'Nome do Modelo',
            render: (modelo) => <span className={styles.marcaName}>{modelo.nome}</span>
        },
        {
            key: 'marca',
            label: 'Marca',
            render: (modelo) => modelo.marca
        },
        {
            key: 'createdAt',
            label: 'Criado em',
            render: (modelo) => formatDate(modelo.createdAt)
        },
        {
            key: 'acoes',
            label: 'Ações',
            render: (modelo) => (
                <div className={styles.actions}>
                    <button
                        className={styles.editButton}
                        onClick={() => handleEdit(modelo)}
                    >
                        ✏️ Editar
                    </button>
                    <button
                        className={styles.deleteButton}
                        onClick={() => modelo.id && handleDelete(modelo.id)}
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
                <label htmlFor="nome">Nome do Modelo*</label>
                <input
                    type="text"
                    id="nome"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    placeholder="Ex: COROLLA XEI 2.0"
                    required
                    className={styles.input}
                />
            </div>

            <div className={styles.formGroup}>
                <label htmlFor="marca">Marca vinculada*</label>
                <select
                    id="marca"
                    value={formData.marca}
                    onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                    required
                    className={styles.input}
                >
                    <option value="">Selecione uma marca</option>
                    {marcas.map(marca => (
                        <option key={marca.id} value={marca.nome}>
                            {marca.nome}
                        </option>
                    ))}
                </select>
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
                    {(isSubmitting || loading) ? 'Salvando...' : (editingModelo ? 'Atualizar' : 'Adicionar')}
                </button>
            </div>
        </form>
    );

    const customActions = (
        <button
            className={styles.importButton}
            onClick={() => setShowImportModal(true)}
            title="Importar modelos via CSV"
        >
            📥 Importar CSV
        </button>
    );

    return (
        <>
            <GenericDataTable<Modelo>
                title="Gerenciar Modelos"
                error={error}
                items={modelos}
                columns={columns}
                searchTerm={searchTerm}
                onSearchChange={(term) => {
                    setSearchTerm(term);
                    loadModelos(1, term);
                }}
                showForm={showForm}
                isEditing={!!editingModelo}
                onAddClick={handleAddClick}
                onCloseForm={closeForm}
                formTitleAdd="Adicionar Novo Modelo"
                formTitleEdit="Editar Modelo"
                formDescriptionAdd="Cadastre os modelos completos (ex: COROLLA XEI 2.0) e vincule à marca correspondente."
                formDescriptionEdit="Atualize o nome ou a marca deste modelo."
                formContent={formContent}
                currentPage={currentPage}
                totalItems={totalItems}
                itemsPerPage={itemsPerPage}
                onPageChange={handlePageChange}
                loading={loading}
                emptyMessage="Nenhum modelo encontrado."
                customActions={customActions}
            />

            {/* Modal de Importação */}
            {showImportModal && (
                <div className={styles.modalOverlay}>
                    <div className={styles.importModal}>
                        <div className={styles.modalHeader}>
                            <h3>Importar Modelos via CSV</h3>
                            <button className={styles.closeButton} onClick={() => setShowImportModal(false)}>×</button>
                        </div>
                        
                        <div className={styles.modalContent}>
                            <p className={styles.importInstructions}>
                                O arquivo CSV deve conter duas colunas (com ou sem cabeçalho):<br/>
                                <strong>Coluna 1:</strong> Marca<br/>
                                <strong>Coluna 2:</strong> Modelo
                            </p>
                            
                            <div className={styles.fileUploadArea}>
                                <input 
                                    type="file" 
                                    accept=".csv" 
                                    id="csvFile"
                                    className={styles.fileInput}
                                    onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                                    disabled={importProgress.isImporting}
                                />
                                <label htmlFor="csvFile" className={styles.fileLabel}>
                                    {csvFile ? csvFile.name : 'Clique para selecionar o arquivo CSV'}
                                </label>
                            </div>

                            {importProgress.isImporting && (
                                <div className={styles.progressContainer}>
                                    <div className={styles.progressInfo}>
                                        <span>Importando dados...</span>
                                        <span>{importProgress.current} / {importProgress.total}</span>
                                    </div>
                                    <div className={styles.progressBar}>
                                        <div 
                                            className={styles.progressFill} 
                                            style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {importResults && (
                                <div className={styles.importResults}>
                                    <div className={styles.successMessage}>
                                        ✅ {importResults.success} modelos importados com sucesso
                                    </div>
                                    
                                    {importResults.errors && importResults.errors.length > 0 && (
                                        <div className={styles.errorsContainer}>
                                            <h4>Erros encontrados ({importResults.errors.length}):</h4>
                                            <ul className={styles.errorsList}>
                                                {importResults.errors.map((err, idx) => (
                                                    <li key={idx}>
                                                        <strong>Linha {err.line}:</strong> {err.reason}
                                                        {err.raw && <div className={styles.rawLine}>Original: {err.raw}</div>}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className={styles.modalFooter}>
                            <button 
                                className={styles.cancelButton} 
                                onClick={() => setShowImportModal(false)}
                                disabled={importProgress.isImporting}
                            >
                                Fechar
                            </button>
                            <button 
                                className={styles.submitButton}
                                onClick={handleImportCSV}
                                disabled={!csvFile || importProgress.isImporting}
                            >
                                {importProgress.isImporting ? 'Importando...' : 'Iniciar Importação'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}