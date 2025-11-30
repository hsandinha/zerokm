'use client';

import { useState, useEffect, useMemo } from 'react';
import { Vehicle } from '../../lib/services/vehicleService';
import { useVehicleDatabase } from '../../lib/hooks/useVehicleDatabase';
import { tablesService } from '../../lib/services/tablesService';
import { AutocompleteInput } from './AutocompleteInput';
import { MaskedInput } from './MaskedInput';
import { CurrencyInput } from './CurrencyInput';
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
        dataEntrada: new Date().toLocaleDateString('pt-BR'),
        modelo: '',
        transmissao: 'Manual',
        combustivel: 'Flex',
        cor: '',
        ano: '',
        opcionais: '',
        preco: 0,
        status: 'A faturar',
        observacoes: '',
        cidade: '',
        estado: '',
        concessionaria: '',
        telefone: '',
        nomeContato: '',
        operador: ''
    });

    // Preencher dados quando estiver editando
    useEffect(() => {
        if (isEditing && editingVehicle && isOpen) {
            setFormData({
                dataEntrada: editingVehicle.dataEntrada || new Date().toLocaleDateString('pt-BR'),
                modelo: editingVehicle.modelo || '',
                transmissao: editingVehicle.transmissao || 'Manual',
                combustivel: editingVehicle.combustivel || 'Flex',
                cor: editingVehicle.cor || '',
                ano: editingVehicle.ano || '',
                opcionais: editingVehicle.opcionais || '',
                preco: editingVehicle.preco || 0,
                status: editingVehicle.status || 'A faturar',
                observacoes: editingVehicle.observacoes || '',
                cidade: editingVehicle.cidade || '',
                estado: editingVehicle.estado || '',
                concessionaria: editingVehicle.concessionaria || '',
                telefone: editingVehicle.telefone || '',
                nomeContato: editingVehicle.nomeContato || editingVehicle.vendedor || '',
                operador: editingVehicle.operador || ''
            });
        } else if (!isEditing && isOpen) {
            // Reset form when not editing
            setFormData({
                dataEntrada: new Date().toLocaleDateString('pt-BR'),
                modelo: '',
                transmissao: 'Manual',
                combustivel: 'Flex',
                cor: '',
                ano: '',
                opcionais: '',
                preco: 0,
                status: 'A faturar',
                observacoes: '',
                cidade: '',
                estado: '',
                concessionaria: '',
                telefone: '',
                nomeContato: '',
                operador: ''
            });
        }
    }, [isEditing, editingVehicle, isOpen]);

    // Função para carregar modelos (agora carrega todos, pois não há filtro de marca)
    const loadModelos = async () => {
        if (modelos.length > 0) return;
        setLoadingModelos(true);
        try {
            const modelosData = await tablesService.getAllModelos();
            // Como não temos marca, mostramos todos os modelos. 
            // Idealmente, o backend filtraria ou paginaria, mas aqui carregamos tudo.
            // Podemos concatenar Marca + Modelo para ficar mais claro na lista se desejado,
            // mas o requisito pediu para remover Marca. Vamos listar apenas os nomes dos modelos.
            const modelosNomes = modelosData.map(modelo => modelo.nome);
            // Remover duplicatas se houver
            setModelos([...new Set(modelosNomes)]);
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
    };

    // Função memoizada para filtrar cidades
    const getCidadesSuggestions = useMemo(() => {
        return (searchTerm: string): string[] => {
            if (!formData.estado) return [];
            return filterCidades(searchTerm, formData.estado);
        };
    }, [formData.estado]);

    const handleCidadeChange = (value: string) => {
        setFormData(prev => ({ ...prev, cidade: value }));
    };

    const handleTelefoneChange = (value: string) => {
        setFormData(prev => ({ ...prev, telefone: value }));
    };

    const handlePrecoChange = (value?: number) => {
        setFormData(prev => ({ ...prev, preco: value ?? 0 }));
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
            console.log('=== INICIO DO SUBMIT ===');
            console.log('Dados do formulário antes de enviar:', formData);

            // Validar campos obrigatórios
            const camposObrigatorios = {
                modelo: formData.modelo,
                concessionaria: formData.concessionaria,
                cidade: formData.cidade,
                estado: formData.estado,
                nomeContato: formData.nomeContato,
                telefone: formData.telefone
            };

            console.log('Validando campos obrigatórios:', camposObrigatorios);

            const camposFaltando = Object.entries(camposObrigatorios)
                .filter(([_, value]) => !value)
                .map(([key, _]) => key);

            if (camposFaltando.length > 0) {
                alert(`Por favor, preencha os campos obrigatórios: ${camposFaltando.join(', ')}`);
                console.log('Campos faltando:', camposFaltando);
                setIsSubmitting(false);
                return;
            }

            console.log('Validação passou! Enviando...');
            let success;
            if (isEditing && editingVehicle?.id) {
                console.log('Atualizando veículo ID:', editingVehicle.id);
                success = await updateVehicle(editingVehicle.id, formData);
                console.log('Resultado da atualização:', success);
            } else {
                console.log('Adicionando novo veículo...');
                success = await addVehicle(formData);
                console.log('Resultado da adição:', success);
            }

            console.log('Success flag:', success);
            if (success) {
                console.log('Veículo salvo com sucesso! Chamando callbacks...');
                alert('Veículo salvo com sucesso!');
                onVehicleAdded();
                onClose();
            } else {
                console.error('Success retornou false');
                alert('Erro ao salvar veículo. Tente novamente.');
            }
        } catch (error) {
            console.error('Erro ao adicionar veículo:', error);
            alert('Erro ao cadastrar veículo. Tente novamente.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <section className={styles.panel}>
            <div className={styles.header}>
                <div>
                    <h2>{isEditing ? 'Editar Veículo' : 'Cadastrar Novo Veículo'}</h2>
                    <p>{isEditing ? 'Atualize as informações e mantenha o estoque sincronizado.' : 'Preencha os campos para cadastrar um novo veículo.'}</p>
                </div>
                <button type="button" className={styles.closeButton} onClick={onClose}>
                    {isEditing ? 'Cancelar edição' : 'Fechar formulário'}
                </button>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formGrid}>
                    <div className={styles.formGroup}>
                        <label htmlFor="dataEntrada">Data de Entrada</label>
                        <input
                            type="text"
                            id="dataEntrada"
                            name="dataEntrada"
                            value={typeof formData.dataEntrada === 'string' ? formData.dataEntrada : formData.dataEntrada.toLocaleDateString('pt-BR')}
                            onChange={handleInputChange}
                            placeholder="Ex: 20/11/2025"
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <AutocompleteInput
                            name="modelo"
                            label="Modelo"
                            value={formData.modelo}
                            onChange={handleModeloChange}
                            options={modelos}
                            placeholder="Ex: COROLLA ALTIS 2.0"
                            required
                            onFocus={loadModelos}
                            loading={loadingModelos}
                        />
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
                            <option value="Automático">Automático</option>
                            <option value="CVT">CVT</option>
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

                    <div className={styles.formGroup}>
                        <CurrencyInput
                            name="preco"
                            label="Valor"
                            value={formData.preco}
                            onValueChange={handlePrecoChange}
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
                            <option value="A faturar">A faturar</option>
                            <option value="Refaturamento">Refaturamento</option>
                            <option value="Licenciado">Licenciado</option>
                        </select>
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

                    <div className={styles.formGroup}>
                        <label htmlFor="nomeContato">Nome do Contato*</label>
                        <input
                            type="text"
                            id="nomeContato"
                            name="nomeContato"
                            value={formData.nomeContato}
                            onChange={handleInputChange}
                            required
                            placeholder="Ex: CARLOS SILVA"
                        />
                    </div>

                    <div className={styles.formGroup}>
                        <label htmlFor="operador">Operador</label>
                        <input
                            type="text"
                            id="operador"
                            name="operador"
                            value={formData.operador}
                            onChange={handleInputChange}
                            placeholder="Ex: JOÃO"
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
        </section>
    );
}