"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
    tablesService,
    Cor,
    PaginationResult,
} from "../../lib/services/tablesService";
import { useTablesDatabase } from "../../lib/hooks/useTablesDatabase";
import { Pagination } from "../Pagination";
import styles from "./TablesManagement.module.css";
import { FaEdit, FaTrash } from "react-icons/fa";

const ITEMS_PER_PAGE = 10;

const CoresTable: React.FC = () => {
    const { addCor, updateCor, deleteCor } = useTablesDatabase();
    const [cores, setCores] = useState<Cor[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingCor, setEditingCor] = useState<Cor | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalItems, setTotalItems] = useState(0);
    const pageDocsRef = useRef<Record<number, any>>({});
    const [hasMore, setHasMore] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [formData, setFormData] = useState({ nome: "", hex: "" });
    const [searchTerm, setSearchTerm] = useState("");

    const loadCores = useCallback(
        async (page: number) => {
            setLoading(true);
            setError(null);
            try {
                const result: PaginationResult<Cor> = await tablesService.getCoresPaginated({
                    page,
                    itemsPerPage: ITEMS_PER_PAGE,
                    lastDoc: page > 1 ? pageDocsRef.current[page] : undefined,
                });
                setCores(result.data);
                setTotalItems(result.total);
                setHasMore(result.hasNextPage);
                if (result.hasNextPage) {
                    pageDocsRef.current = {
                        ...pageDocsRef.current,
                        [page + 1]: result.lastDoc,
                    };
                }
                setCurrentPage(page);
            } catch (err) {
                console.error("Erro ao carregar cores:", err);
                setError("Erro ao carregar cores");
            } finally {
                setLoading(false);
            }
        },
        []
    );

    useEffect(() => {
        loadCores(1);
    }, [loadCores]);

    const handlePageChange = (page: number) => {
        loadCores(page);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        try {
            if (editingCor && editingCor.id) {
                await updateCor(editingCor.id, {
                    nome: formData.nome.toUpperCase(),
                    hex: formData.hex,
                });
            } else {
                await addCor({ nome: formData.nome.toUpperCase(), hex: formData.hex });
            }
            closeForm();
            loadCores(editingCor ? currentPage : 1);
        } catch (err) {
            console.error("Erro ao salvar cor:", err);
            setError("Erro ao salvar cor");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (cor: Cor) => {
        setEditingCor(cor);
        setFormData({ nome: cor.nome, hex: cor.hex || "" });
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (window.confirm("Tem certeza que deseja excluir esta cor?")) {
            try {
                await deleteCor(id);
                loadCores(currentPage);
            } catch (err) {
                console.error("Erro ao excluir cor:", err);
                setError("Erro ao excluir cor");
            }
        }
    };

    const closeForm = () => {
        setShowForm(false);
        setEditingCor(null);
        setFormData({ nome: "", hex: "" });
    };

    const handleAddClick = () => {
        if (showForm) {
            closeForm();
            return;
        }
        setEditingCor(null);
        setFormData({ nome: "", hex: "" });
        setShowForm(true);
    };

    const normalizedSearch = searchTerm.trim().toLowerCase();
    const filteredCores = normalizedSearch
        ? cores.filter((cor) => {
            const nomeMatch = cor.nome.toLowerCase().includes(normalizedSearch);
            const hexMatch = (cor.hex || "").toLowerCase().includes(normalizedSearch);
            return nomeMatch || hexMatch;
        })
        : cores;

    return (
        <div className={styles.container}>
            {error && <div className={styles.errorMessage}>{error}</div>}
            <div className={styles.header}>
                <h3>Gerenciar Cores</h3>
                <div className={styles.headerActions}>
                    <input
                        type="text"
                        className={styles.searchInput}
                        placeholder="Buscar por nome ou hex..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <button onClick={handleAddClick} className={styles.addButton}>
                        {showForm ? (editingCor ? "Cancelar edição" : "Cancelar") : "+ Adicionar Cor"}
                    </button>
                </div>
            </div>

            {showForm && (
                <div className={styles.inlineFormWrapper}>
                    <section className={styles.inlineFormPanel}>
                        <div className={styles.inlineFormHeader}>
                            <div>
                                <h4>{editingCor ? "Editar Cor" : "Adicionar Nova Cor"}</h4>
                                <p>{editingCor ? "Atualize o nome ou código hexadecimal desta cor." : "Cadastre cores para padronizar o catálogo e relatórios."}</p>
                            </div>
                            <button type="button" className={styles.inlineFormClose} onClick={closeForm}>
                                {editingCor ? "Cancelar edição" : "Fechar formulário"}
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className={styles.form}>
                            <div className={styles.formGroup}>
                                <label htmlFor="nome">Nome da Cor*</label>
                                <input
                                    id="nome"
                                    type="text"
                                    value={formData.nome}
                                    onChange={(e) =>
                                        setFormData({ ...formData, nome: e.target.value })
                                    }
                                    required
                                    className={styles.input}
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="hex">Código Hexadecimal</label>
                                <div className={styles.colorInputGroup}>
                                    <input
                                        id="hex"
                                        type="text"
                                        value={formData.hex}
                                        onChange={(e) =>
                                            setFormData({ ...formData, hex: e.target.value })
                                        }
                                        placeholder="#FFFFFF"
                                        className={styles.input}
                                    />
                                    <input
                                        type="color"
                                        className={styles.colorPicker}
                                        aria-label="Selecionar cor"
                                        value={formData.hex && /^#([0-9a-fA-F]{6})$/.test(formData.hex)
                                            ? formData.hex
                                            : '#000000'}
                                        onChange={(e) =>
                                            setFormData({ ...formData, hex: e.target.value.toUpperCase() })
                                        }
                                    />
                                </div>
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
                                    disabled={isSubmitting}
                                    className={styles.submitButton}
                                >
                                    {isSubmitting ? "Salvando..." : editingCor ? "Atualizar" : "Adicionar"}
                                </button>
                            </div>
                        </form>
                    </section>
                </div>
            )}

            {loading ? (
                <p>Carregando...</p>
            ) : (
                <>
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Nome</th>
                                    <th>Hex</th>
                                    <th>Amostra</th>
                                    <th>Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCores.length === 0 ? (
                                    <tr>
                                        <td colSpan={4} className={styles.emptyMessage}>Nenhuma cor encontrada.</td>
                                    </tr>
                                ) : (
                                    filteredCores.map((cor) => (
                                        <tr key={cor.id}>
                                            <td>{cor.nome}</td>
                                            <td>{cor.hex}</td>
                                            <td>
                                                <div
                                                    className={styles.colorPreview}
                                                    style={{ backgroundColor: cor.hex || "#000000" }}
                                                    title={cor.hex}
                                                />
                                            </td>
                                            <td>
                                                <button
                                                    onClick={() => handleEdit(cor)}
                                                    className={`${styles.actionButton} ${styles.editAction}`}
                                                    title="Editar cor"
                                                    aria-label={`Editar ${cor.nome}`}
                                                >
                                                    <FaEdit size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(cor.id!)}
                                                    className={`${styles.actionButton} ${styles.deleteAction}`}
                                                    title="Excluir cor"
                                                    aria-label={`Excluir ${cor.nome}`}
                                                >
                                                    <FaTrash size={15} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                    <Pagination
                        currentPage={currentPage}
                        totalItems={totalItems}
                        itemsPerPage={ITEMS_PER_PAGE}
                        onPageChange={handlePageChange}
                        hasNextPage={hasMore}
                    />
                </>
            )}

        </div>
    );
};

export default CoresTable;