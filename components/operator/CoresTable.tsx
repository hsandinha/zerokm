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
import { GenericDataTable, ColumnDef } from "./GenericDataTable";

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

    const columns: ColumnDef<Cor>[] = [
        {
            key: "nome",
            label: "Nome da Cor",
            render: (cor) => (
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <div
                        style={{
                            width: "20px",
                            height: "20px",
                            borderRadius: "50%",
                            backgroundColor: cor.hex || "#cccccc",
                            border: "1px solid #ddd",
                        }}
                    />
                    <span className={styles.marcaName}>{cor.nome}</span>
                </div>
            )
        },
        {
            key: "acoes",
            label: "Ações",
            render: (cor) => (
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
            )
        }
    ];

    const formContent = (
        <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formGroup}>
                <label htmlFor="nome">Nome da Cor*</label>
                <input
                    type="text"
                    id="nome"
                    value={formData.nome}
                    onChange={(e) =>
                        setFormData({ ...formData, nome: e.target.value })
                    }
                    placeholder="Ex: BRANCO LUNAR"
                    required
                    className={styles.input}
                />
            </div>

            <div className={styles.formGroup}>
                <label htmlFor="hex">Cor HEX (Opcional)</label>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <input
                        type="color"
                        id="hex-color"
                        value={formData.hex || "#ffffff"}
                        onChange={(e) =>
                            setFormData({ ...formData, hex: e.target.value })
                        }
                        className={styles.colorPicker}
                        style={{ width: "40px", height: "40px", padding: 0, border: "1px solid #ccc", borderRadius: "4px" }}
                    />
                    <input
                        type="text"
                        id="hex"
                        value={formData.hex}
                        onChange={(e) =>
                            setFormData({ ...formData, hex: e.target.value })
                        }
                        placeholder="#FFFFFF"
                        className={styles.input}
                        style={{ flex: 1 }}
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
                    className={styles.submitButton}
                    disabled={isSubmitting || loading}
                >
                    {isSubmitting || loading
                        ? "Salvando..."
                        : editingCor
                        ? "Atualizar"
                        : "Adicionar"}
                </button>
            </div>
        </form>
    );

    return (
        <GenericDataTable<Cor>
            title="Gerenciar Cores"
            error={error}
            items={filteredCores}
            columns={columns}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            showForm={showForm}
            isEditing={!!editingCor}
            onAddClick={handleAddClick}
            onCloseForm={closeForm}
            formTitleAdd="Adicionar Nova Cor"
            formTitleEdit="Editar Cor"
            formDescriptionAdd="Cadastre novas cores com seus respectivos códigos HEX."
            formDescriptionEdit="Atualize o nome ou o código HEX da cor."
            formContent={formContent}
            currentPage={currentPage}
            totalItems={totalItems}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={handlePageChange}
            loading={loading}
            emptyMessage="Nenhuma cor encontrada."
        />
    );
};

export default CoresTable;