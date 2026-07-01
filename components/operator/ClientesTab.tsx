import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MaskedInput } from './MaskedInput';
import { ConcessionariaService } from '../../lib/services/concessionariaService';
import styles from '../../app/dashboard/operator/operator.module.css';
import transportStyles from './VehicleConsultation.module.css';

export interface ClienteData {
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
}

export type ClienteFormData = {
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

export const createEmptyClienteForm = (): ClienteFormData => ({
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

export function ClientesTab() {
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

    const resetForm = () => {
        setFormData(createEmptyClienteForm());
        setCepError(null);
        setIsFetchingCep(false);
        lastCepRef.current = '';
    };

    const parseErrorMessage = useCallback(async (response: Response) => {
        try {
            const data = await response.json();
            return data?.error || response.statusText;
        } catch {
            return response.statusText;
        }
    }, []);

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
            alert('Erro ao salvar concessionária. Tente novamente.');
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
        <div className={transportStyles.container}>
            <div className={transportStyles.header}>
                <h2>Gestão de Concessionárias</h2>
                <div className={transportStyles.headerActions}>
                    <button
                        className={transportStyles.addButton}
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
                <div className={`${transportStyles.inlineFormWrapper ?? ''} ${styles.clienteFormWrapper}`}>
                    <div className={styles.clienteFormContainer}>
                        <h3>{editingCliente ? 'Editar Concessionária' : 'Cadastrar Nova Concessionária'}</h3>
                        <form onSubmit={handleSubmit} className={styles.clienteForm}>
                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Nome Fantasia *</label>
                                    <input
                                        type="text"
                                        value={formData.nome}
                                        onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Razão Social *</label>
                                    <input
                                        type="text"
                                        value={formData.razaoSocial}
                                        onChange={(e) => setFormData({ ...formData, razaoSocial: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <MaskedInput
                                        name="cnpj"
                                        label="CNPJ *"
                                        value={formData.cnpj}
                                        onChange={(value) => setFormData((prev) => ({ ...prev, cnpj: value }))}
                                        mask="cnpj"
                                        required
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
                                        label="Telefone *"
                                        value={formData.telefone}
                                        onChange={(value) => setFormData((prev) => ({ ...prev, telefone: value }))}
                                        mask="phone"
                                        required
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
                                    <label>Contato *</label>
                                    <input
                                        type="text"
                                        value={formData.contato}
                                        onChange={(e) => setFormData({ ...formData, contato: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>E-mail *</label>
                                    <input
                                        type="email"
                                        value={formData.email}
                                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                        required
                                        className={styles.formInput}
                                        placeholder="contato@empresa.com.br"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Nome do Responsável *</label>
                                    <input
                                        type="text"
                                        value={formData.nomeResponsavel}
                                        onChange={(e) => setFormData({ ...formData, nomeResponsavel: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <MaskedInput
                                        name="telefoneResponsavel"
                                        label="Telefone do Responsável *"
                                        value={formData.telefoneResponsavel}
                                        onChange={(value) => setFormData((prev) => ({ ...prev, telefoneResponsavel: value }))}
                                        mask="phone"
                                        required
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
                                    <label>Status *</label>
                                    <select
                                        value={formData.ativo ? 'true' : 'false'}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, ativo: e.target.value === 'true' }))}
                                        required
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
                                        label="CEP *"
                                        value={formData.cep}
                                        onChange={handleCepChange}
                                        mask="cep"
                                        required
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
                                    <label>Número *</label>
                                    <input
                                        type="text"
                                        value={formData.numero}
                                        onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                                        required
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
                                    <label>Endereço *</label>
                                    <input
                                        type="text"
                                        value={formData.endereco}
                                        onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Bairro *</label>
                                    <input
                                        type="text"
                                        value={formData.bairro}
                                        onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    />
                                </div>
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Cidade *</label>
                                    <input
                                        type="text"
                                        value={formData.cidade}
                                        onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                                        required
                                        className={styles.formInput}
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>UF *</label>
                                    <select
                                        value={formData.uf}
                                        onChange={(e) => setFormData({ ...formData, uf: e.target.value })}
                                        required
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

            <div className={transportStyles.searchSection}>
                <div className={transportStyles.searchContainer}>
                    <input
                        type="text"
                        placeholder="Buscar por nome, razão social, responsável, CNPJ ou cidade..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={transportStyles.searchInput}
                    />
                    {searchTerm && (
                        <button className={transportStyles.clearButton} onClick={handleClearSearch}>
                            ✕
                        </button>
                    )}
                </div>
            </div>

            <div className={transportStyles.resultsSection}>
                <div className={transportStyles.resultsHeader}>
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
                    <div className={transportStyles.tableContainer}>
                        <table className={transportStyles.table}>
                            <thead>
                                <tr>
                                    <th className={transportStyles.tableHeader}>NOME / RAZÃO SOCIAL</th>
                                    <th className={transportStyles.tableHeader}>CONTATO PRINCIPAL</th>
                                    <th className={transportStyles.tableHeader}>RESPONSÁVEL</th>
                                    <th className={transportStyles.tableHeader}>CNPJ</th>
                                    <th className={transportStyles.tableHeader}>CEP</th>
                                    <th className={transportStyles.tableHeader}>ENDEREÇO</th>
                                    <th className={transportStyles.tableHeader}>STATUS</th>
                                    <th className={transportStyles.tableHeader}>AÇÕES</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredClientes.length === 0 ? (
                                    <tr className={transportStyles.tableRow}>
                                        <td className={styles.emptyStateCell} colSpan={8}>
                                            {searchTerm ? 'Nenhuma concessionária encontrada.' : 'Nenhuma concessionária cadastrada.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredClientes.map((cliente) => (
                                        <tr key={cliente.id} className={transportStyles.tableRow}>
                                            <td className={`${transportStyles.tableCell} ${styles.tableCellMulti}`}>
                                                <strong>{cliente.nome}</strong>
                                                <div className={styles.tableSubtext}>{cliente.razaoSocial}</div>
                                            </td>
                                            <td className={`${transportStyles.tableCell} ${styles.tableCellMulti}`}>
                                                <div className={styles.tableSubtextStrong}>{cliente.contato}</div>
                                                <div className={styles.tableSubtext}>{formatPhoneDisplay(cliente.telefone)}</div>
                                                {cliente.celular && (
                                                    <div className={styles.tableSubtext}>{formatPhoneDisplay(cliente.celular)}</div>
                                                )}
                                                <div className={styles.tableSubtext}>{cliente.email}</div>
                                            </td>
                                            <td className={`${transportStyles.tableCell} ${styles.tableCellMulti}`}>
                                                <div className={styles.tableSubtextStrong}>{cliente.nomeResponsavel}</div>
                                                <div className={styles.tableSubtext}>{formatPhoneDisplay(cliente.telefoneResponsavel)}</div>
                                                {cliente.emailResponsavel && (
                                                    <div className={styles.tableSubtext}>{cliente.emailResponsavel}</div>
                                                )}
                                            </td>
                                            <td className={transportStyles.tableCell}>{formatCnpjDisplay(cliente.cnpj)}</td>
                                            <td className={transportStyles.tableCell}>{formatCepDisplay(cliente.cep)}</td>
                                            <td className={`${transportStyles.tableCell} ${styles.tableCellMulti}`}>{composeEnderecoDisplay(cliente)}</td>
                                            <td className={transportStyles.tableCell}>
                                                <span className={`${transportStyles.statusBadge} ${cliente.ativo === false ? transportStyles.statusInactive : transportStyles.statusActive}`}>
                                                    {cliente.ativo === false ? 'Inativa' : 'Ativa'}
                                                </span>
                                                <div className={styles.tableSubtext}>{formatDate(cliente.dataCadastro ?? cliente.criadoEm)}</div>
                                            </td>
                                            <td className={transportStyles.tableCell}>
                                                <div className={transportStyles.actionButtons}>
                                                    <button
                                                        className={transportStyles.editButton}
                                                        onClick={() => handleEdit(cliente)}
                                                        title="Editar"
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        className={transportStyles.deleteButton}
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
