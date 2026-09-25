'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageCircle, Search, Target, UserPlus } from 'lucide-react';
import {
    Button, EmptyState, IconAction, Page, PageHeader, Panel, PanelFooter, PanelToolbar, PrimaryCell, RowActions,
    SearchField, Segmented, SkeletonRows, StatusBadge, pageStyles, type BadgeTone,
} from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';
import { linkWhatsApp, type ClienteCarteira } from './carteira';

type Filtro = 'oportunidades' | 'todos';

/** Lojistas sem plano, com plano vencido ou livres, para o vendedor atender. */
export function ProspectsVendedor() {
    const [clientes, setClientes] = useState<ClienteCarteira[] | null>(null);
    const [filtro, setFiltro] = useState<Filtro>('oportunidades');
    const [busca, setBusca] = useState('');
    const [erro, setErro] = useState(false);
    const [puxando, setPuxando] = useState<string | null>(null);
    const { confirm, notify, feedback } = useFeedback();

    const carregar = useCallback(() => {
        setClientes(null);
        setErro(false);
        fetch(filtro === 'oportunidades' ? '/api/vendedor/clientes?tipo=oportunidades' : '/api/vendedor/clientes')
            .then(res => res.json())
            .then((data: unknown) => { if (!Array.isArray(data)) throw new Error(); setClientes(data as ClienteCarteira[]); })
            .catch(() => { setErro(true); setClientes([]); });
    }, [filtro]);

    useEffect(() => { carregar(); }, [carregar]);

    const agora = Date.now();
    const situacao = (c: ClienteCarteira): { label: string; tone: BadgeTone; oportunidade: boolean } => {
        const vencido = !!c.vencimento && new Date(c.vencimento).getTime() < agora;
        if (!c.plano) return { label: 'Sem plano', tone: 'warning', oportunidade: true };
        if (vencido) return { label: 'Expirado', tone: 'negative', oportunidade: true };
        if (c.statusPlano === 'active') return { label: 'Ativo', tone: 'positive', oportunidade: !c.vendedorId };
        return { label: 'Inativo', tone: 'negative', oportunidade: true };
    };

    const termo = busca.trim().toLowerCase();
    const lista = useMemo(() => (clientes ?? [])
        .filter(c => filtro === 'todos' || situacao(c).oportunidade)
        .filter(c => !termo || `${c.nome ?? ''} ${c.email ?? ''} ${c.telefone ?? ''}`.toLowerCase().includes(termo)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clientes, filtro, termo]);

    const puxar = async (c: ClienteCarteira) => {
        const ok = await confirm({ title: 'Atender lead', description: <><strong>{c.nome || c.email}</strong> entra na sua carteira e sai da lista de leads livres.</>, confirmLabel: 'Puxar para a carteira' });
        if (!ok) return;
        setPuxando(c.id);
        try {
            const res = await fetch('/api/vendedor/clientes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clienteId: c.id }) });
            if (res.ok) {
                // Continua na lista, agora como seu: o botão vira WhatsApp.
                setClientes(prev => (prev ?? []).map(x => (x.id === c.id ? { ...x, vendedorId: 'meu' } : x)));
                notify('Lead adicionado à sua carteira.', 'positive');
            } else {
                const e = await res.json().catch(() => ({}));
                notify(e.error || 'Não foi possível puxar o lead.');
            }
        } catch {
            notify('Falha de conexão ao puxar o lead.');
        } finally {
            setPuxando(null);
        }
    };

    const carregando = clientes === null;
    const livres = (clientes ?? []).filter(c => !c.vendedorId).length;

    return (
        <Page>
            <PageHeader
                title="Prospects"
                count={carregando ? null : lista.length}
                description="Lojistas sem plano, com plano vencido ou livres para atendimento."
            />

            <Panel>
                <PanelToolbar>
                    <Segmented<Filtro>
                        label="Mostrar"
                        value={filtro}
                        onChange={setFiltro}
                        options={[
                            { value: 'oportunidades', label: 'Oportunidades', ...(filtro === 'oportunidades' && !carregando ? { count: livres } : {}) },
                            { value: 'todos', label: 'Toda a carteira' },
                        ]}
                    />
                    <SearchField value={busca} onChange={setBusca} placeholder="Nome, e-mail ou telefone" />
                </PanelToolbar>

                {erro && <div className={pageStyles.panelNotice}><InlineNotice>Não foi possível carregar os prospects. Atualize a página.</InlineNotice></div>}

                <div className={pageStyles.tableWrap}>
                    <table className={pageStyles.table}>
                        <thead>
                            <tr>
                                <th>Lojista</th>
                                <th>Cadastro</th>
                                <th>Plano</th>
                                <th>Vencimento</th>
                                <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {carregando && <SkeletonRows rows={5} columns={5} />}
                            {!carregando && lista.map(c => {
                                const s = situacao(c);
                                const wa = linkWhatsApp(c.telefone, `Olá ${c.nome || ''}, tudo bem? Sou da equipe CNV.`);
                                return (
                                    <tr key={c.id}>
                                        <td className={pageStyles.colMain}>
                                            <PrimaryCell title={<>{c.nome || c.email}{!c.vendedorId && <> <StatusBadge tone="info" dot={false}>Livre</StatusBadge></>}</>} subtitle={[c.email, c.telefone].filter(Boolean).join(' · ') || undefined} />
                                        </td>
                                        <td><span className={pageStyles.nowrap}>{c.dataCadastro ? new Date(c.dataCadastro).toLocaleDateString('pt-BR') : '-'}</span></td>
                                        <td><StatusBadge tone={s.tone}>{s.label}</StatusBadge>{c.plano && <span className={pageStyles.subLine}>{c.plano}</span>}</td>
                                        <td><span className={pageStyles.nowrap}>{c.vencimento ? new Date(c.vencimento).toLocaleDateString('pt-BR') : '-'}</span></td>
                                        <td>
                                            <RowActions>
                                                {!c.vendedorId
                                                    ? <Button variant="primary" icon={<UserPlus size={15} aria-hidden="true" />} onClick={() => puxar(c)} disabled={puxando === c.id}>{puxando === c.id ? 'Puxando...' : 'Atender'}</Button>
                                                    : wa && <IconAction label={`Chamar ${c.nome || 'lojista'} no WhatsApp`} href={wa}><MessageCircle size={17} aria-hidden="true" /></IconAction>}
                                            </RowActions>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {!carregando && lista.length === 0 && (
                    termo
                        ? <EmptyState icon={<Search size={20} />} title="Nenhum lojista encontrado" description="Ajuste a busca." />
                        : <EmptyState icon={<Target size={20} />} title={filtro === 'oportunidades' ? 'Nenhuma oportunidade agora' : 'Carteira vazia'} description={filtro === 'oportunidades' ? 'Todos os lojistas estão com plano ativo e atendidos.' : 'Puxe leads livres na aba Oportunidades.'} />
                )}
                {!carregando && lista.length > 0 && (
                    <PanelFooter>Mostrando <strong>{lista.length}</strong> {lista.length === 1 ? 'lojista' : 'lojistas'}</PanelFooter>
                )}
            </Panel>
            {feedback}
        </Page>
    );
}
