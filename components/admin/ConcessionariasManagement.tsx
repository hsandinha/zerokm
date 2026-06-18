'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MaskedInput } from '../../components/operator/MaskedInput';
import { ConcessionariaService } from '../../lib/services/concessionariaService';
import styles from './ConcessionariasManagement.module.css';

// Interfaces para Concessionária
interface ClienteData {
    id: string;
    nome: string;
    razaoSocial: string;
    marcaId?: string | null;
    marca?: string | null;
    telefone: string;
    celular?: string;
    contato: string;
    email: string;
    endereco: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade: string;
    cnpj: string;
    uf: string;
    cep: string;
    inscricaoEstadual?: string;
    nomeResponsavel: string;
    telefoneResponsavel: string;
    emailResponsavel?: string;
    observacoes?: string;
    ativo?: boolean;
    operadorId?: string;
    dataCadastro?: string | null;
    criadoEm?: string | null;
    atualizadoEm?: string | null;
    totalVeiculos?: number;
    ultimaAtualizacao?: string | null;
}

interface MarcaData {
    id: string;
    nome: string;
}

type ClienteFormData = {
    nome: string;
    razaoSocial: string;
    marcaId: string;
    inscricaoEstadual: string;
    telefone: string;
    celular: string;
    contato: string;
    email: string;
    endereco: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    cnpj: string;
    uf: string;
    cep: string;
    nomeResponsavel: string;
    telefoneResponsavel: string;
    emailResponsavel: string;
    observacoes: string;
    ativo: boolean;
    operadorId: string;
};

const createEmptyClienteForm = (): ClienteFormData => ({
    nome: '',
    razaoSocial: '',
    marcaId: '',
    inscricaoEstadual: '',
    telefone: '',
    celular: '',
    contato: '',
    email: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    cnpj: '',
    uf: '',
    cep: '',
    nomeResponsavel: '',
    telefoneResponsavel: '',
    emailResponsavel: '',
    observacoes: '',
    ativo: true,
    operadorId: ''
});

export function ConcessionariasManagement() {
    const [searchTerm, setSearchTerm] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [clientes, setClientes] = useState<ClienteData[]>([]);
    const [filteredClientes, setFilteredClientes] = useState<ClienteData[]>([]);
    const [editingCliente, setEditingCliente] = useState<ClienteData | null>(null);
    const [formData, setFormData] = useState<ClienteFormData>(createEmptyClienteForm());
    const [loadingClientes, setLoadingClientes] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isFetchingCep, setIsFetchingCep] = useState(false);
    const [cepError, setCepError] = useState<string | null>(null);
    const lastCepRef = useRef<string>('');
    const [showAssociateModal, setShowAssociateModal] = useState(false);
    const [selectedConcessionariaForAssociate, setSelectedConcessionariaForAssociate] = useState<ClienteData | null>(null);
    const [vehiclesWithoutConcessionaria, setVehiclesWithoutConcessionaria] = useState<any[]>([]);
    const [loadingVehicles, setLoadingVehicles] = useState(false);
    const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
    const [vehicleFilter, setVehicleFilter] = useState('');
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
    const [operadores, setOperadores] = useState<{_id: string, displayName: string, email: string}[]>([]);
    const [marcas, setMarcas] = useState<MarcaData[]>([]);

    // Resolve operadorId: usa o campo direto ou faz match pelo nomeResponsavel
    const getOperadorIdForCliente = (cliente: ClienteData): string => {
        if (cliente.operadorId) return cliente.operadorId;
        // Fallback: tentar match pelo nomeResponsavel
        if (cliente.nomeResponsavel && operadores.length > 0) {
            const nomeNorm = cliente.nomeResponsavel.trim().toLowerCase();
            const match = operadores.find(op => 
                (op.displayName || '').trim().toLowerCase() === nomeNorm ||
                (op.displayName || '').trim().toLowerCase().includes(nomeNorm) ||
                nomeNorm.includes((op.displayName || '').trim().toLowerCase())
            );
            return match?._id || '';
        }
        return '';
    };

    const getStatusColor = (dateString?: string | null) => {
        if (!dateString) return 'red';
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - date.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 15) return 'green';
        if (diffDays <= 30) return 'yellow';
        return 'red';
    };

    const getDaysSinceUpdate = (dateString?: string | null) => {
        if (!dateString) return 'Sem dados';
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now.getTime() - date.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return `${diffDays} dias`;
    };

    const resetForm = () => {
        setFormData(createEmptyClienteForm());
        setCepError(null);
        setIsFetchingCep(false);
        lastCepRef.current = '';
    };

    const fetchVehiclesWithoutConcessionaria = async () => {
        setLoadingVehicles(true);
        try {
            const response = await fetch('/api/vehicles?semConcessionaria=true&limit=1000');
            if (response.ok) {
                const data = await response.json();
                console.log('Veículos sem concessionária:', data);
                setVehiclesWithoutConcessionaria(data.vehicles || data.data || []);
            } else {
                console.error('Erro na resposta:', response.status);
            }
        } catch (error) {
            console.error('Erro ao carregar veículos:', error);
        } finally {
            setLoadingVehicles(false);
        }
    };

    const handleSort = (column: string) => {
        if (sortColumn === column) {
            setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
        } else {
            setSortColumn(column);
            setSortDirection('asc');
        }
    };

    const handleOpenAssociateModal = (cliente: ClienteData) => {
        setSelectedConcessionariaForAssociate(cliente);
        setVehicleFilter('');
        setSortColumn(null);
        setSortDirection('asc');
        setShowAssociateModal(true);
        setSelectedVehicles([]);
        fetchVehiclesWithoutConcessionaria();
    };

    const handleCloseAssociateModal = () => {
        setShowAssociateModal(false);
        setSelectedConcessionariaForAssociate(null);
        setSelectedVehicles([]);
        setVehiclesWithoutConcessionaria([]);
    };

    const handleToggleVehicle = (vehicleId: string) => {
        setSelectedVehicles(prev =>
            prev.includes(vehicleId)
                ? prev.filter(id => id !== vehicleId)
                : [...prev, vehicleId]
        );
    };

    const handleAssociateVehicles = async () => {
        if (!selectedConcessionariaForAssociate || selectedVehicles.length === 0) return;

        try {
            const response = await fetch('/api/vehicles/associate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    concessionaria: selectedConcessionariaForAssociate.nome,
                    vehicleIds: selectedVehicles
                })
            });

            if (response.ok) {
                alert(`${selectedVehicles.length} veículo(s) associado(s) com sucesso!`);
                handleCloseAssociateModal();
                fetchClientes();
            } else {
                alert('Erro ao associar veículos');
            }
        } catch (error) {
            console.error('Erro ao associar veículos:', error);
            alert('Erro ao associar veículos');
        }
    };

    const fetchClientes = useCallback(async () => {
        setLoadingClientes(true);
        setErrorMessage(null);
        try {
            const data = await ConcessionariaService.getAllConcessionarias();
            setClientes(data as ClienteData[]);
        } catch (error) {
            console.error('Erro ao carregar concessionárias:', error);
            setErrorMessage('Não foi possível carregar as concessionárias.');
        } finally {
            setLoadingClientes(false);
        }
    }, []);

    const fetchMarcas = useCallback(async () => {
        try {
            const response = await fetch('/api/tables/marcas');
            if (!response.ok) throw new Error('Erro ao carregar marcas');
            const data = await response.json();
            setMarcas(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Erro ao carregar marcas:', error);
            setErrorMessage('Não foi possível carregar as marcas do catálogo.');
        }
    }, []);

    useEffect(() => {
        fetchClientes();
        fetchMarcas();
        
        // Fetch operadores
        fetch('/api/admin/users')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setOperadores(data);
            })
            .catch(console.error);
    }, [fetchClientes, fetchMarcas]);

    useEffect(() => {
        const normalized = searchTerm.toLowerCase();
        const searchDigits = searchTerm.replace(/\D/g, '');

        const filtered = clientes.filter((cliente) => {
            const nome = cliente.nome?.toLowerCase() ?? '';
            const razaoSocial = cliente.razaoSocial?.toLowerCase() ?? '';
            const contato = cliente.contato?.toLowerCase() ?? '';
            const cidade = cliente.cidade?.toLowerCase() ?? '';
            const bairro = cliente.bairro?.toLowerCase() ?? '';
            const responsavel = cliente.nomeResponsavel?.toLowerCase() ?? '';
            const email = cliente.email?.toLowerCase() ?? '';
            const marca = cliente.marca?.toLowerCase() ?? '';
            const cnpjDigits = cliente.cnpj?.replace(/\D/g, '') ?? '';
            const cepDigits = cliente.cep?.replace(/\D/g, '') ?? '';
            const telefoneResponsavel = cliente.telefoneResponsavel?.replace(/\D/g, '') ?? '';

            return (
                nome.includes(normalized) ||
                razaoSocial.includes(normalized) ||
                contato.includes(normalized) ||
                cidade.includes(normalized) ||
                bairro.includes(normalized) ||
                marca.includes(normalized) ||
                responsavel.includes(normalized) ||
                email.includes(normalized) ||
                (searchDigits ?
                    cnpjDigits.includes(searchDigits) ||
                    cepDigits.includes(searchDigits) ||
                    telefoneResponsavel.includes(searchDigits)
                    :
                    false)
            );
        });
        setFilteredClientes(filtered);
    }, [searchTerm, clientes]);

    const handleClearSearch = () => setSearchTerm('');

    const digitsOnly = (value?: string) => (value ?? '').replace(/\D/g, '');

    const formatDate = (value?: string | null) => {
        if (!value) return '-';
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('pt-BR');
    };

    const formatCnpjDisplay = (value?: string) => {
        const digits = digitsOnly(value);
        if (digits.length !== 14) return value || '-';
        return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
    };

    const formatCepDisplay = (value?: string) => {
        const digits = digitsOnly(value);
        if (digits.length !== 8) return value || '-';
        return `${digits.slice(0, 5)}-${digits.slice(5)}`;
    };

    const formatPhoneDisplay = (value?: string) => {
        const digits = digitsOnly(value);
        if (!digits) return '-';
        if (digits.length <= 10) {
            return `(${digits.slice(0, 2)})${digits.slice(2, 6)}-${digits.slice(6)}`;
        }
        return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
    };

    const composeEnderecoDisplay = (cliente: ClienteData) => {
        const partes: string[] = [];
        if (cliente.endereco) {
            let linha = cliente.endereco;
            if (cliente.numero) linha += `, ${cliente.numero}`;
            if (cliente.complemento) linha += ` (${cliente.complemento})`;
            partes.push(linha.trim());
        }
        if (cliente.bairro) {
            partes.push(cliente.bairro);
        }
        const cidadeUf = [cliente.cidade, cliente.uf].filter(Boolean).join('/');
        if (cidadeUf) {
            partes.push(cidadeUf);
        }
        return partes.join(' • ') || '-';
    };

    const fetchCepData = useCallback(async (cep: string) => {
        if (cep.length !== 8 || lastCepRef.current === cep) {
            return;
        }

        lastCepRef.current = cep;
        setIsFetchingCep(true);
        setCepError(null);

        try {
            const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            if (!response.ok) {
                throw new Error('Erro ao buscar CEP');
            }
            const data = await response.json();

            if (data.erro) {
                setCepError('CEP não encontrado.');
                return;
            }

            setFormData((prev) => ({
                ...prev,
                endereco: data.logradouro || prev.endereco,
                bairro: data.bairro || prev.bairro,
                cidade: data.localidade || prev.cidade,
                uf: data.uf || prev.uf,
                complemento: data.complemento || prev.complemento
            }));
        } catch (error) {
            console.error('Erro ao buscar CEP:', error);
            setCepError('Erro ao buscar CEP.');
        } finally {
            setIsFetchingCep(false);
        }
    }, [setFormData]);

    const handleCepChange = (value: string) => {
        setFormData((prev) => ({ ...prev, cep: value }));
        if (value.length === 8) {
            fetchCepData(value);
        } else {
            setCepError(null);
            lastCepRef.current = '';
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setErrorMessage(null);

        const payload: ClienteFormData & { dataCadastro?: string } = {
            ...formData,
            uf: formData.uf.toUpperCase()
        };

        if (!editingCliente) {
            payload.dataCadastro = new Date().toISOString();
        } else if (editingCliente.dataCadastro) {
            payload.dataCadastro = editingCliente.dataCadastro;
        }

        try {
            let concessionariaId = editingCliente?.id;

            if (editingCliente && editingCliente.id) {
                await ConcessionariaService.updateConcessionaria(editingCliente.id, payload);
            } else {
                const created = await ConcessionariaService.addConcessionaria(payload);
                concessionariaId = created.id;
            }

            if (concessionariaId && formData.marcaId && formData.marcaId !== editingCliente?.marcaId) {
                const brandResponse = await fetch(`/api/concessionarias/${concessionariaId}/catalog-brand`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ marcaId: formData.marcaId }),
                });
                const brandData = await brandResponse.json().catch(() => ({}));
                if (!brandResponse.ok) {
                    throw new Error(brandData.error || 'Erro ao vincular marca à concessionária.');
                }
            }

            await fetchClientes();
            setShowForm(false);
            setEditingCliente(null);
            resetForm();
        } catch (error) {
            console.error('Erro ao salvar concessionária:', error);
            const message = error instanceof Error ? error.message : 'Erro ao salvar concessionária. Tente novamente.';
            alert(message);
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (cliente: ClienteData) => {
        setFormData({
            nome: cliente.nome,
            razaoSocial: cliente.razaoSocial,
            marcaId: cliente.marcaId ?? '',
            inscricaoEstadual: cliente.inscricaoEstadual ?? '',
            telefone: digitsOnly(cliente.telefone),
            celular: digitsOnly(cliente.celular),
            contato: cliente.contato,
            email: cliente.email,
            endereco: cliente.endereco,
            numero: cliente.numero ?? '',
            complemento: cliente.complemento ?? '',
            bairro: cliente.bairro ?? '',
            cidade: cliente.cidade,
            cnpj: digitsOnly(cliente.cnpj),
            uf: cliente.uf,
            cep: digitsOnly(cliente.cep),
            nomeResponsavel: cliente.nomeResponsavel,
            telefoneResponsavel: digitsOnly(cliente.telefoneResponsavel),
            emailResponsavel: cliente.emailResponsavel ?? '',
            observacoes: cliente.observacoes ?? '',
            ativo: cliente.ativo ?? true,
            operadorId: cliente.operadorId ?? ''
        });
        setCepError(null);
        setIsFetchingCep(false);
        lastCepRef.current = '';
        setEditingCliente(cliente);
        setShowForm(true);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir esta concessionária?')) {
            return;
        }

        try {
            await ConcessionariaService.deleteConcessionaria(id);
            await fetchClientes();
        } catch (error) {
            console.error('Erro ao excluir concessionária:', error);
            alert('Erro ao excluir concessionária. Tente novamente.');
        }
    };

    const cancelEdit = () => {
        setShowForm(false);
        setEditingCliente(null);
        resetForm();
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2>Gestão de Concessionárias</h2>
                <div className={styles.headerActions}>
                    <button
                        className={styles.addButton}
                        onClick={() => {
                            if (showForm) {
                                cancelEdit();
                            } else {
                                resetForm();
                                setEditingCliente(null);
                                setShowForm(true);
                            }
                        }}
                    >
                        {showForm ? 'Cancelar' : '+ Nova Concessionária'}
                    </button>
                </div>
            </div>

            {showForm && (
                <div className={styles.formWrapper}>
                    <div className={styles.formContainer}>
                        <h3>{editingCliente ? 'Editar Concessionária' : 'Cadastrar Nova Concessionária'}</h3>
                        <form onSubmit={handleSubmit} className={styles.form}>
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Nome Fantasia</label>
                                    <input
                                        type="text"
                                        value={formData.nome}
                                        onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                        className={styles.formInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Razão Social</label>
                                    <input
                                        type="text"
                                        value={formData.razaoSocial}
                                        onChange={(e) => setFormData({ ...formData, razaoSocial: e.target.value })}
                                        className={styles.formInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Marca representada</label>
                                    <select
                                        value={formData.marcaId}
                                        onChange={(e) => setFormData({ ...formData, marcaId: e.target.value })}
                                        className={styles.formInput}
                                    >
                                        <option value="">Selecionar marca</option>
                                        {marcas.map((marca) => (
                                            <option key={marca.id} value={marca.id}>{marca.nome}</option>
                                        ))}
                                    </select>
                                    {marcas.length === 0 && (
                                        <small className={styles.formHelper}>Cadastre marcas na aba Catálogo para vincular aqui.</small>
                                    )}
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <MaskedInput
                                        name="cnpj"
                                        label="CNPJ"
                                        value={formData.cnpj}
                                        onChange={(value) => setFormData((prev) => ({ ...prev, cnpj: value }))}
                                        mask="cnpj"
                                        placeholder="00.000.000/0000-00"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Inscrição Estadual</label>
                                    <input
                                        type="text"
                                        value={formData.inscricaoEstadual}
                                        onChange={(e) => setFormData({ ...formData, inscricaoEstadual: e.target.value })}
                                        className={styles.formInput}
                                        placeholder="000.000.000.000"
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <MaskedInput
                                        name="telefone"
                                        label="Telefone"
                                        value={formData.telefone}
                                        onChange={(value) => setFormData((prev) => ({ ...prev, telefone: value }))}
                                        mask="phone"
                                        placeholder="(11)99999-9999"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <MaskedInput
                                        name="celular"
                                        label="Celular"
                                        value={formData.celular}
                                        onChange={(value) => setFormData((prev) => ({ ...prev, celular: value }))}
                                        mask="phone"
                                        placeholder="(11)99999-9999"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Contato</label>
                                    <input
                                        type="text"
                                        value={formData.contato}
                                        onChange={(e) => setFormData({ ...formData, contato: e.target.value })}
                                        className={styles.formInput}
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>E-mail</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        className={styles.formInput}
                                        placeholder="contato@empresa.com.br"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Nome do Responsável</label>
                                    <input
                                        type="text"
                                        value={formData.nomeResponsavel}
                                        onChange={(e) => setFormData({ ...formData, nomeResponsavel: e.target.value })}
                                        className={styles.formInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <MaskedInput
                                        name="telefoneResponsavel"
                                        label="Telefone do Responsável"
                                        value={formData.telefoneResponsavel}
                                        onChange={(value) => setFormData((prev) => ({ ...prev, telefoneResponsavel: value }))}
                                        mask="phone"
                                        placeholder="(11)99999-9999"
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>E-mail do Responsável</label>
                                    <input
                                        type="email"
                                        value={formData.emailResponsavel}
                                        onChange={(e) => setFormData({ ...formData, emailResponsavel: e.target.value })}
                                        className={styles.formInput}
                                        placeholder="responsavel@empresa.com.br"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Status</label>
                                    <select
                                        value={formData.ativo ? 'true' : 'false'}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, ativo: e.target.value === 'true' }))}
                                        className={styles.formInput}
                                    >
                                        <option value="true">Ativa</option>
                                        <option value="false">Inativa</option>
                                    </select>
                                </div>
                            </div>
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Operador Responsável</label>
                                    <select
                                        value={formData.operadorId}
                                        onChange={(e) => setFormData({ ...formData, operadorId: e.target.value })}
                                        className={styles.formInput}
                                    >
                                        <option value="">Selecione um operador (obrigatório se gerido por um)</option>
                                        {operadores.map(op => (
                                            <option key={op._id} value={op._id}>{op.displayName || op.email}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <MaskedInput
                                        name="cep"
                                        label="CEP"
                                        value={formData.cep}
                                        onChange={handleCepChange}
                                        mask="cep"
                                        placeholder="00000-000"
                                    />
                                    {isFetchingCep && (
                                        <small className={styles.formHelper}>Buscando CEP...</small>
                                    )}
                                    {cepError && (
                                        <small className={styles.errorText}>{cepError}</small>
                                    )}
                                    {!isFetchingCep && !cepError && formData.cep.length === 8 && (
                                        <small className={styles.formHelper}>Endereço preenchido automaticamente. Confirme os dados.</small>
                                    )}
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Número</label>
                                    <input
                                        type="text"
                                        value={formData.numero}
                                        onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                                        className={styles.formInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Complemento</label>
                                    <input
                                        type="text"
                                        value={formData.complemento}
                                        onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                                        className={styles.formInput}
                                        placeholder="Opcional"
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Endereço</label>
                                    <input
                                        type="text"
                                        value={formData.endereco}
                                        onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                                        className={styles.formInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Bairro</label>
                                    <input
                                        type="text"
                                        value={formData.bairro}
                                        onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                                        className={styles.formInput}
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Cidade</label>
                                    <input
                                        type="text"
                                        value={formData.cidade}
                                        onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                                        className={styles.formInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>UF</label>
                                    <select
                                        value={formData.uf}
                                        onChange={(e) => setFormData({ ...formData, uf: e.target.value })}
                                        className={styles.formInput}
                                    >

                                        <option value="">Selecione</option>
                                        <option value="AC">AC</option>
                                        <option value="AL">AL</option>
                                        <option value="AM">AM</option>
                                        <option value="AP">AP</option>
                                        <option value="BA">BA</option>
                                        <option value="CE">CE</option>
                                        <option value="DF">DF</option>
                                        <option value="ES">ES</option>
                                        <option value="GO">GO</option>
                                        <option value="MA">MA</option>
                                        <option value="MG">MG</option>
                                        <option value="MS">MS</option>
                                        <option value="MT">MT</option>
                                        <option value="PA">PA</option>
                                        <option value="PB">PB</option>
                                        <option value="PE">PE</option>
                                        <option value="PI">PI</option>
                                        <option value="PR">PR</option>
                                        <option value="RJ">RJ</option>
                                        <option value="RN">RN</option>
                                        <option value="RO">RO</option>
                                        <option value="RR">RR</option>
                                        <option value="RS">RS</option>
                                        <option value="SC">SC</option>
                                        <option value="SE">SE</option>
                                        <option value="SP">SP</option>
                                        <option value="TO">TO</option>
                                    </select>
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={`${styles.formGroup} ${styles.formGroupFull}`}>
                                    <label>Observações</label>
                                    <textarea
                                        value={formData.observacoes}
                                        onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                                        className={styles.textArea}
                                        rows={3}
                                        placeholder="Informações adicionais, acordos comerciais ou notas internas"
                                    />
                                </div>
                            </div>

                            <div className={styles.formActions}>
                                <button type="button" onClick={cancelEdit} className={styles.cancelBtn}>
                                    Cancelar
                                </button>
                                <button type="submit" className={styles.submitBtn} disabled={submitting}>
                                    {submitting ? 'Salvando...' : editingCliente ? 'Atualizar' : 'Cadastrar'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className={styles.searchSection}>
                <div className={styles.searchContainer}>
                    <input
                        type="text"
                        placeholder="Buscar por nome, razão social, marca, responsável, CNPJ ou cidade..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={styles.searchInput}
                    />
                    {searchTerm && (
                        <button className={styles.clearButton} onClick={handleClearSearch}>
                            ✕
                        </button>
                    )}
                </div>
            </div>

            <div className={styles.resultsSection}>
                <div className={styles.resultsHeader}>
                    <h3>Resultados ({filteredClientes.length})</h3>
                    <span className={styles.resultsMeta}>
                        {clientes.length > 0
                            ? `Exibindo ${filteredClientes.length} de ${clientes.length} registros`
                            : 'Nenhuma concessionária cadastrada'}
                    </span>
                </div>

                {errorMessage ? (
                    <div className={styles.noResultsMessage}>{errorMessage}</div>
                ) : loadingClientes ? (
                    <div className={styles.noResultsMessage}>Carregando concessionárias...</div>
                ) : (
                    <div className={styles.tableContainer}>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th className={styles.tableHeader}>NOME / RAZÃO SOCIAL</th>
                                    <th className={styles.tableHeader}>MARCA</th>
                                    <th className={styles.tableHeader}>VEÍCULOS</th>
                                    <th className={styles.tableHeader}>ATUALIZAÇÃO</th>
                                    <th className={styles.tableHeader}>CONTATO PRINCIPAL</th>
                                    <th className={styles.tableHeader}>RESPONSÁVEL</th>
                                    <th className={styles.tableHeader}>CNPJ</th>
                                    <th className={styles.tableHeader}>ENDEREÇO</th>
                                    <th className={styles.tableHeader}>STATUS</th>
                                    <th className={styles.tableHeader}>AÇÕES</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredClientes.length === 0 ? (
                                    <tr className={styles.tableRow}>
                                        <td className={styles.emptyStateCell} colSpan={10}>
                                            {searchTerm ? 'Nenhuma concessionária encontrada.' : 'Nenhuma concessionária cadastrada.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredClientes.map((cliente) => (
                                        <tr key={cliente.id} className={styles.tableRow}>
                                            <td className={styles.tableCell}>
                                                <strong>{cliente.nome}</strong>
                                                <div className={styles.tableSubtext}>{cliente.razaoSocial}</div>
                                            </td>
                                            <td className={styles.tableCell}>
                                                <span className={cliente.marca ? styles.brandBadge : styles.brandBadgeMuted}>
                                                    {cliente.marca || 'Sem marca'}
                                                </span>
                                            </td>
                                            <td className={styles.tableCell}>
                                                <div className={styles.vehicleCount}>
                                                    <div className={styles.vehicleBar} style={{ width: `${Math.min((cliente.totalVeiculos || 0) * 2, 100)}%` }}></div>
                                                    <span>{cliente.totalVeiculos || 0}</span>
                                                </div>
                                            </td>
                                            <td className={styles.tableCell}>
                                                <div className={styles.updateStatus}>
                                                    <div className={`${styles.trafficLight} ${styles[getStatusColor(cliente.ultimaAtualizacao)]}`}></div>
                                                    <span>{getDaysSinceUpdate(cliente.ultimaAtualizacao)}</span>
                                                </div>
                                            </td>
                                            <td className={styles.tableCell}>
                                                <div className={styles.tableSubtextStrong}>{cliente.contato}</div>
                                                <div className={styles.tableSubtext}>{formatPhoneDisplay(cliente.telefone)}</div>
                                                {cliente.celular && (
                                                    <div className={styles.tableSubtext}>{formatPhoneDisplay(cliente.celular)}</div>
                                                )}
                                                <div className={styles.tableSubtext}>{cliente.email}</div>
                                            </td>
                                            <td className={styles.tableCell}>
                                                <select
                                                    className={styles.inlineSelect}
                                                    value={getOperadorIdForCliente(cliente)}
                                                    onChange={async (e) => {
                                                        const newOpId = e.target.value;
                                                        try {
                                                            await ConcessionariaService.updateConcessionaria(cliente.id, { operadorId: newOpId });
                                                            await fetchClientes();
                                                        } catch (err) {
                                                            console.error('Erro ao atualizar operador:', err);
                                                            alert('Erro ao atualizar operador');
                                                        }
                                                    }}
                                                >
                                                    <option value="">— Sem operador —</option>
                                                    {operadores.map(op => (
                                                        <option key={op._id} value={op._id}>{op.displayName || op.email}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className={styles.tableCell}>{formatCnpjDisplay(cliente.cnpj)}</td>
                                            <td className={styles.tableCell}>{composeEnderecoDisplay(cliente)}</td>
                                            <td className={styles.tableCell}>
                                                <span className={`${styles.statusBadge} ${cliente.ativo === false ? styles.statusInactive : styles.statusActive}`}>
                                                    {cliente.ativo === false ? 'Inativa' : 'Ativa'}
                                                </span>
                                                <div className={styles.tableSubtext}>{formatDate(cliente.dataCadastro ?? cliente.criadoEm)}</div>
                                            </td>
                                            <td className={styles.tableCell}>
                                                <div className={styles.actionButtons}>
                                                    <button
                                                        className={styles.editButton}
                                                        onClick={() => handleEdit(cliente)}
                                                        title="Editar"
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        className={styles.associateButton}
                                                        onClick={() => handleOpenAssociateModal(cliente)}
                                                        title="Associar Veículos"
                                                    >
                                                        🔗
                                                    </button>
                                                    <button
                                                        className={styles.deleteButton}
                                                        onClick={() => handleDelete(cliente.id)}
                                                        title="Excluir"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de Associação de Veículos */}
            {showAssociateModal && selectedConcessionariaForAssociate && (
                <div className={styles.modalOverlay} onClick={handleCloseAssociateModal}>
                    <div className={styles.modalContent} onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '80vh', overflow: 'auto' }}>
                        <div className={styles.modalHeader}>
                            <h2>🔗 Associar Veículos</h2>
                            <button className={styles.closeButton} onClick={handleCloseAssociateModal}>×</button>
                        </div>
                        <div className={styles.modalBody}>
                            <p style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>
                                <strong>Concessionária:</strong> {selectedConcessionariaForAssociate.nome}
                            </p>
                            <p style={{ marginBottom: '1rem', color: '#666' }}>
                                Selecione os veículos sem concessionária para associar:
                            </p>

                            {loadingVehicles ? (
                                <p>Carregando veículos...</p>
                            ) : vehiclesWithoutConcessionaria.length === 0 ? (
                                <p style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
                                    Não há veículos sem concessionária associada.
                                </p>
                            ) : (
                                <>
                                    <div style={{ marginBottom: '1rem' }}>
                                        <input
                                            type="text"
                                            placeholder="Filtrar por modelo ou contato..."
                                            value={vehicleFilter}
                                            onChange={(e) => setVehicleFilter(e.target.value)}
                                            className={styles.filterInput}
                                            style={{
                                                width: '100%',
                                                padding: '0.75rem',
                                                border: '1px solid var(--color-highlight)',
                                                borderRadius: '8px',
                                                fontSize: '0.95rem',
                                                marginBottom: '1rem'
                                            }}
                                        />
                                    </div>
                                    <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <button
                                            onClick={() => setSelectedVehicles(vehiclesWithoutConcessionaria.filter(v => {
                                                const searchTerm = vehicleFilter.toLowerCase();
                                                return v.modelo?.toLowerCase().includes(searchTerm) || v.nomeContato?.toLowerCase().includes(searchTerm);
                                            }).map(v => v.id))}
                                            className={styles.selectAllButton}
                                        >
                                            ✓ Selecionar Todos
                                        </button>
                                        <button
                                            onClick={() => setSelectedVehicles([])}
                                            className={styles.clearSelectionButton}
                                        >
                                            ✕ Limpar Seleção
                                        </button>
                                        <span style={{ marginLeft: 'auto', fontWeight: 'bold', color: 'var(--color-text)' }}>
                                            {selectedVehicles.length} selecionado(s)
                                        </span>
                                    </div>

                                    <table className={styles.table} style={{ fontSize: '0.9rem' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: '50px' }}>✓</th>
                                                <th onClick={() => handleSort('modelo')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                                    MODELO {sortColumn === 'modelo' && (sortDirection === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th onClick={() => handleSort('ano')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                                    ANO {sortColumn === 'ano' && (sortDirection === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th onClick={() => handleSort('cor')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                                    COR {sortColumn === 'cor' && (sortDirection === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th onClick={() => handleSort('combustivel')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                                    COMBUSTÍVEL {sortColumn === 'combustivel' && (sortDirection === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th onClick={() => handleSort('cidade')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                                    CIDADE {sortColumn === 'cidade' && (sortDirection === 'asc' ? '↑' : '↓')}
                                                </th>
                                                <th onClick={() => handleSort('nomeContato')} style={{ cursor: 'pointer', userSelect: 'none' }}>
                                                    CONTATO {sortColumn === 'nomeContato' && (sortDirection === 'asc' ? '↑' : '↓')}
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {vehiclesWithoutConcessionaria
                                                .filter(vehicle => {
                                                    if (!vehicleFilter) return true;
                                                    const searchTerm = vehicleFilter.toLowerCase();
                                                    return vehicle.modelo?.toLowerCase().includes(searchTerm) ||
                                                        vehicle.nomeContato?.toLowerCase().includes(searchTerm);
                                                })
                                                .sort((a, b) => {
                                                    if (!sortColumn) return 0;
                                                    const aValue = a[sortColumn] || '';
                                                    const bValue = b[sortColumn] || '';
                                                    const comparison = aValue.toString().localeCompare(bValue.toString(), 'pt-BR', { numeric: true });
                                                    return sortDirection === 'asc' ? comparison : -comparison;
                                                })
                                                .map((vehicle) => (
                                                    <tr key={vehicle.id} className={styles.tableRow}>
                                                        <td className={styles.tableCell} style={{ textAlign: 'center' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedVehicles.includes(vehicle.id)}
                                                                onChange={() => handleToggleVehicle(vehicle.id)}
                                                            />
                                                        </td>
                                                        <td className={styles.tableCell}>{vehicle.modelo}</td>
                                                        <td className={styles.tableCell}>{vehicle.ano}</td>
                                                        <td className={styles.tableCell}>{vehicle.cor}</td>
                                                        <td className={styles.tableCell}>{vehicle.combustivel}</td>
                                                        <td className={styles.tableCell}>{vehicle.cidade} - {vehicle.estado}</td>
                                                        <td className={styles.tableCell}>
                                                            <div>{vehicle.nomeContato}</div>
                                                            {vehicle.telefone && (
                                                                <div style={{ fontSize: '0.85rem', color: '#666' }}>{vehicle.telefone}</div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                        </tbody>
                                    </table>
                                </>
                            )}
                        </div>
                        <div className={styles.modalFooter}>
                            <button
                                type="button"
                                onClick={handleCloseAssociateModal}
                                className={styles.cancelButton}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleAssociateVehicles}
                                className={styles.submitButton}
                                disabled={selectedVehicles.length === 0}
                                style={{ opacity: selectedVehicles.length === 0 ? 0.5 : 1 }}
                            >
                                Associar {selectedVehicles.length > 0 && `(${selectedVehicles.length})`}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
