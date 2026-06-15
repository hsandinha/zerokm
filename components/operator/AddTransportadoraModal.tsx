'use client';

import { useState, useEffect } from 'react';
import { Transportadora, TransportadoraService } from '../../lib/services/transportadoraService';
import { AutocompleteInput } from './AutocompleteInput';
import { CurrencyInput } from './CurrencyInput';
import { getEstados } from '../../lib/data/estadosCidades';
import styles from './AddVehicleModal.module.css';

interface AddTransportadoraModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTransportadoraAdded: () => void;
    editingTransportadora?: Transportadora | null;
    isEditing?: boolean;
}

export function AddTransportadoraModal({
    isOpen,
    onClose,
    onTransportadoraAdded,
    editingTransportadora,
    isEditing = false
}: AddTransportadoraModalProps) {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [estados] = useState<string[]>(getEstados());
    const [formData, setFormData] = useState<Omit<Transportadora, 'id'>>({
        estado: '',
        valor: 0,
        observacao: '',
        ativo: true
    });

    // Preencher dados quando estiver editando
    useEffect(() => {
        if (isEditing && editingTransportadora && isOpen) {
            setFormData({
                estado: editingTransportadora.estado || '',
                valor: editingTransportadora.valor || 0,
                observacao: editingTransportadora.observacao || '',
                ativo: editingTransportadora.ativo !== undefined ? editingTransportadora.ativo : true
            });
        } else if (!isEditing && isOpen) {
            // Reset form when not editing
            setFormData({
                estado: '',
                valor: 0,
                observacao: '',
                ativo: true
            });
        }
    }, [isEditing, editingTransportadora, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            if (isEditing && editingTransportadora?.id) {
                await TransportadoraService.updateTransportadora(editingTransportadora.id, formData);
            } else {
                await TransportadoraService.addTransportadora(formData);
            }
            onTransportadoraAdded();
            onClose();
        } catch (error) {
            console.error('Erro ao salvar transportadora:', error);
            alert('Erro ao salvar transportadora. Verifique os dados e tente novamente.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h2>{isEditing ? 'Editar Frete' : 'Adicionar Frete'}</h2>
                    <button onClick={onClose} className={styles.closeButton}>&times;</button>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label>Estado</label>
                            <AutocompleteInput
                                options={estados}
                                value={formData.estado}
                                onChange={(value) => setFormData({ ...formData, estado: value })}
                                placeholder="Selecione o estado"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label>Valor do Frete</label>
                            <CurrencyInput
                                value={formData.valor}
                                onValueChange={(value) => setFormData({ ...formData, valor: value || 0 })}
                                placeholder="R$ 0,00"
                                required
                            />
                        </div>

                        <div className={styles.formGroupFull}>
                            <label>Observação</label>
                            <textarea
                                value={formData.observacao}
                                onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
                                placeholder="Observações adicionais"
                                rows={3}
                            />
                        </div>
                    </div>

                    <div className={styles.formActions}>
                        <button type="button" onClick={onClose} className={styles.cancelButton}>
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className={styles.submitButton}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Salvando...' : (isEditing ? 'Salvar Alterações' : 'Adicionar Frete')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}