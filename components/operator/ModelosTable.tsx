'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTablesDatabase } from '../../lib/hooks/useTablesDatabase';
import { Modelo, tablesService, PaginationResult } from '../../lib/services/tablesService';
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
    }; return (
        <div className={styles.container}>
            {error && (
                <div className={styles.errorMessage}>
                    {error}
                </div>
            )}

            <div className={styles.header}>
                <h3>Gerenciar Modelos</h3>
                <div className={styles.headerActions}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Buscar por modelo ou marca..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <button
                        className={styles.importButton}
                        onClick={() => setShowImportModal(true)}
                    >
                        📂 Importar CSV
                    </button>
                    <button
                        className={styles.addButton}
                        onClick={handleAddClick}
                    >
                        {showForm ? (editingModelo ? 'Cancelar edição' : 'Cancelar') : '+ Adicionar Modelo'}
                    </button>
                </div>
            </div>

            {showForm && (
                <div className={styles.inlineFormWrapper}>
                    <section className={styles.inlineFormPanel}>
                        <div className={styles.inlineFormHeader}>
                            <div>
                                <h4>{editingModelo ? 'Editar Modelo' : 'Adicionar Novo Modelo'}</h4>
                                <p>{editingModelo ? 'Atualize o vínculo com a marca e o nome do modelo.' : 'Cadastre modelos para disponibilizar combinações corretas nas demais telas.'}</p>
                            </div>
                            <button type="button" className={styles.inlineFormClose} onClick={closeForm}>
                                {editingModelo ? 'Cancelar edição' : 'Fechar formulário'}
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className={styles.form}>
                            <div className={styles.formGroup}>
                                <label htmlFor="marca">Marca*</label>
                                <select
                                    id="marca"
                                    value={formData.marca}
                                    onChange={(e) => setFormData({ ...formData, marca: e.target.value })}
                                    required
                                    className={styles.select}
                                >
                                    <option value="">Selecione uma marca</option>
                                    {marcas.map(marca => (
                                        <option key={marca.id} value={marca.nome}>
                                            {marca.nome}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="nome">Nome do Modelo*</label>
                                <input
                                    type="text"
                                    id="nome"
                                    value={formData.nome}
                                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                    placeholder="Ex: COROLLA"
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
                                    {(isSubmitting || loading) ? 'Salvando...' : (editingModelo ? 'Atualizar' : 'Adicionar')}
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
                            <th>Nome do Modelo</th>
                            <th>Marca</th>
                            <th>Criado em</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {modelos.length === 0 ? (
                            <tr>
                                <td colSpan={4} className={styles.emptyMessage}>
                                    {loading ? 'Carregando...' : searchTerm ? 'Nenhum modelo encontrado para esta busca.' : 'Nenhum modelo encontrado.'}
                                </td>
                            </tr>
                        ) : (
                            modelos.map(modelo => (
                                <tr key={modelo.id}>
                                    <td className={styles.modeloName}>{modelo.nome}</td>
                                    <td className={styles.marcaName}>{modelo.marca}</td>
                                    <td>
                                        {formatDate(modelo.createdAt)}
                                    </td>
                                    <td>
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

            {/* Modal de Importação CSV */}
            {showImportModal && (
                <div className={styles.overlay}>
                    <div className={styles.modal}>
                        <div className={styles.modalHeader}>
                            <h3>Importar Modelos do CSV</h3>
                            <button className={styles.closeButton} onClick={() => setShowImportModal(false)}>✕</button>
                        </div>

                        <div className={styles.form}>
                            <div className={styles.importInstructions}>
                                <h4>📋 Formato do arquivo CSV:</h4>
                                <ul>
                                    <li>Primeira linha deve conter os cabeçalhos: <strong>Marca,Modelo</strong></li>
                                    <li>As linhas seguintes devem conter os dados separados por vírgula</li>
                                    <li>Exemplo:</li>
                                </ul>
                                <pre className={styles.csvExample}>
                                    Marca,Modelo{'\n'}TOYOTA,COROLLA{'\n'}FORD,FOCUS{'\n'}HONDA,CIVIC
                                </pre>
                            </div>

                            <div className={styles.formGroup}>
                                <label htmlFor="csvFile">Selecionar arquivo CSV:</label>
                                <input
                                    type="file"
                                    id="csvFile"
                                    accept=".csv"
                                    onChange={handleFileChange}
                                    className={styles.fileInput}
                                />
                            </div>

                            {csvFile && (
                                <div className={styles.fileInfo}>
                                    <strong>Arquivo selecionado:</strong> {csvFile.name}
                                </div>
                            )}

                            {importProgress.isImporting && (
                                <div className={styles.progressContainer}>
                                    <h4>Importando modelos...</h4>
                                    <div className={styles.progressBar}>
                                        <div
                                            className={styles.progressFill}
                                            style={{
                                                width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%`
                                            }}
                                        ></div>
                                    </div>
                                    <p className={styles.progressText}>
                                        {importProgress.current} de {importProgress.total} ({Math.round((importProgress.current / importProgress.total) * 100) || 0}%)
                                    </p>
                                </div>
                            )}

                            {importResults && !importProgress.isImporting && (
                                <div className={styles.importResults}>
                                    <h4>Resultados da Importação:</h4>
                                    <p><strong>Sucessos:</strong> {importResults.success}</p>
                                    {importResults.errors.length > 0 && (
                                        <>
                                            <p><strong>Erros:</strong> {importResults.errors.length}</p>
                                            <details>
                                                <summary>Ver erros</summary>
                                                <ul className={styles.errorList}>
                                                    {importResults.errors.map((error, index) => (
                                                        <li key={index}>Linha {error.line}: {error.reason}</li>
                                                    ))}
                                                </ul>
                                            </details>
                                        </>
                                    )}
                                </div>
                            )}

                            <div className={styles.modalActions}>
                                <button
                                    type="button"
                                    className={styles.cancelButton}
                                    onClick={() => setShowImportModal(false)}
                                >
                                    Fechar
                                </button>
                                <button
                                    type="button"
                                    className={styles.submitButton}
                                    onClick={handleImportCSV}
                                    disabled={!csvFile || loading}
                                >
                                    {loading ? 'Importando...' : 'Importar Dados'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}