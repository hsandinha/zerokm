'use client';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { GitMerge, Pencil, Search, Tags, Trash2 } from 'lucide-react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import {
    EmptyState, IconAction, RowActions, SearchField, Segmented, SkeletonRows, StatusBadge, pageStyles,
} from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';

interface MarcaResumo {
    id: string;
    nome: string;
    tipoVeiculo: string;
    variacoes: number;
    ofertas: number;
    lojas: number;
    pareceData: boolean;
    parecidas: Array<{ id: string; nome: string }>;
}

type Vista =
    | { tipo: 'lista' }
    | { tipo: 'renomear'; marca: MarcaResumo }
    | { tipo: 'unificar'; marca: MarcaResumo };

const TIPOS: Record<string, string> = { carro: 'Carro', moto: 'Moto', caminhao: 'Caminhão', utilitario: 'Utilitário' };

const plural = (n: number, um: string, varios: string) => `${n.toLocaleString('pt-BR')} ${n === 1 ? um : varios}`;
const revisar = (m: MarcaResumo) => m.pareceData || m.parecidas.length > 0;

/**
 * Marcas do catálogo: mostra quanto cada uma é usada, aponta as repetidas
 * ("GM" e "GM - Chevrolet") e as com nome de data, e deixa unificar,
 * renomear ou excluir.
 */
export function MarcasCatalogoModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
    const [marcas, setMarcas] = useState<MarcaResumo[]>([]);
    const [podeEditar, setPodeEditar] = useState(false);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState('');
    const [busca, setBusca] = useState('');
    const [filtro, setFiltro] = useState<'todas' | 'revisar'>('todas');
    const [vista, setVista] = useState<Vista>({ tipo: 'lista' });
    const [nome, setNome] = useState('');
    const [tipo, setTipo] = useState('carro');
    const [destinoId, setDestinoId] = useState('');
    const [salvando, setSalvando] = useState(false);
    const { confirm, notify, feedback } = useFeedback();
    const marcasCarregadasUmaVez = useRef(false);

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErro('');
        try {
            const res = await fetch('/api/admin/marcas', { cache: 'no-store' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Não foi possível carregar as marcas.');
            const lista: MarcaResumo[] = Array.isArray(data.marcas) ? data.marcas : [];
            setMarcas(lista);
            setPodeEditar(Boolean(data.podeEditar));
            // Abre direto no que precisa de atenção.
            setFiltro(atual => (atual === 'todas' && lista.some(revisar) && !marcasCarregadasUmaVez.current ? 'revisar' : atual));
            marcasCarregadasUmaVez.current = true;
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível carregar as marcas.');
        } finally {
            setCarregando(false);
        }
    }, []);

    useEffect(() => { void carregar(); }, [carregar]);

    const aRevisar = marcas.filter(revisar).length;
    const visiveis = useMemo(() => {
        const termo = busca.trim().toLowerCase();
        return marcas.filter(m => (filtro === 'todas' || revisar(m)) && (!termo || m.nome.toLowerCase().includes(termo)));
    }, [marcas, busca, filtro]);

    const voltar = () => {
        if (salvando) return;
        setErro('');
        setVista({ tipo: 'lista' });
    };

    const abrirRenomear = (marca: MarcaResumo) => {
        setErro('');
        setNome(marca.nome);
        setTipo(marca.tipoVeiculo || 'carro');
        setVista({ tipo: 'renomear', marca });
    };

    const abrirUnificar = (marca: MarcaResumo) => {
        setErro('');
        // Sugere a parecida mais usada (a que já concentra o catálogo).
        const sugestao = [...marca.parecidas]
            .map(p => marcas.find(m => m.id === p.id))
            .filter((m): m is MarcaResumo => Boolean(m))
            .sort((a, b) => b.variacoes - a.variacoes)[0];
        setDestinoId(sugestao?.id || '');
        setVista({ tipo: 'unificar', marca });
    };

    const excluir = async (marca: MarcaResumo) => {
        if (marca.variacoes > 0 || marca.lojas > 0) {
            notify(`${marca.nome} ainda tem ${marca.variacoes > 0 ? plural(marca.variacoes, 'variação', 'variações') : plural(marca.lojas, 'loja', 'lojas')}. Use Unificar para passar tudo para a marca certa.`);
            return;
        }
        const ok = await confirm({
            title: 'Excluir marca',
            description: <>A marca <strong>{marca.nome}</strong> sai do cadastro. Ela não tem variação ativa nem concessionária vinculada.</>,
            confirmLabel: 'Excluir marca',
            danger: true,
        });
        if (!ok) return;
        try {
            const res = await fetch(`/api/admin/marcas/${marca.id}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Não foi possível excluir a marca.');
            notify(`${marca.nome} excluída.`, 'positive');
            await carregar();
            onChanged();
        } catch (e: any) {
            notify(e?.message || 'Não foi possível excluir a marca.');
        }
    };

    const salvarNome = async (event: FormEvent) => {
        event.preventDefault();
        if (vista.tipo !== 'renomear') return;
        setSalvando(true);
        setErro('');
        try {
            const res = await fetch(`/api/admin/marcas/${vista.marca.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, tipoVeiculo: tipo }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Não foi possível salvar a marca.');
            notify(data.juntadas
                ? `Marca salva. ${plural(data.juntadas, 'variação repetida foi juntada', 'variações repetidas foram juntadas')} com a que já tinha o nome novo.`
                : 'Marca salva.', 'positive');
            setVista({ tipo: 'lista' });
            await carregar();
            onChanged();
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível salvar a marca.');
        } finally {
            setSalvando(false);
        }
    };

    const unificar = async (event: FormEvent) => {
        event.preventDefault();
        if (vista.tipo !== 'unificar') return;
        const destino = marcas.find(m => m.id === destinoId);
        if (!destino) {
            setErro('Escolha a marca que fica.');
            return;
        }
        setSalvando(true);
        setErro('');
        try {
            const res = await fetch(`/api/admin/marcas/${vista.marca.id}/unificar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ destinoId }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Não foi possível unificar as marcas.');
            const partes = [
                data.variacoesMovidas ? plural(data.variacoesMovidas, 'variação movida', 'variações movidas') : '',
                data.variacoesJuntadas ? plural(data.variacoesJuntadas, 'repetida juntada', 'repetidas juntadas') : '',
                data.lojas ? plural(data.lojas, 'loja atualizada', 'lojas atualizadas') : '',
            ].filter(Boolean);
            notify(`${vista.marca.nome} unificada em ${destino.nome}${partes.length ? `: ${partes.join(', ')}` : ''}.`, 'positive');
            setVista({ tipo: 'lista' });
            await carregar();
            onChanged();
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível unificar as marcas.');
        } finally {
            setSalvando(false);
        }
    };

    if (vista.tipo === 'renomear') {
        return (
            <AdminModal
                size="sm"
                title="Renomear marca"
                subtitle={<>O nome novo vale para as variações, as concessionárias, o repasse e os favoritos de <strong>{vista.marca.nome}</strong>.</>}
                onClose={voltar}
                busy={salvando}
                onSubmit={salvarNome}
                footer={<>
                    <button type="button" className={modalStyles.secondary} onClick={voltar} disabled={salvando}>Voltar</button>
                    <button type="submit" className={modalStyles.primary} disabled={salvando || !nome.trim()}>{salvando ? 'Salvando...' : 'Salvar'}</button>
                </>}
            >
                <div className={modalStyles.stack}>
                    {erro && <InlineNotice>{erro}</InlineNotice>}
                    <label className={modalStyles.field}>
                        Nome
                        <input value={nome} onChange={e => setNome(e.target.value)} maxLength={60} autoFocus />
                    </label>
                    <label className={modalStyles.field}>
                        Tipo padrão
                        <select value={tipo} onChange={e => setTipo(e.target.value)}>
                            {Object.entries(TIPOS).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
                        </select>
                        <span className={modalStyles.hint}>Usado quando a variação chega sem tipo. Não muda as variações já cadastradas.</span>
                    </label>
                </div>
                {feedback}
            </AdminModal>
        );
    }

    if (vista.tipo === 'unificar') {
        const origem = vista.marca;
        const parecidas = new Set(origem.parecidas.map(p => p.id));
        const outras = marcas.filter(m => m.id !== origem.id);
        return (
            <AdminModal
                size="md"
                title={`Unificar ${origem.nome}`}
                subtitle="Tudo desta marca passa para a marca escolhida e ela sai do cadastro."
                onClose={voltar}
                busy={salvando}
                onSubmit={unificar}
                footer={<>
                    <button type="button" className={modalStyles.secondary} onClick={voltar} disabled={salvando}>Voltar</button>
                    <button type="submit" className={modalStyles.primary} disabled={salvando || !destinoId}>{salvando ? 'Unificando...' : 'Unificar marcas'}</button>
                </>}
            >
                <div className={modalStyles.stack}>
                    {erro && <InlineNotice>{erro}</InlineNotice>}
                    <label className={modalStyles.field}>
                        Marca que fica
                        <select value={destinoId} onChange={e => setDestinoId(e.target.value)} autoFocus>
                            <option value="">Escolha a marca</option>
                            {parecidas.size > 0 && (
                                <optgroup label="Parecidas">
                                    {outras.filter(m => parecidas.has(m.id)).map(m => <option key={m.id} value={m.id}>{m.nome} ({plural(m.variacoes, 'variação', 'variações')})</option>)}
                                </optgroup>
                            )}
                            <optgroup label={parecidas.size > 0 ? 'Outras marcas' : 'Marcas'}>
                                {outras.filter(m => !parecidas.has(m.id)).map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}
                            </optgroup>
                        </select>
                    </label>
                    <dl className={modalStyles.facts}>
                        <div className={modalStyles.fact}><dt className={modalStyles.factLabel}>Variações</dt><dd className={modalStyles.factValue}>{origem.variacoes.toLocaleString('pt-BR')}</dd></div>
                        <div className={modalStyles.fact}><dt className={modalStyles.factLabel}>Anúncios ativos</dt><dd className={modalStyles.factValue}>{origem.ofertas.toLocaleString('pt-BR')}</dd></div>
                        <div className={modalStyles.fact}><dt className={modalStyles.factLabel}>Concessionárias</dt><dd className={modalStyles.factValue}>{origem.lojas.toLocaleString('pt-BR')}</dd></div>
                    </dl>
                    <p className={modalStyles.hint}>
                        Variação que já existir igual na marca escolhida não é duplicada: os anúncios das lojas passam para ela.
                        Repasse e favoritos dos clientes acompanham. Não dá para desfazer.
                    </p>
                </div>
                {feedback}
            </AdminModal>
        );
    }

    return (
        <AdminModal
            size="lg"
            title="Marcas do catálogo"
            subtitle="Unifique as marcas repetidas e exclua as que ficaram sem uso. Variações, lojas e anúncios acompanham."
            onClose={onClose}
            toolbar={
                <div className={pageStyles.modalToolbar}>
                    <SearchField value={busca} onChange={setBusca} placeholder="Buscar marca" />
                    <Segmented
                        label="Filtrar marcas"
                        value={filtro}
                        onChange={setFiltro}
                        options={[
                            { value: 'todas', label: 'Todas', count: marcas.length },
                            { value: 'revisar', label: 'A revisar', count: aRevisar },
                        ]}
                    />
                </div>
            }
            footer={<button type="button" className={modalStyles.secondary} onClick={onClose}>Fechar</button>}
        >
            {erro && <InlineNotice>{erro}</InlineNotice>}
            <div className={pageStyles.tableWrap}>
                <table className={`${pageStyles.table} ${pageStyles.tableDense}`}>
                    <thead>
                        <tr>
                            <th>Marca</th>
                            <th>Tipo</th>
                            <th className={pageStyles.nowrap}>Variações</th>
                            <th className={pageStyles.nowrap}>Anúncios</th>
                            <th>Lojas</th>
                            {podeEditar && <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Ações</span></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {carregando && marcas.length === 0 && <SkeletonRows rows={6} columns={podeEditar ? 6 : 5} />}
                        {visiveis.map(marca => (
                            <tr key={marca.id}>
                                <td className={pageStyles.colMain}>
                                    <strong>{marca.nome}</strong>
                                    {marca.pareceData && (
                                        <span className={pageStyles.subLine}><StatusBadge tone="negative" dot={false}>Nome parece data</StatusBadge></span>
                                    )}
                                    {marca.parecidas.length > 0 && (
                                        <span className={pageStyles.subLine}>
                                            <StatusBadge tone="warning" dot={false}>Parece {marca.parecidas.map(p => p.nome).join(', ')}</StatusBadge>
                                        </span>
                                    )}
                                </td>
                                <td>{TIPOS[marca.tipoVeiculo] || marca.tipoVeiculo}</td>
                                <td>{marca.variacoes ? marca.variacoes.toLocaleString('pt-BR') : <span className={pageStyles.muted}>0</span>}</td>
                                <td>{marca.ofertas ? marca.ofertas.toLocaleString('pt-BR') : <span className={pageStyles.muted}>0</span>}</td>
                                <td>{marca.lojas ? marca.lojas.toLocaleString('pt-BR') : <span className={pageStyles.muted}>0</span>}</td>
                                {podeEditar && (
                                    <td>
                                        <RowActions>
                                            <IconAction label={`Renomear ${marca.nome}`} onClick={() => abrirRenomear(marca)}>
                                                <Pencil size={17} aria-hidden="true" />
                                            </IconAction>
                                            <IconAction label={`Unificar ${marca.nome} com outra marca`} onClick={() => abrirUnificar(marca)}>
                                                <GitMerge size={17} aria-hidden="true" />
                                            </IconAction>
                                            <IconAction label={`Excluir ${marca.nome}`} tone="danger" onClick={() => excluir(marca)}>
                                                <Trash2 size={17} aria-hidden="true" />
                                            </IconAction>
                                        </RowActions>
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {!carregando && visiveis.length === 0 && (
                busca || filtro === 'revisar'
                    ? <EmptyState icon={<Search size={20} />} title={filtro === 'revisar' && !busca ? 'Nenhuma marca a revisar' : 'Nenhuma marca encontrada'} description={filtro === 'revisar' && !busca ? 'Não há marca repetida nem com nome de data.' : 'Ajuste a busca.'} />
                    : <EmptyState icon={<Tags size={20} />} title="Nenhuma marca cadastrada" />
            )}
            {feedback}
        </AdminModal>
    );
}
