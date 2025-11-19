'use client';

import { useState, useEffect } from 'react';
import { Transportadora, TransportadoraService } from '../../lib/services/transportadoraService';
import { MaskedInput } from './MaskedInput';
import { AutocompleteInput } from './AutocompleteInput';
import { getEstados, getAllCidades, filterCidades } from '../../lib/data/estadosCidades';
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
        nome: '',
        cnpj: '',
        razaoSocial: '',
        inscricaoEstadual: '',
        telefone: '',
        celular: '',
        email: '',
        endereco: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        estado: '',
        cep: '',
        nomeResponsavel: '',
        telefoneResponsavel: '',
        emailResponsavel: '',
        observacoes: '',
        ativo: true,
        dataCreated: new Date().toLocaleDateString('pt-BR')
    });

    // Preencher dados quando estiver editando
    useEffect(() => {
        if (isEditing && editingTransportadora && isOpen) {
            setFormData({
                nome: editingTransportadora.nome || '',
                cnpj: editingTransportadora.cnpj || '',
                razaoSocial: editingTransportadora.razaoSocial || '',
                inscricaoEstadual: editingTransportadora.inscricaoEstadual || '',
                telefone: editingTransportadora.telefone || '',
                celular: editingTransportadora.celular || '',
                email: editingTransportadora.email || '',
                endereco: editingTransportadora.endereco || '',
                numero: editingTransportadora.numero || '',
                complemento: editingTransportadora.complemento || '',
                bairro: editingTransportadora.bairro || '',
                cidade: editingTransportadora.cidade || '',
                estado: editingTransportadora.estado || '',
                cep: editingTransportadora.cep || '',
                nomeResponsavel: editingTransportadora.nomeResponsavel || '',
                telefoneResponsavel: editingTransportadora.telefoneResponsavel || '',
                emailResponsavel: editingTransportadora.emailResponsavel || '',
                observacoes: editingTransportadora.observacoes || '',
                ativo: editingTransportadora.ativo !== undefined ? editingTransportadora.ativo : true,
                dataCreated: editingTransportadora.dataCreated || new Date().toLocaleDateString('pt-BR')
            });
        } else if (!isEditing && isOpen) {
            // Reset form when not editing
            setFormData({
                nome: '',
                cnpj: '',
                razaoSocial: '',
                inscricaoEstadual: '',
                telefone: '',
                celular: '',
                email: '',
                endereco: '',
                numero: '',
                complemento: '',
                bairro: '',
                cidade: '',
                estado: '',
                cep: '',
                nomeResponsavel: '',
                telefoneResponsavel: '',
                emailResponsavel: '',
                observacoes: '',
                ativo: true,
                dataCreated: new Date().toLocaleDateString('pt-BR')
            });
        }
    }, [isEditing, editingTransportadora, isOpen]);

    // Handlers
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            const checked = (e.target as HTMLInputElement).checked;
            setFormData(prev => ({ ...prev, [name]: checked }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleEstadoChange = (value: string) => {
        setFormData(prev => ({ ...prev, estado: value, cidade: '' }));
    };

    const handleCidadeChange = (value: string) => {
        setFormData(prev => ({ ...prev, cidade: value }));
    };

    const handleTelefoneChange = (value: string) => {
        setFormData(prev => ({ ...prev, telefone: value }));
    };

    const handleCelularChange = (value: string) => {
        setFormData(prev => ({ ...prev, celular: value }));
    };

    const handleTelefoneResponsavelChange = (value: string) => {
        setFormData(prev => ({ ...prev, telefoneResponsavel: value }));
    };

    const handleCnpjChange = (value: string) => {
        setFormData(prev => ({ ...prev, cnpj: value }));
    };

    const handleCepChange = (value: string) => {
        setFormData(prev => ({ ...prev, cep: value }));
    };

    // Função para filtrar cidades baseado no estado selecionado
    const getCidadesSuggestions = (searchTerm: string): string[] => {
        return filterCidades(searchTerm, formData.estado);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            // Validar campos obrigatórios
            if (!formData.nome || !formData.cnpj || !formData.razaoSocial || !formData.telefone ||
                !formData.email || !formData.endereco || !formData.cidade || !formData.estado ||
                !formData.nomeResponsavel || !formData.telefoneResponsavel) {
                alert('Por favor, preencha todos os campos obrigatórios marcados com *');
                setIsSubmitting(false);
                return;
            }

            let success;
            if (isEditing && editingTransportadora?.id) {
                await TransportadoraService.updateTransportadora(editingTransportadora.id, formData);
                success = true;
            } else {
                success = await TransportadoraService.addTransportadora(formData);
            }

            if (success) {
                onTransportadoraAdded();
                onClose();
            }
        } catch (error) {
            console.error('Erro ao salvar transportadora:', error);
            alert('Erro ao cadastrar transportadora. Tente novamente.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className={styles.overlay} onClick={handleOverlayClick}>
            <div className={styles.modal} style={{ maxWidth: '1000px' }}>
                <div className={styles.header}>
                    <h2>{isEditing ? 'Editar Transportadora' : 'Cadastrar Nova Transportadora'}</h2>
                    <button className={styles.closeButton} onClick={onClose}>✕</button>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formGrid}>
                        {/* Dados da Empresa */}
                        <div className={styles.formGroup}>
                            <label htmlFor="nome">Nome Fantasia*</label>
                            <input
                                type="text"
                                id="nome"
                                name="nome"
                                value={formData.nome}
                                onChange={handleInputChange}
                                required
                                placeholder="Ex: Transportes ABC Ltda"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="razaoSocial">Razão Social*</label>
                            <input
                                type="text"
                                id="razaoSocial"
                                name="razaoSocial"
                                value={formData.razaoSocial}
                                onChange={handleInputChange}
                                required
                                placeholder="Ex: ABC Transportes e Logística Ltda"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <MaskedInput
                                name="cnpj"
                                label="CNPJ"
                                value={formData.cnpj}
                                onChange={handleCnpjChange}
                                mask="cnpj"
                                placeholder="00.000.000/0000-00"
                                required
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="inscricaoEstadual">Inscrição Estadual</label>
                            <input
                                type="text"
                                id="inscricaoEstadual"
                                name="inscricaoEstadual"
                                value={formData.inscricaoEstadual}
                                onChange={handleInputChange}
                                placeholder="000.000.000.000"
                            />
                        </div>

                        {/* Contato */}
                        <div className={styles.formGroup}>
                            <MaskedInput
                                name="telefone"
                                label="Telefone"
                                value={formData.telefone}
                                onChange={handleTelefoneChange}
                                mask="phone"
                                placeholder="(11)99999-9999"
                                required
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <MaskedInput
                                name="celular"
                                label="Celular"
                                value={formData.celular || ''}
                                onChange={handleCelularChange}
                                mask="phone"
                                placeholder="(11)99999-9999"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="email">E-mail*</label>
                            <input
                                type="email"
                                id="email"
                                name="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                required
                                placeholder="contato@transportesabc.com.br"
                            />
                        </div>

                        {/* Endereço */}
                        <div className={styles.formGroup}>
                            <label htmlFor="endereco">Endereço*</label>
                            <input
                                type="text"
                                id="endereco"
                                name="endereco"
                                value={formData.endereco}
                                onChange={handleInputChange}
                                required
                                placeholder="Rua das Flores, 123"
                            />
                        </div>

                        <div className={styles.formGroupDual}>
                            <div className={styles.dualInputContainer}>
                                <div className={styles.dualInput}>
                                    <label htmlFor="numero">Número*</label>
                                    <input
                                        type="text"
                                        id="numero"
                                        name="numero"
                                        value={formData.numero}
                                        onChange={handleInputChange}
                                        required
                                        placeholder="123"
                                    />
                                </div>
                                <div className={styles.dualInput}>
                                    <label htmlFor="complemento">Complemento</label>
                                    <input
                                        type="text"
                                        id="complemento"
                                        name="complemento"
                                        value={formData.complemento}
                                        onChange={handleInputChange}
                                        placeholder="Sala 101"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="bairro">Bairro*</label>
                            <input
                                type="text"
                                id="bairro"
                                name="bairro"
                                value={formData.bairro}
                                onChange={handleInputChange}
                                required
                                placeholder="Centro"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <AutocompleteInput
                                name="estado"
                                label="Estado"
                                value={formData.estado}
                                onChange={handleEstadoChange}
                                options={estados}
                                placeholder="Ex: São Paulo - SP"
                                required
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <AutocompleteInput
                                name="cidade"
                                label="Cidade"
                                value={formData.cidade}
                                onChange={handleCidadeChange}
                                getSuggestions={getCidadesSuggestions}
                                placeholder={formData.estado ? "Ex: São Paulo" : "Selecione um estado primeiro"}
                                required
                                disabled={!formData.estado}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <MaskedInput
                                name="cep"
                                label="CEP"
                                value={formData.cep}
                                onChange={handleCepChange}
                                mask="cep"
                                placeholder="00000-000"
                            />
                        </div>

                        {/* Responsável */}
                        <div className={styles.formGroup}>
                            <label htmlFor="nomeResponsavel">Nome do Responsável*</label>
                            <input
                                type="text"
                                id="nomeResponsavel"
                                name="nomeResponsavel"
                                value={formData.nomeResponsavel}
                                onChange={handleInputChange}
                                required
                                placeholder="João Silva"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <MaskedInput
                                name="telefoneResponsavel"
                                label="Telefone do Responsável"
                                value={formData.telefoneResponsavel}
                                onChange={handleTelefoneResponsavelChange}
                                mask="phone"
                                placeholder="(11)99999-9999"
                                required
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="emailResponsavel">E-mail do Responsável</label>
                            <input
                                type="email"
                                id="emailResponsavel"
                                name="emailResponsavel"
                                value={formData.emailResponsavel}
                                onChange={handleInputChange}
                                placeholder="joao@transportesabc.com.br"
                            />
                        </div>

                        {/* Status */}
                        <div className={styles.formGroup}>
                            <label htmlFor="ativo">Status*</label>
                            <select
                                id="ativo"
                                name="ativo"
                                value={formData.ativo ? 'true' : 'false'}
                                onChange={(e) => setFormData(prev => ({ ...prev, ativo: e.target.value === 'true' }))}
                                required
                            >
                                <option value="true">Ativo</option>
                                <option value="false">Inativo</option>
                            </select>
                        </div>
                    </div>

                    {/* Observações */}
                    <div className={styles.formGroupFull}>
                        <label htmlFor="observacoes">Observações</label>
                        <textarea
                            id="observacoes"
                            name="observacoes"
                            value={formData.observacoes}
                            onChange={handleInputChange}
                            rows={4}
                            placeholder="Informações adicionais sobre a transportadora..."
                        />
                    </div>

                    <div className={styles.formActions}>
                        <button type="button" className={styles.cancelButton} onClick={onClose}>
                            Cancelar
                        </button>
                        <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
                            {isSubmitting ? 'Salvando...' : (isEditing ? 'Atualizar Transportadora' : 'Cadastrar Transportadora')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}