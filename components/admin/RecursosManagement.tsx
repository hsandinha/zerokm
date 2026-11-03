'use client';

import { useCallback, useEffect, useState } from 'react';
import { Building2, SlidersHorizontal, Store } from 'lucide-react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import {
    Avatar, EmptyState, IconAction, Page, PageHeader, Pagination, Panel, PanelFooter, PanelToolbar, PrimaryCell, RowActions,
    SearchField, Segmented, ShowingCount, SkeletonRows, StatusBadge, TwoLine, pageStyles, type BadgeTone,
} from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';
import { GRUPOS_DE_RECURSOS, lerRecursos, recursoAplica, type Recurso, type Recursos, type TipoConta } from '@/lib/recursos';
import styles from './RecursosManagement.module.css';

type Conta = {
    tipo: TipoConta;
    id: string;
    nome: string;
    detalhe: string;
    recursos: Recursos;
    liberados: number;
    total: number;
    atendimento: { status: 'nao_iniciado' | 'teste' | 'assinante' | 'vencido'; ate: string | null };
};

const formatarData = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '');

function situacaoAtendimento(conta: Conta): { tone: BadgeTone; label: string; detalhe?: string } {
    if (!conta.recursos.atendimento) return { tone: 'neutral', label: 'Não liberado' };
    const { status, ate } = conta.atendimento;
    if (status === 'nao_iniciado') return { tone: 'info', label: 'Liberado', detalhe: 'Teste começa no primeiro acesso' };
    if (status === 'teste') return { tone: 'warning', label: 'Em teste', detalhe: ate ? `até ${formatarData(ate)}` : undefined };
    if (status === 'assinante') return { tone: 'positive', label: 'Assinante', detalhe: ate ? `até ${formatarData(ate)}` : undefined };
    return { tone: 'negative', label: 'Vencido', detalhe: ate ? `em ${formatarData(ate)}` : undefined };
}

/**
 * Funcionalidades liberadas por cliente, como no Chatrun: o CNV escolhe o que
 * cada concessionária e cada lojista usa (lib/recursos.ts). O que está
 * desligado some do painel do cliente e as rotas recusam.
 */
export function RecursosManagement() {
    const { notify, feedback } = useFeedback();
    const [tipo, setTipo] = useState<TipoConta>('concessionaria');
    const [busca, setBusca] = useState('');
    const [page, setPage] = useState(1);
    const [contas, setContas] = useState<Conta[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [editando, setEditando] = useState<Conta | null>(null);

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            const params = new URLSearchParams({ tipo, page: String(page) });
            if (busca.trim()) params.set('q', busca.trim());
            const res = await fetch(`/api/admin/recursos?${params}`);
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Erro ao carregar');
            setContas(data.data);
            setTotal(data.total);
            setTotalPages(data.totalPages);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Erro ao carregar as contas.');
        } finally {
            setCarregando(false);
        }
    }, [tipo, page, busca]);

    useEffect(() => {
        const t = setTimeout(carregar, busca ? 300 : 0);
        return () => clearTimeout(t);
    }, [carregar, busca]);

    const salvo = (conta: Conta) => {
        setContas(prev => prev.map(c => (c.id === conta.id ? conta : c)));
        setEditando(null);
        notify(`Funcionalidades de ${conta.nome} salvas.`, 'positive');
    };

    return (
        <Page wide>
            <PageHeader
                title="Funcionalidades"
                description="O que cada concessionária e cada lojista pode usar. O que estiver desligado some do painel do cliente."
            />

            <Panel>
                <PanelToolbar>
                    <Segmented<TipoConta>
                        label="Tipo de conta"
                        value={tipo}
                        onChange={v => { setTipo(v); setPage(1); }}
                        options={[
                            { value: 'concessionaria', label: 'Concessionárias' },
                            { value: 'lojista', label: 'Lojistas' },
                        ]}
                    />
                    <SearchField
                        value={busca}
                        onChange={v => { setBusca(v); setPage(1); }}
                        placeholder={tipo === 'concessionaria' ? 'Nome, CNPJ ou cidade' : 'Nome ou e-mail'}
                    />
                </PanelToolbar>

                {erro && <div className={pageStyles.panelNotice}><InlineNotice>{erro}</InlineNotice></div>}

                <div className={pageStyles.tableWrap}>
                    <table className={`${pageStyles.table} ${pageStyles.tableDense}`}>
                        <thead>
                            <tr>
                                <th>{tipo === 'concessionaria' ? 'Concessionária' : 'Lojista'}</th>
                                <th>Liberadas</th>
                                <th>Atendimento</th>
                                <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {carregando && contas.length === 0 && <SkeletonRows rows={5} columns={4} />}
                            {contas.map(conta => {
                                const at = situacaoAtendimento(conta);
                                return (
                                    <tr key={conta.id}>
                                        <td className={pageStyles.colMain}>
                                            <PrimaryCell leading={<Avatar name={conta.nome} />} title={conta.nome} subtitle={conta.detalhe} />
                                        </td>
                                        <td>
                                            <strong>{conta.liberados}</strong> <span className={pageStyles.muted}>de {conta.total}</span>
                                        </td>
                                        <td>
                                            <TwoLine
                                                nowrap
                                                top={<StatusBadge tone={at.tone}>{at.label}</StatusBadge>}
                                                bottom={at.detalhe ? <span className={pageStyles.subLine}>{at.detalhe}</span> : undefined}
                                            />
                                        </td>
                                        <td>
                                            <RowActions>
                                                <IconAction label="Editar funcionalidades" onClick={() => setEditando(conta)}>
                                                    <SlidersHorizontal size={17} aria-hidden="true" />
                                                </IconAction>
                                            </RowActions>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {!carregando && contas.length === 0 && !erro && (
                    <EmptyState
                        icon={tipo === 'concessionaria' ? <Building2 size={20} /> : <Store size={20} />}
                        title={busca ? 'Nenhuma conta encontrada' : 'Nenhuma conta cadastrada'}
                        description={busca ? 'Ajuste a busca.' : undefined}
                    />
                )}

                {contas.length > 0 && (
                    <PanelFooter aside={<Pagination page={page} totalPages={totalPages} onChange={setPage} />}>
                        <ShowingCount shown={contas.length} total={total} singular="conta" plural="contas" />
                    </PanelFooter>
                )}
            </Panel>

            {editando && <EditarRecursos conta={editando} onClose={() => setEditando(null)} onSaved={salvo} />}
            {feedback}
        </Page>
    );
}

function EditarRecursos({ conta, onClose, onSaved }: { conta: Conta; onClose: () => void; onSaved: (c: Conta) => void }) {
    const [marcados, setMarcados] = useState<Recursos>(conta.recursos);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    // Mesmas dependências do servidor: desligar a IA apaga o simulador na tela.
    const efetivo = lerRecursos(marcados, conta.tipo);

    const alternar = (chave: Recurso, valor: boolean) => setMarcados(prev => ({ ...prev, [chave]: valor }));

    async function salvar() {
        setSalvando(true);
        setErro(null);
        try {
            const res = await fetch('/api/admin/recursos', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo: conta.tipo, id: conta.id, recursos: marcados }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Erro ao salvar');
            onSaved(data);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Erro ao salvar.');
        } finally {
            setSalvando(false);
        }
    }

    return (
        <AdminModal
            title="Funcionalidades"
            subtitle={conta.nome}
            onClose={onClose}
            size="lg"
            busy={salvando}
            onSubmit={salvar}
            footer={<>
                <button type="button" className={modalStyles.secondary} onClick={onClose} disabled={salvando}>Cancelar</button>
                <button type="submit" className={modalStyles.primary} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
            </>}
        >
            {erro && <InlineNotice>{erro}</InlineNotice>}
            {GRUPOS_DE_RECURSOS.map(grupo => {
                const itens = grupo.itens.filter(i => recursoAplica(i.chave, conta.tipo));
                if (!itens.length) return null;
                return (
                    <section key={grupo.grupo} className={styles.grupo}>
                        <h3 className={styles.grupoTitulo}>{grupo.grupo}</h3>
                        {itens.map(item => {
                            const bloqueado = Boolean(item.depende && !efetivo[item.depende]);
                            return (
                                <label key={item.chave} className={styles.item}>
                                    <input
                                        type="checkbox"
                                        checked={efetivo[item.chave]}
                                        disabled={bloqueado || salvando}
                                        onChange={e => alternar(item.chave, e.target.checked)}
                                    />
                                    <span className={styles.itemTexto}>
                                        <span className={styles.itemRotulo}>{item.rotulo}</span>
                                        <span className={styles.itemDescricao}>{item.descricao}</span>
                                        {bloqueado && item.depende && (
                                            <span className={styles.itemAviso}>
                                                Depende de “{GRUPOS_DE_RECURSOS.flatMap(g => g.itens).find(i => i.chave === item.depende)?.rotulo}”.
                                            </span>
                                        )}
                                    </span>
                                </label>
                            );
                        })}
                    </section>
                );
            })}
        </AdminModal>
    );
}
