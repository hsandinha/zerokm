'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { MaskedInput } from '../../components/operator/MaskedInput';
import { ConcessionariaService } from '../../lib/services/concessionariaService';
import styles from './ConcessionariasManagement.module.css';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { AlertTriangle, BadgeCheck, Building2, CarFront, ChevronDown, Link2, Pencil, Plus, RefreshCw, Search, Trash2, UserRoundX } from 'lucide-react';
import {
    Avatar, Button, EmptyState, IconAction, Page, PageHeader, Panel, PanelFooter, PanelToolbar, PrimaryCell, RowActions,
    SearchField, Segmented, ShowingCount, SkeletonRows, SortHeader, StatCard, StatGrid, StatusBadge, TwoLine, nextSort, pageStyles,
    type BadgeTone, type SortDirection,
} from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';
import { PlanoRepasseCard } from '@/components/dealership/PlanoRepasseCard';

type Segmento = 'todas' | 'ativas' | 'repasse' | 'sem-repasse' | 'desatualizadas' | 'inativas';
type ColunaVeiculo = 'modelo' | 'ano' | 'cor' | 'combustivel' | 'cidade' | 'nomeContato';

// Interfaces para Concessionária
interface ClienteData {
    id: string;
    nome: string;
    razaoSocial: string;
    marcaId?: string | null;
    marca?: string | null;
    marcaIds?: string[];
    marcas?: string[];
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
    /** Plano que libera a loja a anunciar repasse. Ver lib/utils/planoRepasse.ts. */
    planoRepasse?: {
        ativo: boolean;
        status: string;
        planName: string | null;
        billingType: 'monthly' | 'annual' | null;
        expiresAt: string | null;
        activationMethod: string | null;
    } | null;
}

interface MarcaData {
    id: string;
    nome: string;
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
    operadorId: string;
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
    ativo: true,
    operadorId: ''
});

/**
 * Quem está usando a tela. Admin, gerente e administrativo gerenciam tudo; o operador
 * edita as marcas da loja; o vendedor só consulta marcas e operador (a API de marcas
 * também recusa o vendedor).
 */
type PerfilTela = 'admin' | 'operador' | 'vendedor';

export function ConcessionariasManagement({ perfil = 'admin' }: { perfil?: PerfilTela } = {}) {
    const podeEditarMarcas = perfil !== 'vendedor';
    const podeTrocarOperador = perfil === 'admin';
    const podeAssociarVeiculos = perfil === 'admin';
    // A rota PATCH do plano só aceita administrador — o gerente e o vendedor
    // enxergam a situação, mas não ativam nem desativam.
    const podeGerirRepasse = perfil === 'admin';
    const [clienteDoPlano, setClienteDoPlano] = useState<ClienteData | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [segmento, setSegmento] = useState<Segmento>('todas');
    const { confirm, notify, feedback } = useFeedback();
    const [showForm, setShowForm] = useState(false);
    const [clientes, setClientes] = useState<ClienteData[]>([]);
    const [filteredClientes, setFilteredClientes] = useState<ClienteData[]>([]);
    const [editingCliente, setEditingCliente] = useState<ClienteData | null>(null);
    const [formData, setFormData] = useState<ClienteFormData>(createEmptyClienteForm());
    const [loadingClientes, setLoadingClientes] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [formError, setFormError] = useState<string | null>(null);
    const [isFetchingCep, setIsFetchingCep] = useState(false);
    const [cepError, setCepError] = useState<string | null>(null);
    const lastCepRef = useRef<string>('');
    const [showAssociateModal, setShowAssociateModal] = useState(false);
    const [selectedConcessionariaForAssociate, setSelectedConcessionariaForAssociate] = useState<ClienteData | null>(null);
    const [vehiclesWithoutConcessionaria, setVehiclesWithoutConcessionaria] = useState<any[]>([]);
    const [loadingVehicles, setLoadingVehicles] = useState(false);
    const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
    const [vehicleFilter, setVehicleFilter] = useState('');
    const [vehicleSort, setVehicleSort] = useState<{ column: ColunaVeiculo | null; direction: SortDirection }>({ column: null, direction: 'asc' });
    const [operadores, setOperadores] = useState<{_id: string, displayName: string, email: string}[]>([]);
    const [marcas, setMarcas] = useState<MarcaData[]>([]);
    const [openBrandMenuId, setOpenBrandMenuId] = useState<string | null>(null);
    const [brandSearch, setBrandSearch] = useState('');
    // O menu de marcas fica fixo na tela: dentro da tabela (overflow) ele seria cortado nas últimas linhas.
    const [brandMenuPos, setBrandMenuPos] = useState<{ top: number; left: number } | null>(null);

    // Marcas selecionadas de uma concessionária (com fallback ao formato antigo de marca única).
    const getSelectedBrandIds = (cliente: ClienteData): string[] => {
        if (cliente.marcaIds && cliente.marcaIds.length) return cliente.marcaIds;
        return cliente.marcaId ? [cliente.marcaId] : [];
    };

    const getSelectedBrandNames = (cliente: ClienteData): string[] => {
        if (cliente.marcas && cliente.marcas.length) return cliente.marcas;
        return cliente.marca ? [cliente.marca] : [];
    };

    // Atualiza as marcas de uma concessionária localmente (otimista, sem recarregar a lista toda).
    const applyBrandsLocally = (clienteId: string, marcaIds: string[]) => {
        const nomes = marcaIds
            .map(id => marcas.find(m => m.id === id)?.nome)
            .filter((nome): nome is string => Boolean(nome));
        setClientes(prev => prev.map(c => c.id === clienteId
            ? { ...c, marcaIds, marcas: nomes, marcaId: marcaIds[0] ?? null, marca: nomes[0] ?? null }
            : c));
    };

    const handleToggleBrand = async (cliente: ClienteData, marcaId: string) => {
        const current = getSelectedBrandIds(cliente);
        const next = current.includes(marcaId)
            ? current.filter(id => id !== marcaId)
            : [...current, marcaId];

        applyBrandsLocally(cliente.id, next);

        try {
            const response = await fetch(`/api/concessionarias/${cliente.id}/catalog-brand`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ marcaIds: next }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'Erro ao atualizar marcas');
            }
        } catch (error) {
            console.error('Erro ao atualizar marcas:', error);
            applyBrandsLocally(cliente.id, current); // reverte
            notify('Não foi possível atualizar as marcas. A seleção anterior foi mantida.');
        }
    };

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

    /** Dias desde a última atualização do estoque (null = nunca enviou). */
    const diasSemAtualizar = (dateString?: string | null) => {
        if (!dateString) return null;
        const date = new Date(dateString);
        if (Number.isNaN(date.getTime())) return null;
        return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
    };

    /** Semáforo do estoque: até 15 dias em dia, até 30 atenção, depois desatualizado. */
    const atualizacao = (dateString?: string | null): { tone: BadgeTone; label: string } => {
        const dias = diasSemAtualizar(dateString);
        if (dias === null) return { tone: 'negative', label: 'Sem envio' };
        const label = dias === 0 ? 'Hoje' : dias === 1 ? 'Ontem' : `Há ${dias} dias`;
        if (dias <= 15) return { tone: 'positive', label };
        if (dias <= 30) return { tone: 'warning', label };
        return { tone: 'negative', label };
    };

    const resetForm = () => {
        setFormData(createEmptyClienteForm());
        setCepError(null);
        setIsFetchingCep(false);
        setFormError(null);
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

    const handleSortVehicles = (column: ColunaVeiculo) => setVehicleSort(atual => nextSort(atual, column));

    const handleOpenAssociateModal = (cliente: ClienteData) => {
        setSelectedConcessionariaForAssociate(cliente);
        setVehicleFilter('');
        setVehicleSort({ column: null, direction: 'asc' });
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
                const n = selectedVehicles.length;
                notify(`${n} ${n === 1 ? 'veículo associado' : 'veículos associados'} a ${selectedConcessionariaForAssociate.nome}.`, 'positive');
                handleCloseAssociateModal();
                fetchClientes();
            } else {
                notify('Não foi possível associar os veículos. Tente de novo.');
            }
        } catch (error) {
            console.error('Erro ao associar veículos:', error);
            notify('Falha de conexão ao associar os veículos.');
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

    useEffect(() => {
        if (!openBrandMenuId) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (!target.closest(`.${styles.brandCell}`)) {
                setOpenBrandMenuId(null);
                setBrandSearch('');
            }
        };
        const fecharAoRolar = (event: Event) => {
            if ((event.target as HTMLElement | null)?.closest?.(`.${styles.brandMenu}`)) return;
            setOpenBrandMenuId(null);
        };
        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', fecharAoRolar, true);
        window.addEventListener('resize', fecharAoRolar);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', fecharAoRolar, true);
            window.removeEventListener('resize', fecharAoRolar);
        };
    }, [openBrandMenuId]);


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
        setFormError(null);

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
            setFormError(message);
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
            ativo: cliente.ativo ?? true,
            operadorId: cliente.operadorId ?? ''
        });
        setCepError(null);
        setIsFetchingCep(false);
        setFormError(null);
        lastCepRef.current = '';
        setEditingCliente(cliente);
        setShowForm(true);
    };

    const handleDelete = async (cliente: ClienteData) => {
        const ok = await confirm({
            title: 'Excluir concessionária',
            description: <>A <strong>{cliente.nome}</strong> sai da lista e do vínculo com a equipe. Os veículos dela ficam sem concessionária associada. Para só pausar, edite e marque como inativa.</>,
            confirmLabel: 'Excluir concessionária',
            danger: true,
        });
        if (!ok) return;

        try {
            await ConcessionariaService.deleteConcessionaria(cliente.id);
            notify('Concessionária excluída.', 'positive');
            await fetchClientes();
        } catch (error) {
            console.error('Erro ao excluir concessionária:', error);
            notify('Não foi possível excluir a concessionária. Tente de novo.');
        }
    };

    const handleChangeOperador = async (cliente: ClienteData, operadorId: string) => {
        try {
            await ConcessionariaService.updateConcessionaria(cliente.id, { operadorId });
            await fetchClientes();
        } catch (err) {
            console.error('Erro ao atualizar operador:', err);
            notify('Não foi possível trocar o operador responsável.');
        }
    };

    const openCreateForm = () => {
        resetForm();
        setEditingCliente(null);
        setShowForm(true);
    };

    const closeForm = () => {
        if (submitting) return;
        setShowForm(false);
        setEditingCliente(null);
        resetForm();
    };

    const veiculosFiltrados = vehiclesWithoutConcessionaria
        .filter(vehicle => {
            if (!vehicleFilter) return true;
            const termo = vehicleFilter.toLowerCase();
            return vehicle.modelo?.toLowerCase().includes(termo) || vehicle.nomeContato?.toLowerCase().includes(termo);
        })
        .sort((a, b) => {
            if (!vehicleSort.column) return 0;
            const comparison = String(a[vehicleSort.column] ?? '').localeCompare(String(b[vehicleSort.column] ?? ''), 'pt-BR', { numeric: true });
            return vehicleSort.direction === 'asc' ? comparison : -comparison;
        });

    /**
     * Situação do repasse em uma linha. Distingue três estados que a loja
     * sente de forma diferente: nunca assinou, assinou e venceu (fila de
     * renovação) e está em dia.
     */
    const situacaoRepasse = (plano: ClienteData['planoRepasse']): { tone: BadgeTone; label: string; detalhe: string | null } => {
        if (plano?.ativo) {
            return {
                tone: 'positive',
                label: 'Ativo',
                detalhe: plano.expiresAt ? `até ${formatDate(plano.expiresAt)}` : null,
            };
        }
        if (plano?.expiresAt) {
            return { tone: 'negative', label: 'Vencido', detalhe: `em ${formatDate(plano.expiresAt)}` };
        }
        return { tone: 'neutral', label: 'Sem plano', detalhe: null };
    };

    const noSegmento = (c: ClienteData) => {
        if (segmento === 'ativas') return c.ativo !== false;
        if (segmento === 'repasse') return Boolean(c.planoRepasse?.ativo);
        if (segmento === 'sem-repasse') return c.ativo !== false && !c.planoRepasse?.ativo;
        if (segmento === 'inativas') return c.ativo === false;
        if (segmento === 'desatualizadas') {
            const dias = diasSemAtualizar(c.ultimaAtualizacao);
            return c.ativo !== false && (dias === null || dias > 30);
        }
        return true;
    };
    const visiveis = filteredClientes.filter(noSegmento);

    const ativas = clientes.filter(c => c.ativo !== false);
    const emDia = ativas.filter(c => { const d = diasSemAtualizar(c.ultimaAtualizacao); return d !== null && d <= 15; }).length;
    const desatualizadas = ativas.filter(c => { const d = diasSemAtualizar(c.ultimaAtualizacao); return d === null || d > 30; }).length;
    const totalVeiculos = clientes.reduce((soma, c) => soma + (c.totalVeiculos || 0), 0);
    const semOperador = ativas.filter(c => !getOperadorIdForCliente(c)).length;
    const comRepasse = clientes.filter(c => c.planoRepasse?.ativo).length;
    // Já teve plano e deixou vencer: é a fila de renovação, não o mesmo que
    // "nunca assinou".
    const repasseVencido = clientes.filter(c => !c.planoRepasse?.ativo && c.planoRepasse?.expiresAt).length;
    const carregando = loadingClientes && clientes.length === 0;

    return (
        <Page wide>
            <PageHeader
                title="Concessionárias"
                count={carregando ? null : clientes.length}
                description={perfil === 'admin' ? 'Lojas parceiras, marcas representadas, estoque enviado e operador responsável.' : 'Lojas da carteira, marcas, estoque enviado e contatos.'}
                actions={<Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={openCreateForm}>Nova concessionária</Button>}
            />

            <StatGrid>
                <StatCard label="Ativas" icon={<Building2 size={18} />} value={carregando ? '-' : ativas.length} caption={clientes.length - ativas.length === 1 ? '1 inativa' : `${clientes.length - ativas.length} inativas`} />
                <StatCard
                    label="Estoque em dia"
                    icon={<RefreshCw size={18} />}
                    value={carregando ? '-' : `${emDia} de ${ativas.length}`}
                    progress={ativas.length ? (emDia / ativas.length) * 100 : 0}
                    caption="Atualizado nos últimos 15 dias"
                />
                <StatCard label="Veículos no estoque" icon={<CarFront size={18} />} value={carregando ? '-' : totalVeiculos.toLocaleString('pt-BR')} caption="Somando todas as lojas" />
                <StatCard
                    label="Repasse ativo"
                    icon={<BadgeCheck size={18} />}
                    value={carregando ? '-' : comRepasse}
                    caption={repasseVencido ? `${repasseVencido} com plano vencido` : 'Lojas que podem anunciar repasse'}
                    tone={repasseVencido > 0 ? 'warning' : 'default'}
                />
                <StatCard
                    label="Sem operador"
                    icon={<UserRoundX size={18} />}
                    value={carregando ? '-' : semOperador}
                    tone={semOperador > 0 ? 'warning' : 'default'}
                    caption="Ativas sem responsável na equipe"
                />
            </StatGrid>

            <Panel>
                <PanelToolbar>
                    <Segmented<Segmento>
                        label="Filtrar concessionárias"
                        value={segmento}
                        onChange={setSegmento}
                        options={[
                            { value: 'todas', label: 'Todas', count: clientes.length },
                            { value: 'ativas', label: 'Ativas', count: ativas.length },
                            { value: 'repasse', label: 'Com repasse', count: comRepasse },
                            { value: 'sem-repasse', label: 'Sem repasse', count: ativas.length - comRepasse },
                            { value: 'desatualizadas', label: 'Estoque desatualizado', count: desatualizadas },
                            { value: 'inativas', label: 'Inativas', count: clientes.length - ativas.length },
                        ]}
                    />
                    <SearchField value={searchTerm} onChange={setSearchTerm} placeholder="Nome, marca, CNPJ, cidade ou responsável" />
                </PanelToolbar>

                {errorMessage && <div className={pageStyles.panelNotice}><InlineNotice>{errorMessage}</InlineNotice></div>}

                <div className={pageStyles.tableWrap}>
                    <table className={`${pageStyles.table} ${pageStyles.tableDense}`}>
                        <thead>
                            <tr>
                                <th>Concessionária</th>
                                <th>Marcas</th>
                                <th>Estoque</th>
                                <th>Repasse</th>
                                <th>Contato principal</th>
                                <th>Operador responsável</th>
                                <th>Endereço</th>
                                <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {carregando && <SkeletonRows rows={5} columns={8} />}
                            {!carregando && visiveis.map((cliente) => {
                                const selectedIds = getSelectedBrandIds(cliente);
                                const selectedNames = getSelectedBrandNames(cliente);
                                const isOpen = openBrandMenuId === cliente.id;
                                const filteredMarcas = marcas.filter(m => m.nome.toLowerCase().includes(brandSearch.toLowerCase()));
                                const semaforo = atualizacao(cliente.ultimaAtualizacao);
                                const veiculos = cliente.totalVeiculos || 0;
                                const repasse = situacaoRepasse(cliente.planoRepasse);
                                return (
                                    <tr key={cliente.id} data-inactive={cliente.ativo === false}>
                                        <td className={pageStyles.colMain}>
                                            <PrimaryCell
                                                leading={<Avatar name={cliente.nome || '?'} />}
                                                title={<>{cliente.nome}{cliente.ativo === false && <> <StatusBadge dot={false}>Inativa</StatusBadge></>}</>}
                                                subtitle={<>
                                                    {cliente.razaoSocial}
                                                    <span className={pageStyles.subLine}>CNPJ {formatCnpjDisplay(cliente.cnpj)} · desde {formatDate(cliente.dataCadastro ?? cliente.criadoEm)}</span>
                                                </>}
                                            />
                                        </td>
                                        <td>
                                            <div className={styles.brandCell}>
                                                {!podeEditarMarcas ? (
                                                    selectedNames.length > 0
                                                        ? <span className={pageStyles.badgeList}>{selectedNames.map(nome => <StatusBadge key={nome} tone="accent" dot={false}>{nome}</StatusBadge>)}</span>
                                                        : <span className={pageStyles.muted}>Sem marca</span>
                                                ) : <>
                                                <button
                                                    type="button"
                                                    className={styles.brandTrigger}
                                                    aria-expanded={isOpen}
                                                    aria-label={`Marcas de ${cliente.nome}`}
                                                    onClick={(event) => {
                                                        const r = event.currentTarget.getBoundingClientRect();
                                                        const top = r.bottom + 4 + 320 > window.innerHeight ? Math.max(8, r.top - 324) : r.bottom + 4;
                                                        setBrandMenuPos({ top, left: Math.min(r.left, window.innerWidth - 272) });
                                                        setOpenBrandMenuId(isOpen ? null : cliente.id);
                                                        setBrandSearch('');
                                                    }}
                                                >
                                                    {selectedNames.length > 0
                                                        ? <span className={pageStyles.badgeList}>{selectedNames.map(nome => <StatusBadge key={nome} tone="accent" dot={false}>{nome}</StatusBadge>)}</span>
                                                        : <span className={pageStyles.muted}>Sem marca</span>}
                                                    <ChevronDown size={14} aria-hidden="true" className={styles.brandCaret} />
                                                </button>
                                                {isOpen && brandMenuPos && (
                                                    <div className={styles.brandMenu} style={{ top: brandMenuPos.top, left: brandMenuPos.left }}>
                                                        <input
                                                            type="text"
                                                            className={styles.brandMenuSearch}
                                                            placeholder="Buscar marca"
                                                            aria-label="Buscar marca"
                                                            value={brandSearch}
                                                            onChange={(e) => setBrandSearch(e.target.value)}
                                                            autoFocus
                                                        />
                                                        <div className={styles.brandMenuList}>
                                                            {marcas.length === 0 ? (
                                                                <span className={styles.brandMenuEmpty}>Nenhuma marca disponível.</span>
                                                            ) : filteredMarcas.length === 0 ? (
                                                                <span className={styles.brandMenuEmpty}>Nenhuma marca encontrada.</span>
                                                            ) : filteredMarcas.map(marca => (
                                                                <label key={marca.id} className={styles.brandMenuItem}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={selectedIds.includes(marca.id)}
                                                                        onChange={() => handleToggleBrand(cliente, marca.id)}
                                                                    />
                                                                    <span>{marca.nome}</span>
                                                                </label>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                </>}
                                            </div>
                                        </td>
                                        <td>
                                            <TwoLine
                                                nowrap
                                                top={<strong>{veiculos.toLocaleString('pt-BR')} {veiculos === 1 ? 'veículo' : 'veículos'}</strong>}
                                                bottom={<StatusBadge tone={semaforo.tone}>{semaforo.label}</StatusBadge>}
                                            />
                                        </td>
                                        <td>
                                            {podeGerirRepasse ? (
                                                <button
                                                    type="button"
                                                    className={styles.repasseButton}
                                                    onClick={() => setClienteDoPlano(cliente)}
                                                    title={`Plano de repasse de ${cliente.nome}`}
                                                >
                                                    <TwoLine
                                                        nowrap
                                                        top={<StatusBadge tone={repasse.tone}>{repasse.label}</StatusBadge>}
                                                        bottom={repasse.detalhe
                                                            ? <span className={pageStyles.subLine}>{repasse.detalhe}</span>
                                                            : <span className={pageStyles.subLine}>Clique para ativar</span>}
                                                    />
                                                </button>
                                            ) : (
                                                <TwoLine
                                                    nowrap
                                                    top={<StatusBadge tone={repasse.tone}>{repasse.label}</StatusBadge>}
                                                    bottom={repasse.detalhe ? <span className={pageStyles.subLine}>{repasse.detalhe}</span> : undefined}
                                                />
                                            )}
                                        </td>
                                        <td>
                                            <TwoLine
                                                top={cliente.contato || <span className={pageStyles.muted}>Sem contato</span>}
                                                bottom={<>
                                                    {[cliente.telefone, cliente.celular].filter(Boolean).length > 0 && (
                                                        <span className={`${pageStyles.subLine} ${pageStyles.nowrap}`}>{[cliente.telefone, cliente.celular].filter(Boolean).map(tel => formatPhoneDisplay(tel)).join(' · ')}</span>
                                                    )}
                                                    {cliente.email && <span className={pageStyles.subLine}>{cliente.email}</span>}
                                                </>}
                                            />
                                        </td>
                                        <td>
                                            {!podeTrocarOperador ? (
                                                <span>{operadores.find(op => op._id === getOperadorIdForCliente(cliente))?.displayName || cliente.nomeResponsavel || <span className={pageStyles.muted}>Sem operador</span>}</span>
                                            ) : (
                                            <select
                                                className={styles.inlineSelect}
                                                aria-label={`Operador responsável por ${cliente.nome}`}
                                                value={getOperadorIdForCliente(cliente)}
                                                onChange={(e) => handleChangeOperador(cliente, e.target.value)}
                                            >
                                                <option value="">Sem operador</option>
                                                {operadores.map(op => (
                                                    <option key={op._id} value={op._id}>{op.displayName || op.email}</option>
                                                ))}
                                            </select>
                                            )}
                                        </td>
                                        <td className={styles.addressCell}>{composeEnderecoDisplay(cliente)}</td>
                                        <td>
                                            <RowActions>
                                                <IconAction label="Editar concessionária" onClick={() => handleEdit(cliente)}>
                                                    <Pencil size={17} aria-hidden="true" />
                                                </IconAction>
                                                {podeAssociarVeiculos && (
                                                    <IconAction label="Associar veículos" onClick={() => handleOpenAssociateModal(cliente)}>
                                                        <Link2 size={17} aria-hidden="true" />
                                                    </IconAction>
                                                )}
                                                <IconAction label="Excluir concessionária" tone="danger" onClick={() => handleDelete(cliente)}>
                                                    <Trash2 size={17} aria-hidden="true" />
                                                </IconAction>
                                            </RowActions>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {!carregando && visiveis.length === 0 && (
                    clientes.length === 0
                        ? <EmptyState
                            icon={<Building2 size={20} />}
                            title="Nenhuma concessionária cadastrada"
                            description="Cadastre a primeira loja parceira para receber o estoque dela."
                            action={<Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={openCreateForm}>Nova concessionária</Button>}
                        />
                        : segmento === 'desatualizadas'
                            ? <EmptyState icon={<AlertTriangle size={20} />} title="Todo estoque em dia" description="Nenhuma concessionária ativa está há mais de 30 dias sem atualizar." />
                            : <EmptyState icon={<Search size={20} />} title="Nenhuma concessionária encontrada" description="Ajuste a busca ou o filtro." />
                )}

                {!carregando && clientes.length > 0 && (
                    <PanelFooter aside="Estoque: verde até 15 dias, amarelo até 30, vermelho acima">
                        <ShowingCount shown={visiveis.length} total={clientes.length} singular="concessionária" plural="concessionárias" />
                    </PanelFooter>
                )}
            </Panel>

            {showForm && (
                <AdminModal
                    title={editingCliente ? 'Editar concessionária' : 'Nova concessionária'}
                    subtitle={editingCliente ? editingCliente.nome : 'Preencha os dados para cadastrar a concessionária.'}
                    onClose={closeForm}
                    size="lg"
                    busy={submitting}
                    onSubmit={handleSubmit}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={closeForm} disabled={submitting}>
                            Cancelar
                        </button>
                        <button type="submit" className={modalStyles.primary} disabled={submitting}>
                            {submitting ? 'Salvando...' : editingCliente ? 'Salvar alterações' : 'Cadastrar'}
                        </button>
                    </>}
                >
                    <div className={modalStyles.stack}>
                        <div className={modalStyles.row}>
                            <label className={modalStyles.field}>
                                Nome Fantasia
                                <input
                                    type="text"
                                    value={formData.nome}
                                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                                />
                            </label>
                            <label className={modalStyles.field}>
                                Razão Social
                                <input
                                    type="text"
                                    value={formData.razaoSocial}
                                    onChange={(e) => setFormData({ ...formData, razaoSocial: e.target.value })}
                                />
                            </label>
                            <div className={modalStyles.field}>
                                Marcas representadas
                                <span className={modalStyles.hint}>
                                    Definidas direto na lista, na coluna <strong>Marcas</strong> (seleção múltipla).
                                </span>
                            </div>
                        </div>

                        <div className={modalStyles.row}>
                            <div className={`${modalStyles.field} ${modalStyles.maskedField}`}>
                                <MaskedInput
                                    plain
                                    name="cnpj"
                                    label="CNPJ"
                                    value={formData.cnpj}
                                    onChange={(value) => setFormData((prev) => ({ ...prev, cnpj: value }))}
                                    mask="cnpj"
                                    placeholder="00.000.000/0000-00"
                                />
                            </div>
                            <label className={modalStyles.field}>
                                Inscrição Estadual
                                <input
                                    type="text"
                                    value={formData.inscricaoEstadual}
                                    onChange={(e) => setFormData({ ...formData, inscricaoEstadual: e.target.value })}
                                    placeholder="000.000.000.000"
                                />
                            </label>
                        </div>

                        <div className={modalStyles.row}>
                            <div className={`${modalStyles.field} ${modalStyles.maskedField}`}>
                                <MaskedInput
                                    plain
                                    name="telefone"
                                    label="Telefone"
                                    value={formData.telefone}
                                    onChange={(value) => setFormData((prev) => ({ ...prev, telefone: value }))}
                                    mask="phone"
                                    placeholder="(11)99999-9999"
                                />
                            </div>
                            <div className={`${modalStyles.field} ${modalStyles.maskedField}`}>
                                <MaskedInput
                                    plain
                                    name="celular"
                                    label="Celular"
                                    value={formData.celular}
                                    onChange={(value) => setFormData((prev) => ({ ...prev, celular: value }))}
                                    mask="phone"
                                    placeholder="(11)99999-9999"
                                />
                            </div>
                            <label className={modalStyles.field}>
                                Contato
                                <input
                                    type="text"
                                    value={formData.contato}
                                    onChange={(e) => setFormData({ ...formData, contato: e.target.value })}
                                />
                            </label>
                        </div>

                        <div className={modalStyles.row}>
                            <label className={modalStyles.field}>
                                E-mail
                                <input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="contato@empresa.com.br"
                                />
                            </label>
                            <label className={modalStyles.field}>
                                Nome do Responsável
                                <input
                                    type="text"
                                    value={formData.nomeResponsavel}
                                    onChange={(e) => setFormData({ ...formData, nomeResponsavel: e.target.value })}
                                />
                            </label>
                            <div className={`${modalStyles.field} ${modalStyles.maskedField}`}>
                                <MaskedInput
                                    plain
                                    name="telefoneResponsavel"
                                    label="Telefone do Responsável"
                                    value={formData.telefoneResponsavel}
                                    onChange={(value) => setFormData((prev) => ({ ...prev, telefoneResponsavel: value }))}
                                    mask="phone"
                                    placeholder="(11)99999-9999"
                                />
                            </div>
                        </div>

                        <div className={modalStyles.row}>
                            <label className={modalStyles.field}>
                                E-mail do Responsável
                                <input
                                    type="email"
                                    value={formData.emailResponsavel}
                                    onChange={(e) => setFormData({ ...formData, emailResponsavel: e.target.value })}
                                    placeholder="responsavel@empresa.com.br"
                                />
                            </label>
                            <label className={modalStyles.field}>
                                Status
                                <select
                                    value={formData.ativo ? 'true' : 'false'}
                                    onChange={(e) => setFormData((prev) => ({ ...prev, ativo: e.target.value === 'true' }))}
                                >
                                    <option value="true">Ativa</option>
                                    <option value="false">Inativa</option>
                                </select>
                            </label>
                        </div>
                        <div className={modalStyles.row}>
                            <label className={modalStyles.field}>
                                Operador Responsável
                                <select
                                    value={formData.operadorId}
                                    onChange={(e) => setFormData({ ...formData, operadorId: e.target.value })}
                                >
                                    <option value="">Selecione um operador (obrigatório se gerido por um)</option>
                                    {operadores.map(op => (
                                        <option key={op._id} value={op._id}>{op.displayName || op.email}</option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        <div className={modalStyles.row}>
                            <div className={`${modalStyles.field} ${modalStyles.maskedField}`}>
                                <MaskedInput
                                    plain
                                    name="cep"
                                    label="CEP"
                                    value={formData.cep}
                                    onChange={handleCepChange}
                                    mask="cep"
                                    placeholder="00000-000"
                                />
                                {isFetchingCep && (
                                    <small className={modalStyles.hint}>Buscando CEP...</small>
                                )}
                                {cepError && (
                                    <small className={modalStyles.fieldError}>{cepError}</small>
                                )}
                                {!isFetchingCep && !cepError && formData.cep.length === 8 && (
                                    <small className={modalStyles.hint}>Endereço preenchido automaticamente. Confirme os dados.</small>
                                )}
                            </div>
                            <label className={modalStyles.field}>
                                Número
                                <input
                                    type="text"
                                    value={formData.numero}
                                    onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                                />
                            </label>
                            <label className={modalStyles.field}>
                                Complemento
                                <input
                                    type="text"
                                    value={formData.complemento}
                                    onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                                    placeholder="Opcional"
                                />
                            </label>
                        </div>

                        <div className={modalStyles.row}>
                            <label className={modalStyles.field}>
                                Endereço
                                <input
                                    type="text"
                                    value={formData.endereco}
                                    onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                                />
                            </label>
                            <label className={modalStyles.field}>
                                Bairro
                                <input
                                    type="text"
                                    value={formData.bairro}
                                    onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                                />
                            </label>
                        </div>

                        <div className={modalStyles.row}>
                            <label className={modalStyles.field}>
                                Cidade
                                <input
                                    type="text"
                                    value={formData.cidade}
                                    onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                                />
                            </label>
                            <label className={modalStyles.field}>
                                UF
                                <select
                                    value={formData.uf}
                                    onChange={(e) => setFormData({ ...formData, uf: e.target.value })}
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
                            </label>
                        </div>

                        <div className={modalStyles.row}>
                            <label className={`${modalStyles.field} ${modalStyles.span2}`}>
                                Observações
                                <textarea
                                    value={formData.observacoes}
                                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                                    rows={3}
                                    placeholder="Informações adicionais, acordos comerciais ou notas internas"
                                />
                            </label>
                        </div>
                        {formError && (
                            <InlineNotice>{formError}</InlineNotice>
                        )}
                    </div>
                </AdminModal>
            )}

            {/* Modal de Associação de Veículos */}
            {showAssociateModal && selectedConcessionariaForAssociate && (
                <AdminModal
                    title="Associar veículos"
                    subtitle={<>Veículos sem loja que passam para <strong>{selectedConcessionariaForAssociate.nome}</strong>.</>}
                    onClose={handleCloseAssociateModal}
                    size="xl"
                    footer={<>
                        <button
                            type="button"
                            onClick={handleCloseAssociateModal}
                            className={modalStyles.secondary}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleAssociateVehicles}
                            className={modalStyles.primary}
                            disabled={selectedVehicles.length === 0}
                        >
                            {selectedVehicles.length > 0 ? `Associar ${selectedVehicles.length}` : 'Associar'}
                        </button>
                    </>}
                >
                    {loadingVehicles ? (
                        <table className={pageStyles.table}><tbody><SkeletonRows rows={4} columns={6} /></tbody></table>
                    ) : vehiclesWithoutConcessionaria.length === 0 ? (
                        <EmptyState icon={<CarFront size={20} />} title="Nenhum veículo sem concessionária" description="Todos os veículos do estoque já estão associados a uma loja." />
                    ) : (
                        <div className={modalStyles.stack}>
                            <div className={pageStyles.modalToolbar}>
                                <SearchField value={vehicleFilter} onChange={setVehicleFilter} placeholder="Filtrar por modelo ou contato" />
                                <Button onClick={() => setSelectedVehicles(veiculosFiltrados.map(v => v.id))}>Selecionar todos</Button>
                                <Button variant="ghost" onClick={() => setSelectedVehicles([])} disabled={selectedVehicles.length === 0}>Limpar seleção</Button>
                                <span className={pageStyles.modalToolbarCount}>
                                    <strong>{selectedVehicles.length}</strong> {selectedVehicles.length === 1 ? 'selecionado' : 'selecionados'}
                                </span>
                            </div>

                            <div className={pageStyles.tableWrap}>
                                <table className={pageStyles.table}>
                                    <thead>
                                        <tr>
                                            <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Selecionar</span></th>
                                            <SortHeader label="Modelo" column="modelo" sort={vehicleSort} onSort={handleSortVehicles} />
                                            <SortHeader label="Ano" column="ano" sort={vehicleSort} onSort={handleSortVehicles} />
                                            <SortHeader label="Cor" column="cor" sort={vehicleSort} onSort={handleSortVehicles} />
                                            <SortHeader label="Combustível" column="combustivel" sort={vehicleSort} onSort={handleSortVehicles} />
                                            <SortHeader label="Cidade" column="cidade" sort={vehicleSort} onSort={handleSortVehicles} />
                                            <SortHeader label="Contato" column="nomeContato" sort={vehicleSort} onSort={handleSortVehicles} />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {veiculosFiltrados.map((vehicle) => (
                                            <tr key={vehicle.id} data-selected={selectedVehicles.includes(vehicle.id)} onClick={() => handleToggleVehicle(vehicle.id)} className={pageStyles.clickableRow}>
                                                <td>
                                                    <input
                                                        type="checkbox"
                                                        aria-label={`Selecionar ${vehicle.modelo}`}
                                                        checked={selectedVehicles.includes(vehicle.id)}
                                                        onChange={() => handleToggleVehicle(vehicle.id)}
                                                        onClick={(e) => e.stopPropagation()}
                                                    />
                                                </td>
                                                <td><strong>{vehicle.modelo}</strong></td>
                                                <td>{vehicle.ano}</td>
                                                <td>{vehicle.cor}</td>
                                                <td>{vehicle.combustivel}</td>
                                                <td>{[vehicle.cidade, vehicle.estado].filter(Boolean).join(' - ')}</td>
                                                <td><TwoLine top={vehicle.nomeContato} bottom={vehicle.telefone || undefined} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </AdminModal>
            )}
            {clienteDoPlano && (
                <AdminModal
                    size="md"
                    title={`Plano de repasse — ${clienteDoPlano.nome}`}
                    subtitle="Com o plano em dia, os repasses desta loja aparecem para os lojistas."
                    onClose={() => setClienteDoPlano(null)}
                >
                    {/* O mesmo cartão da tela de Estoque, em modo equipe: ativar
                        manualmente, dar cortesia ou desativar. Repetir essa
                        lógica aqui só criaria duas regras para divergirem. */}
                    <PlanoRepasseCard
                        concessionariaId={clienteDoPlano.id}
                        onChange={() => { void fetchClientes(); }}
                    />
                </AdminModal>
            )}
            {feedback}
        </Page>
    );
}
