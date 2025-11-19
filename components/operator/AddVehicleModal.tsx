'use client';

import { useState, useEffect } from 'react';
import { Vehicle } from '../../lib/services/vehicleService';
import { useVehicleDatabase } from '../../lib/hooks/useVehicleDatabase';
import { tablesService } from '../../lib/services/tablesService';
import { AutocompleteInput } from './AutocompleteInput';
import { MaskedInput } from './MaskedInput';
import { getEstados, getAllCidades, filterCidades } from '../../lib/data/estadosCidades';
import styles from './AddVehicleModal.module.css';

interface AddVehicleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onVehicleAdded: () => void;
    editingVehicle?: Vehicle | null;
    isEditing?: boolean;
}

export function AddVehicleModal({ isOpen, onClose, onVehicleAdded, editingVehicle, isEditing = false }: AddVehicleModalProps) {
    const { addVehicle, updateVehicle } = useVehicleDatabase();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Estados para autocomplete
    const [marcas, setMarcas] = useState<string[]>([]);
    const [modelos, setModelos] = useState<string[]>([]);
    const [cores, setCores] = useState<string[]>([]);
    const [concessionarias, setConcessionarias] = useState<string[]>([]);
    const [estados] = useState<string[]>(getEstados());
    const [cidades, setCidades] = useState<string[]>([]);
    const [loadingMarcas, setLoadingMarcas] = useState(false);
    const [loadingModelos, setLoadingModelos] = useState(false);
    const [loadingCores, setLoadingCores] = useState(false);
    const [loadingConcessionarias, setLoadingConcessionarias] = useState(false);
    const [formData, setFormData] = useState<Omit<Vehicle, 'id'>>({
        marca: '',
        modelo: '',
        versao: '',
        opcionais: '',
        cor: '',
        concessionaria: '',
        preco: 0,
        ano: '',
        anoModelo: '',
        status: 'Disponível',
        cidade: '',
        estado: '',
        chassi: '',
        motor: '',
        combustivel: 'Flex',
        transmissao: 'Manual',
        observacoes: '',
        dataEntrada: new Date().toLocaleDateString('pt-BR'),
        vendedor: '',
        telefone: ''
    });

    // Preencher dados quando estiver editando
    useEffect(() => {
        if (isEditing && editingVehicle && isOpen) {
            setFormData({
                marca: editingVehicle.marca || '',
                modelo: editingVehicle.modelo || '',
                versao: editingVehicle.versao || '',
                opcionais: editingVehicle.opcionais || '',
                cor: editingVehicle.cor || '',
                concessionaria: editingVehicle.concessionaria || '',
                preco: editingVehicle.preco || 0,
                ano: editingVehicle.ano || '',
                anoModelo: editingVehicle.anoModelo || '',
                status: editingVehicle.status || 'Disponível',
                cidade: editingVehicle.cidade || '',
                estado: editingVehicle.estado || '',
                chassi: editingVehicle.chassi || '',
                motor: editingVehicle.motor || '',
                combustivel: editingVehicle.combustivel || 'Flex',
                transmissao: editingVehicle.transmissao || 'Manual',
                observacoes: editingVehicle.observacoes || '',
                dataEntrada: editingVehicle.dataEntrada || new Date().toLocaleDateString('pt-BR'),
                vendedor: editingVehicle.vendedor || '',
                telefone: editingVehicle.telefone || ''
            });
        } else if (!isEditing && isOpen) {
            // Reset form when not editing
            setFormData({
                marca: '',
                modelo: '',
                versao: '',
                opcionais: '',
                cor: '',
                concessionaria: '',
                preco: 0,
                ano: '',
                anoModelo: '',
                status: 'Disponível',
                cidade: '',
                estado: '',
                chassi: '',
                motor: '',
                combustivel: 'Flex',
                transmissao: 'Manual',
                observacoes: '',
                dataEntrada: new Date().toLocaleDateString('pt-BR'),
                vendedor: '',
                telefone: ''
            });
        }
    }, [isEditing, editingVehicle, isOpen]);

    // Função para carregar marcas
    const loadMarcas = async () => {
        if (marcas.length > 0) return; // Já carregadas

        setLoadingMarcas(true);
        try {
            const marcasData = await tablesService.getAllMarcas();
            setMarcas(marcasData.map(marca => marca.nome));
        } catch (error) {
            console.error('Erro ao carregar marcas:', error);
        } finally {
            setLoadingMarcas(false);
        }
    };

    // Função para carregar modelos filtrados por marca
    const loadModelos = async (marcaSelecionada: string) => {
        setLoadingModelos(true);
        try {
            const modelosData = await tablesService.getAllModelos();
            const modelosFiltrados = modelosData
                .filter(modelo => modelo.marca.toLowerCase() === marcaSelecionada.toLowerCase())
                .map(modelo => modelo.nome);
            setModelos(modelosFiltrados);
        } catch (error) {
            console.error('Erro ao carregar modelos:', error);
        } finally {
            setLoadingModelos(false);
        }
    };

    // Função para carregar cores
    const loadCores = async () => {
        if (cores.length > 0) return; // Já carregadas

        setLoadingCores(true);
        try {
            const coresData = await tablesService.getAllCores();
            setCores(coresData.map(cor => cor.nome));
        } catch (error) {
            console.error('Erro ao carregar cores:', error);
        } finally {
            setLoadingCores(false);
        }
    };

    // Função para carregar concessionárias
    const loadConcessionarias = async () => {
        if (concessionarias.length > 0) return; // Já carregadas

        setLoadingConcessionarias(true);
        try {
            // Tentar popular concessionárias iniciais caso não existam
            await tablesService.populateInitialConcessionarias();

            const concessionariasData = await tablesService.getAllConcessionarias();
            setConcessionarias(concessionariasData.map(conc => conc.nome));
        } catch (error) {
            console.error('Erro ao carregar concessionárias:', error);
        } finally {
            setLoadingConcessionarias(false);
        }
    };    // Handlers para os campos de autocomplete
    const handleMarcaChange = (value: string) => {
        setFormData(prev => ({ ...prev, marca: value, modelo: '' })); // Limpar modelo ao mudar marca
        setModelos([]); // Limpar lista de modelos
        if (value.length > 0) {
            loadModelos(value);
        }
    };

    const handleModeloChange = (value: string) => {
        setFormData(prev => ({ ...prev, modelo: value }));
    };

    const handleCorChange = (value: string) => {
        setFormData(prev => ({ ...prev, cor: value }));
    };

    const handleConcessionariaChange = (value: string) => {
        setFormData(prev => ({ ...prev, concessionaria: value }));
    };

    const handleEstadoChange = (value: string) => {
        setFormData(prev => ({ ...prev, estado: value, cidade: '' })); // Limpar cidade ao mudar estado
        setCidades([]); // Limpar lista de cidades
    };

    const handleCidadeChange = (value: string) => {
        setFormData(prev => ({ ...prev, cidade: value }));
    };

    const handleTelefoneChange = (value: string) => {
        setFormData(prev => ({ ...prev, telefone: value }));
    };

    const handlePrecoChange = (value: string) => {
        // Converte de centavos para reais (divide por 100)
        const preco = parseFloat(value) / 100 || 0;
        setFormData(prev => ({ ...prev, preco }));
    };

    // Função para filtrar cidades baseado no estado selecionado e termo de busca
    const getCidadesSuggestions = (searchTerm: string): string[] => {
        return filterCidades(searchTerm, formData.estado);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: name === 'preco' ? parseFloat(value) || 0 : value
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            console.log('Dados do formulário antes de enviar:', formData);

            // Validar campos obrigatórios
            if (!formData.marca || !formData.modelo || !formData.concessionaria || !formData.cidade || !formData.estado || !formData.vendedor || !formData.telefone) {
                alert('Por favor, preencha todos os campos obrigatórios marcados com *');
                setIsSubmitting(false);
                return;
            }

            let success;
            if (isEditing && editingVehicle?.id) {
                success = await updateVehicle(editingVehicle.id, formData);
                console.log('Veículo atualizado com sucesso!');
            } else {
                success = await addVehicle(formData);
                console.log('Veículo adicionado com sucesso!');
            }

            if (success) {
                onVehicleAdded();
                onClose();
            }
        } catch (error) {
            console.error('Erro ao adicionar veículo:', error);
            alert('Erro ao cadastrar veículo. Tente novamente.');
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
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h2>{isEditing ? 'Editar Veículo' : 'Cadastrar Novo Veículo'}</h2>
                    <button className={styles.closeButton} onClick={onClose}>✕</button>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <AutocompleteInput
                                name="marca"
                                label="Marca"
                                value={formData.marca}
                                onChange={handleMarcaChange}
                                options={marcas}
                                placeholder="Ex: TOYOTA"
                                required
                                onFocus={loadMarcas}
                                loading={loadingMarcas}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <AutocompleteInput
                                name="modelo"
                                label="Modelo"
                                value={formData.modelo}
                                onChange={handleModeloChange}
                                options={modelos}
                                placeholder={formData.marca ? "Ex: COROLLA ALTIS 2.0" : "Selecione uma marca primeiro"}
                                required
                                loading={loadingModelos}
                                disabled={!formData.marca}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="versao">Versão</label>
                            <input
                                type="text"
                                id="versao"
                                name="versao"
                                value={formData.versao}
                                onChange={handleInputChange}
                                placeholder="Ex: ALTIS PREMIUM"
                            />
                        </div>

                        <div className={styles.formGroupDual}>
                            <div className={styles.dualInputContainer}>
                                <div className={styles.dualInput}>
                                    <label htmlFor="ano">Ano*</label>
                                    <input
                                        type="text"
                                        id="ano"
                                        name="ano"
                                        value={formData.ano}
                                        onChange={handleInputChange}
                                        required
                                        placeholder="Ex: 2024"
                                    />
                                </div>
                                <div className={styles.dualInput}>
                                    <label htmlFor="anoModelo">Ano Modelo*</label>
                                    <input
                                        type="text"
                                        id="anoModelo"
                                        name="anoModelo"
                                        value={formData.anoModelo}
                                        onChange={handleInputChange}
                                        required
                                        placeholder="Ex: 2024"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className={styles.formGroup}>
                            <AutocompleteInput
                                name="cor"
                                label="Cor"
                                value={formData.cor}
                                onChange={handleCorChange}
                                options={cores}
                                placeholder="Ex: BRANCO POLAR"
                                required
                                onFocus={loadCores}
                                loading={loadingCores}
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <MaskedInput
                                name="preco"
                                label="Preço"
                                value={(formData.preco * 100).toString()} // Converte reais para centavos
                                onChange={handlePrecoChange}
                                mask="currency"
                                placeholder="R$ 154.920,00"
                                required
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="status">Status*</label>
                            <select
                                id="status"
                                name="status"
                                value={formData.status}
                                onChange={handleInputChange}
                                required
                            >
                                <option value="Disponível">Disponível</option>
                                <option value="Vendido">Vendido</option>
                                <option value="Reservado">Reservado</option>
                                <option value="Manutenção">Manutenção</option>
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="combustivel">Combustível*</label>
                            <select
                                id="combustivel"
                                name="combustivel"
                                value={formData.combustivel}
                                onChange={handleInputChange}
                                required
                            >
                                <option value="Flex">Flex</option>
                                <option value="Gasolina">Gasolina</option>
                                <option value="Etanol">Etanol</option>
                                <option value="Diesel">Diesel</option>
                                <option value="Elétrico">Elétrico</option>
                                <option value="Híbrido">Híbrido</option>
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="transmissao">Transmissão*</label>
                            <select
                                id="transmissao"
                                name="transmissao"
                                value={formData.transmissao}
                                onChange={handleInputChange}
                                required
                            >
                                <option value="Manual">Manual</option>
                                <option value="Automática">Automática</option>
                                <option value="CVT">CVT</option>
                            </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="motor">Motor</label>
                            <input
                                type="text"
                                id="motor"
                                name="motor"
                                value={formData.motor}
                                onChange={handleInputChange}
                                placeholder="Ex: 2.0 16V FLEX"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <label htmlFor="chassi">Chassi</label>
                            <input
                                type="text"
                                id="chassi"
                                name="chassi"
                                value={formData.chassi}
                                onChange={handleInputChange}
                                placeholder="Ex: 9BR53ZEC*P*020190"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <AutocompleteInput
                                name="concessionaria"
                                label="Concessionária"
                                value={formData.concessionaria}
                                onChange={handleConcessionariaChange}
                                options={concessionarias}
                                placeholder="Ex: Toyota Prime São Paulo"
                                required
                                onFocus={loadConcessionarias}
                                loading={loadingConcessionarias}
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
                            <label htmlFor="vendedor">Vendedor*</label>
                            <input
                                type="text"
                                id="vendedor"
                                name="vendedor"
                                value={formData.vendedor}
                                onChange={handleInputChange}
                                required
                                placeholder="Ex: CARLOS SILVA"
                            />
                        </div>

                        <div className={styles.formGroup}>
                            <MaskedInput
                                name="telefone"
                                label="Telefone"
                                value={formData.telefone}
                                onChange={handleTelefoneChange}
                                mask="phone"
                                placeholder="(11)99999-1001"
                                required
                                maxLength={15}
                            />
                        </div>
                    </div>

                    <div className={styles.formGroupFull}>
                        <label htmlFor="opcionais">Opcionais</label>
                        <textarea
                            id="opcionais"
                            name="opcionais"
                            value={formData.opcionais}
                            onChange={handleInputChange}
                            placeholder="Ex: AR CONDICIONADO, DIREÇÃO ELÉTRICA, VIDROS ELÉTRICOS, CENTRAL MULTIMÍDIA"
                            rows={3}
                        />
                    </div>

                    <div className={styles.formGroupFull}>
                        <label htmlFor="observacoes">Observações</label>
                        <textarea
                            id="observacoes"
                            name="observacoes"
                            value={formData.observacoes}
                            onChange={handleInputChange}
                            placeholder="Observações adicionais sobre o veículo"
                            rows={3}
                        />
                    </div>

                    <div className={styles.formActions}>
                        <button type="button" onClick={onClose} className={styles.cancelButton}>
                            Cancelar
                        </button>
                        <button type="submit" disabled={isSubmitting} className={styles.submitButton}>
                            {isSubmitting
                                ? (isEditing ? 'Salvando...' : 'Cadastrando...')
                                : (isEditing ? 'Salvar Alterações' : 'Cadastrar Veículo')
                            }
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}