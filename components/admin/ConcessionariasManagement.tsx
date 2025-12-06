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
    dataCadastro?: string | null;
    criadoEm?: string | null;
    atualizadoEm?: string | null;
    totalVeiculos?: number;
    ultimaAtualizacao?: string | null;
}

type ClienteFormData = {
    nome: string;
    razaoSocial: string;
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
};

const createEmptyClienteForm = (): ClienteFormData => ({
    nome: '',
    razaoSocial: '',
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
    ativo: true
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

    useEffect(() => {
        fetchClientes();
    }, [fetchClientes]);

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
            const cnpjDigits = cliente.cnpj?.replace(/\D/g, '') ?? '';
            const cepDigits = cliente.cep?.replace(/\D/g, '') ?? '';
            const telefoneResponsavel = cliente.telefoneResponsavel?.replace(/\D/g, '') ?? '';

            return (
                nome.includes(normalized) ||
                razaoSocial.includes(normalized) ||
                contato.includes(normalized) ||
                cidade.includes(normalized) ||
                bairro.includes(normalized) ||
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
            if (editingCliente && editingCliente.id) {
                await ConcessionariaService.updateConcessionaria(editingCliente.id, payload);
            } else {
                await ConcessionariaService.addConcessionaria(payload);
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
            ativo: cliente.ativo ?? true
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
                                        <option value="SP">SP</option>
                                        <option value="RJ">RJ</option>
                                        <option value="MG">MG</option>
                                        <option value="PR">PR</option>
                                        <option value="SC">SC</option>
                                        <option value="RS">RS</option>
                                        <option value="BA">BA</option>
                                        <option value="GO">GO</option>
                                        <option value="PE">PE</option>
                                        <option value="CE">CE</option>
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
                        placeholder="Buscar por nome, razão social, responsável, CNPJ ou cidade..."
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
                                    <th className={styles.tableHeader}>VEÍCULOS</th>
                                    <th className={styles.tableHeader}>ATUALIZAÇÃO</th>
                                    <th className={styles.tableHeader}>CONTATO PRINCIPAL</th>
                                    <th className={styles.tableHeader}>RESPONSÁVEL</th>
                                    <th className={styles.tableHeader}>CNPJ</th>
                                    <th className={styles.tableHeader}>CEP</th>
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
                                                <div className={styles.tableSubtextStrong}>{cliente.nomeResponsavel}</div>
                                                <div className={styles.tableSubtext}>{formatPhoneDisplay(cliente.telefoneResponsavel)}</div>
                                                {cliente.emailResponsavel && (
                                                    <div className={styles.tableSubtext}>{cliente.emailResponsavel}</div>
                                                )}
                                            </td>
                                            <td className={styles.tableCell}>{formatCnpjDisplay(cliente.cnpj)}</td>
                                            <td className={styles.tableCell}>{formatCepDisplay(cliente.cep)}</td>
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
        </div>
    );
}
