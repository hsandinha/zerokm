'use client';

import { useState, useEffect, useCallback } from 'react';
import { ConcessionariaService } from '../../lib/services/concessionariaService';
import styles from './ConcessionariasManagement.module.css';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { AlertTriangle, BadgeCheck, Building2, CarFront, CircleCheck, Eye, EyeOff, Link2, RefreshCw, Search, Trash2, UserRoundX } from 'lucide-react';
import { FichaConcessionariaModal, type AbaDaFicha } from './FichaConcessionaria';
import { NovoCadastroButton } from './NovoCadastro';
import {
    Avatar, Button, EmptyState, IconAction, Page, PageHeader, Panel, PanelFooter, PanelToolbar, PrimaryCell, RowActions,
    SearchField, Segmented, ShowingCount, SkeletonRows, SortHeader, StatCard, StatGrid, StatusBadge, TwoLine, nextSort, pageStyles,
    type BadgeTone, type SortDirection,
} from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';
import { diasSemAtualizar, estoqueParado, farolDoEstoque, pendenciasDaLoja } from '@/lib/utils/pendenciasDaLoja';

type Segmento = 'todas' | 'pendencia' | 'ativas' | 'repasse' | 'sem-repasse' | 'desatualizadas' | 'ocultas' | 'inativas';
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
    /** Estoque fora da vitrine do cliente final; a loja segue ativa. */
    ocultarVitrine?: boolean;
    vitrineOcultaEm?: string | null;
    vitrineOcultaPor?: string | null;
    /** A loja tem login de titular (lib/utils/pendenciasDaLoja.ts). Ausente em resposta antiga da API. */
    temLogin?: boolean;
    /** Anúncios de repasse ativos da loja. */
    repassesCadastrados?: number;
}

/**
 * Quem está usando a tela. Admin, gerente e administrativo gerenciam tudo; o operador
 * vê a carteira dele; o vendedor só consulta. O que cada perfil faz dentro da ficha
 * da loja vem do servidor (lib/utils/permissoesDaFicha.ts).
 */
type PerfilTela = 'admin' | 'operador' | 'vendedor';

export function ConcessionariasManagement({ perfil = 'admin' }: { perfil?: PerfilTela } = {}) {
    const podeTrocarOperador = perfil === 'admin';
    const podeAssociarVeiculos = perfil === 'admin';
    // Ocultar o estoque da vitrine: a rota só aceita administrador.
    const podeOcultarVitrine = perfil === 'admin';
    // Tudo de uma loja abre na ficha, na aba certa; o cadastro novo é guiado.
    const [ficha, setFicha] = useState<{ id: string; aba: AbaDaFicha } | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [segmento, setSegmento] = useState<Segmento>('todas');
    const { confirm, notify, feedback } = useFeedback();
    const [clientes, setClientes] = useState<ClienteData[]>([]);
    const [filteredClientes, setFilteredClientes] = useState<ClienteData[]>([]);
    const [loadingClientes, setLoadingClientes] = useState(true);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [showAssociateModal, setShowAssociateModal] = useState(false);
    const [selectedConcessionariaForAssociate, setSelectedConcessionariaForAssociate] = useState<ClienteData | null>(null);
    const [vehiclesWithoutConcessionaria, setVehiclesWithoutConcessionaria] = useState<any[]>([]);
    const [loadingVehicles, setLoadingVehicles] = useState(false);
    const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
    const [vehicleFilter, setVehicleFilter] = useState('');
    const [vehicleSort, setVehicleSort] = useState<{ column: ColunaVeiculo | null; direction: SortDirection }>({ column: null, direction: 'asc' });
    const [operadores, setOperadores] = useState<{_id: string, displayName: string, email: string}[]>([]);

    // Marcas da loja (com fallback ao formato antigo de marca única).
    const getSelectedBrandNames = (cliente: ClienteData): string[] => {
        if (cliente.marcas && cliente.marcas.length) return cliente.marcas;
        return cliente.marca ? [cliente.marca] : [];
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

    // Farol do estoque e pendências: regra única em lib/utils/pendenciasDaLoja.ts.
    const atualizacao = (dateString?: string | null): { tone: BadgeTone; label: string } => farolDoEstoque(dateString);

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

    useEffect(() => {
        fetchClientes();
        
        // Fetch operadores
        fetch('/api/admin/users')
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setOperadores(data);
            })
            .catch(console.error);
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

    const handleToggleVitrine = async (cliente: ClienteData) => {
        const ocultar = !cliente.ocultarVitrine;
        if (ocultar) {
            const ok = await confirm({
                title: 'Ocultar estoque da vitrine',
                description: <>Os carros da <strong>{cliente.nome}</strong> (0KM e repasse) deixam de aparecer para os clientes. Nada é excluído: a loja continua ativa e atualizando o estoque, e tudo volta quando você reexibir.</>,
                confirmLabel: 'Ocultar estoque',
            });
            if (!ok) return;
        }

        try {
            const res = await fetch(`/api/admin/concessionarias/${cliente.id}/vitrine`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ocultar }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Erro ao alterar a vitrine');
            const atualizar = (c: ClienteData) => (c.id === cliente.id ? { ...c, ...data } : c);
            setClientes(prev => prev.map(atualizar));
            setFilteredClientes(prev => prev.map(atualizar));
            notify(ocultar ? `Estoque da ${cliente.nome} oculto da vitrine.` : `Estoque da ${cliente.nome} de volta na vitrine.`, 'positive');
        } catch (error) {
            console.error('Erro ao alterar a vitrine da concessionária:', error);
            notify('Não foi possível alterar a vitrine da concessionária. Tente de novo.');
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
        if (segmento === 'pendencia') return pendenciasDaLoja(c).length > 0;
        if (segmento === 'ativas') return c.ativo !== false;
        if (segmento === 'repasse') return Boolean(c.planoRepasse?.ativo);
        if (segmento === 'sem-repasse') return c.ativo !== false && !c.planoRepasse?.ativo;
        if (segmento === 'inativas') return c.ativo === false;
        if (segmento === 'ocultas') return Boolean(c.ocultarVitrine);
        if (segmento === 'desatualizadas') return c.ativo !== false && estoqueParado(c.ultimaAtualizacao);
        return true;
    };
    const visiveis = filteredClientes.filter(noSegmento);

    const ativas = clientes.filter(c => c.ativo !== false);
    const emDia = ativas.filter(c => { const d = diasSemAtualizar(c.ultimaAtualizacao); return d !== null && d <= 15; }).length;
    const desatualizadas = ativas.filter(c => estoqueParado(c.ultimaAtualizacao)).length;
    const comPendencia = clientes.filter(c => pendenciasDaLoja(c).length > 0).length;
    const totalVeiculos = clientes.reduce((soma, c) => soma + (c.totalVeiculos || 0), 0);
    const semOperador = ativas.filter(c => !getOperadorIdForCliente(c)).length;
    const comRepasse = clientes.filter(c => c.planoRepasse?.ativo).length;
    // Já teve plano e deixou vencer: é a fila de renovação, não o mesmo que
    // "nunca assinou".
    const repasseVencido = clientes.filter(c => !c.planoRepasse?.ativo && c.planoRepasse?.expiresAt).length;
    const ocultas = clientes.filter(c => c.ocultarVitrine).length;
    const carregando = loadingClientes && clientes.length === 0;

    return (
        <Page wide>
            <PageHeader
                title="Concessionárias"
                count={carregando ? null : clientes.length}
                description={perfil === 'admin' ? 'Lojas parceiras, marcas representadas, estoque enviado e operador responsável.' : 'Lojas da carteira, marcas, estoque enviado e contatos.'}
                actions={<NovoCadastroButton perfilInicial="concessionaria" onFechar={() => { void fetchClientes(); }} />}
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
                            { value: 'pendencia', label: 'Com pendência', count: comPendencia },
                            { value: 'ativas', label: 'Ativas', count: ativas.length },
                            { value: 'repasse', label: 'Com repasse', count: comRepasse },
                            { value: 'sem-repasse', label: 'Sem repasse', count: ativas.length - comRepasse },
                            { value: 'desatualizadas', label: 'Estoque desatualizado', count: desatualizadas },
                            ...(ocultas > 0 || segmento === 'ocultas' ? [{ value: 'ocultas' as const, label: 'Ocultas na vitrine', count: ocultas }] : []),
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
                                const selectedNames = getSelectedBrandNames(cliente);
                                const semaforo = atualizacao(cliente.ultimaAtualizacao);
                                const veiculos = cliente.totalVeiculos || 0;
                                const repasse = situacaoRepasse(cliente.planoRepasse);
                                const pendencias = pendenciasDaLoja(cliente);
                                const abrir = (aba: AbaDaFicha = 'dados') => setFicha({ id: cliente.id, aba });
                                // Clique numa célula com destino próprio (marcas, repasse, ações) não abre a aba Dados por cima.
                                const naAba = (aba: AbaDaFicha) => (event: React.MouseEvent) => { event.stopPropagation(); abrir(aba); };
                                return (
                                    <tr key={cliente.id} data-inactive={cliente.ativo === false} className={pageStyles.clickableRow} onClick={() => abrir()}>
                                        <td className={pageStyles.colMain}>
                                            <PrimaryCell
                                                leading={<Avatar name={cliente.nome || '?'} />}
                                                title={<>
                                                    <button type="button" className={styles.nomeButton} onClick={naAba('dados')} title={`Abrir a ficha de ${cliente.nome}`}>{cliente.nome}</button>
                                                    {cliente.ativo === false && <> <StatusBadge dot={false}>Inativa</StatusBadge></>}
                                                </>}
                                                subtitle={<>
                                                    {cliente.razaoSocial}
                                                    <span className={pageStyles.subLine}>CNPJ {formatCnpjDisplay(cliente.cnpj)} · desde {formatDate(cliente.dataCadastro ?? cliente.criadoEm)}</span>
                                                    {pendencias.length > 0 && (
                                                        <span className={`${pageStyles.subLine} ${pageStyles.badgeList}`}>
                                                            {pendencias.map(p => (
                                                                <button key={p.id} type="button" className={styles.seloButton} title={`${p.detalhe} Clique para resolver.`} onClick={naAba(p.aba)}>
                                                                    <StatusBadge tone="warning">{p.rotulo}</StatusBadge>
                                                                </button>
                                                            ))}
                                                        </span>
                                                    )}
                                                </>}
                                            />
                                        </td>
                                        <td>
                                            <button type="button" className={styles.repasseButton} onClick={naAba('marcas')} title={`Marcas de ${cliente.nome}`} aria-label={`Marcas de ${cliente.nome}: ${selectedNames.join(', ') || 'nenhuma'}`}>
                                                {selectedNames.length > 0
                                                    ? <span className={pageStyles.badgeList}>{selectedNames.map(nome => <StatusBadge key={nome} tone="accent" dot={false}>{nome}</StatusBadge>)}</span>
                                                    : <span className={pageStyles.muted}>Sem marca</span>}
                                            </button>
                                        </td>
                                        <td onClick={naAba('estoque')} title={`Estoque de ${cliente.nome}`}>
                                            <TwoLine
                                                nowrap
                                                top={<strong>{veiculos.toLocaleString('pt-BR')} {veiculos === 1 ? 'veículo' : 'veículos'}</strong>}
                                                bottom={<>
                                                    <StatusBadge tone={semaforo.tone}>{semaforo.label}</StatusBadge>
                                                    {cliente.ocultarVitrine && (
                                                        <span className={pageStyles.subLine} title={cliente.vitrineOcultaEm ? `Oculto em ${formatDate(cliente.vitrineOcultaEm)}${cliente.vitrineOcultaPor ? ` por ${cliente.vitrineOcultaPor}` : ''}` : undefined}>
                                                            <StatusBadge tone="warning" dot={false}>Oculto na vitrine</StatusBadge>
                                                        </span>
                                                    )}
                                                </>}
                                            />
                                        </td>
                                        <td>
                                            <button type="button" className={styles.repasseButton} onClick={naAba('planos')} title={`Planos e assinaturas de ${cliente.nome}`}>
                                                <TwoLine
                                                    nowrap
                                                    top={<StatusBadge tone={repasse.tone}>{repasse.label}</StatusBadge>}
                                                    bottom={repasse.detalhe ? <span className={pageStyles.subLine}>{repasse.detalhe}</span> : undefined}
                                                />
                                            </button>
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
                                        <td onClick={podeTrocarOperador ? (event => event.stopPropagation()) : undefined}>
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
                                        <td onClick={event => event.stopPropagation()}>
                                            <RowActions>
                                                {podeOcultarVitrine && (
                                                    <IconAction
                                                        label={cliente.ocultarVitrine ? 'Mostrar estoque na vitrine' : 'Ocultar estoque da vitrine'}
                                                        onClick={() => handleToggleVitrine(cliente)}
                                                    >
                                                        {cliente.ocultarVitrine ? <Eye size={17} aria-hidden="true" /> : <EyeOff size={17} aria-hidden="true" />}
                                                    </IconAction>
                                                )}
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
                            action={<NovoCadastroButton perfilInicial="concessionaria" onFechar={() => { void fetchClientes(); }} />}
                        />
                        : segmento === 'pendencia'
                            ? <EmptyState icon={<CircleCheck size={20} />} title="Nenhuma loja com pendência" description="Todas as concessionárias ativas têm marca, login e estoque em dia." />
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
            {ficha && (
                <FichaConcessionariaModal
                    key={`${ficha.id}:${ficha.aba}`}
                    concessionariaId={ficha.id}
                    abaInicial={ficha.aba}
                    onClose={() => setFicha(null)}
                    onMudou={() => { void fetchClientes(); }}
                />
            )}
            {feedback}
        </Page>
    );
}
