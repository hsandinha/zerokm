"use client";

import React, { useState, useEffect, useCallback } from "react";
import { QueryDocumentSnapshot } from "firebase/firestore";
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
    const [pageDocs, setPageDocs] = useState<{
        [page: number]: QueryDocumentSnapshot | undefined;
    }>({});
    const [hasMore, setHasMore] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState({ nome: "", hex: "" });

    const loadCores = useCallback(
        async (page: number) => {
            setLoading(true);
            setError(null);
            try {
                const result: PaginationResult<Cor> = await tablesService.getCoresPaginated({
                    page,
                    itemsPerPage: ITEMS_PER_PAGE,
                    lastDoc: page > 1 ? pageDocs[page] : undefined,
                });
                setCores(result.data);
                setTotalItems(result.total);
                setHasMore(result.hasNextPage);
                if (result.hasNextPage) {
                    setPageDocs((prev) => ({ ...prev, [page + 1]: result.lastDoc }));
                }
                setCurrentPage(page);
            } catch (err) {
                console.error("Erro ao carregar cores:", err);
                setError("Erro ao carregar cores");
            } finally {
                setLoading(false);
            }
        },
        [pageDocs]
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
            closeModal();
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
        setShowModal(true);
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

    const closeModal = () => {
        setShowModal(false);
        setEditingCor(null);
        setFormData({ nome: "", hex: "" });
    };

    return (
        <div className={styles.container}>
            {error && <div className={styles.errorMessage}>{error}</div>}
            <div className={styles.header}>
                <h3>Gerenciar Cores</h3>
                <button onClick={() => setShowModal(true)} className={styles.addButton}>
                    Adicionar Cor
                </button>
            </div>

            {loading ? (
                <p>Carregando...</p>
            ) : (
                <>
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
                            {cores.map((cor) => (
                                <tr key={cor.id}>
                                    <td>{cor.nome}</td>
                                    <td>{cor.hex}</td>
                                    <td>
                                        <div
                                            style={{
                                                width: "20px",
                                                height: "20px",
                                                backgroundColor: cor.hex,
                                                border: "1px solid #ccc",
                                                borderRadius: "4px",
                                            }}
                                        />
                                    </td>
                                    <td>
                                        <button
                                            onClick={() => handleEdit(cor)}
                                            className={styles.actionButton}
                                        >
                                            <FaEdit />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(cor.id!)}
                                            className={styles.actionButton}
                                        >
                                            <FaTrash />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <Pagination
                        currentPage={currentPage}
                        totalItems={totalItems}
                        itemsPerPage={ITEMS_PER_PAGE}
                        onPageChange={handlePageChange}
                        hasNextPage={hasMore}
                    />
                </>
            )}

            {showModal && (
                <div className={styles.modal}>
                    <div className={styles.modalContent}>
                        <span className={styles.closeButton} onClick={closeModal}>
                            &times;
                        </span>
                        <h2>{editingCor ? "Editar Cor" : "Adicionar Nova Cor"}</h2>
                        <form onSubmit={handleSubmit} className={styles.form}>
                            <div className={styles.formGroup}>
                                <label htmlFor="nome">Nome da Cor</label>
                                <input
                                    id="nome"
                                    type="text"
                                    value={formData.nome}
                                    onChange={(e) =>
                                        setFormData({ ...formData, nome: e.target.value })
                                    }
                                    required
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="hex">Código Hexadecimal</label>
                                <input
                                    id="hex"
                                    type="text"
                                    value={formData.hex}
                                    onChange={(e) =>
                                        setFormData({ ...formData, hex: e.target.value })
                                    }
                                    placeholder="#FFFFFF"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className={styles.submitButton}
                            >
                                {isSubmitting ? "Salvando..." : "Salvar"}
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CoresTable;