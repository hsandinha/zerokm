'use client';

import { useCallback, useState } from 'react';
import { AlertTriangle, CircleCheck } from 'lucide-react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { InlineNotice } from '@/components/ui/Feedback';
import { pageStyles } from '@/components/ui/Page';
import { PlanoRepasseCard } from '@/components/dealership/PlanoRepasseCard';
import { UsuariosDaLoja } from '@/components/admin/UsuariosDaLojaModal';
import { CamposDaConcessionaria, dadosVazios, useOperadores, type DadosForm } from '@/components/admin/ficha/DadosDaConcessionaria';
import { MarcasDaLoja, type MarcasVinculadas } from '@/components/admin/ficha/MarcasDaLoja';
import { FichaConcessionariaModal, type FichaDaLoja } from '@/components/admin/FichaConcessionaria';
import styles from './FichaConcessionaria.module.css';

const PASSOS = ['Dados', 'Marcas', 'Login do titular', 'Plano de repasse', 'Resumo'] as const;

type LojaCriada = { id: string; nome: string };

/**
 * Cadastro guiado de concessionária: dados, marcas, login do titular e plano de
 * repasse, um passo por vez. Cada passo grava na hora (a loja nasce ao avançar
 * do primeiro), então fechar no meio não perde nada: o que faltou aparece como
 * pendência na lista e na ficha. Só o primeiro passo é obrigatório.
 *
 * `onCriada` é chamado uma vez, assim que a loja é criada no primeiro passo.
 * "Abrir ficha", no resumo, troca este modal pela ficha da loja; ao fechar a
 * ficha, `onClose` é chamado.
 */
export function NovaConcessionariaGuiada({ onClose, onCriada }: {
    onClose: () => void;
    onCriada?: (concessionaria: LojaCriada) => void;
}) {
    const operadores = useOperadores();
    const [passo, setPasso] = useState(0);
    const [form, setForm] = useState<DadosForm>(dadosVazios);
    const [gravado, setGravado] = useState<DadosForm | null>(null);
    const [loja, setLoja] = useState<LojaCriada | null>(null);
    const [marcas, setMarcas] = useState<MarcasVinculadas>({ marcaIds: [], marcas: [] });
    const [ficha, setFicha] = useState<FichaDaLoja | null>(null);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [naFicha, setNaFicha] = useState(false);
    const [planoAtivo, setPlanoAtivo] = useState(false);

    const carregarFicha = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/admin/concessionarias/${id}/ficha`);
            const body = await res.json().catch(() => ({}));
            if (res.ok) setFicha(body);
        } catch {
            // O resumo mostra o que já se sabe; a ficha recarrega ao abrir.
        }
    }, []);

    /** Passo 1: cria a loja (ou atualiza, se a pessoa voltou e mexeu nos dados). */
    const gravarDados = async () => {
        if (!form.nome.trim()) { setErro('Informe o nome fantasia da concessionária.'); return; }
        if (loja && gravado && JSON.stringify(gravado) === JSON.stringify(form)) { setErro(null); setPasso(1); return; }
        setSalvando(true);
        setErro(null);
        try {
            const corpo = { ...form, uf: form.uf.toUpperCase() };
            const res = loja
                ? await fetch(`/api/concessionarias/${loja.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
                : await fetch('/api/concessionarias', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpo, dataCadastro: new Date().toISOString() }) });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'Não foi possível salvar a concessionária.');
            const criada: LojaCriada = { id: loja?.id || body.id, nome: form.nome.trim() };
            setGravado(form);
            setLoja(criada);
            if (!loja) onCriada?.(criada);
            await carregarFicha(criada.id);
            setPasso(1);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar a concessionária.');
        } finally {
            setSalvando(false);
        }
    };

    const irPara = async (proximo: number) => {
        setErro(null);
        // O resumo relê a loja: as pendências refletem o que foi feito nos passos.
        if (proximo === 4 && loja) {
            setSalvando(true);
            await carregarFicha(loja.id);
            setSalvando(false);
        }
        setPasso(proximo);
    };

    if (naFicha && loja) {
        return <FichaConcessionariaModal concessionariaId={loja.id} onClose={onClose} onMudou={() => onCriada?.(loja)} />;
    }

    const temLogin = (ficha?.acessos.totalTitulares ?? 0) > 0;
    const permissoes = ficha?.permissoes;

    const rodape = passo === 0 ? (
        <>
            <button type="button" className={modalStyles.secondary} onClick={onClose} disabled={salvando}>Cancelar</button>
            <button type="button" className={modalStyles.primary} onClick={gravarDados} disabled={salvando}>
                {salvando ? 'Salvando...' : loja ? 'Salvar e avançar' : 'Cadastrar e avançar'}
            </button>
        </>
    ) : passo === 4 ? (
        <>
            <button type="button" className={modalStyles.secondary} onClick={onClose}>Fechar</button>
            <button type="button" className={modalStyles.primary} onClick={() => setNaFicha(true)}>Abrir ficha</button>
        </>
    ) : (
        <>
            <button type="button" className={modalStyles.secondary} onClick={() => irPara(passo - 1)} disabled={salvando}>Voltar</button>
            <button type="button" className={modalStyles.primary} onClick={() => irPara(passo + 1)} disabled={salvando}>
                {passo === 1 ? (marcas.marcaIds.length > 0 ? 'Avançar' : 'Pular por enquanto')
                    : passo === 2 ? (temLogin ? 'Avançar' : 'Pular por enquanto')
                        : (planoAtivo ? 'Concluir' : 'Pular e concluir')}
            </button>
        </>
    );

    return (
        <AdminModal
            size="lg"
            title="Nova concessionária"
            subtitle={loja ? loja.nome : 'Passo a passo para colocar a loja no ar. Só os dados são obrigatórios.'}
            onClose={onClose}
            busy={salvando}
            toolbar={(
                <ol className={styles.passos} aria-label="Passos do cadastro">
                    {PASSOS.map((rotulo, i) => (
                        <li key={rotulo} className={styles.passo} data-estado={i === passo ? 'atual' : i < passo ? 'feito' : 'depois'} aria-current={i === passo ? 'step' : undefined}>
                            <span className={styles.passoNumero}>{i + 1}</span> {rotulo}
                        </li>
                    ))}
                </ol>
            )}
            footer={rodape}
        >
            <div className={modalStyles.stack}>
                {passo === 0 && (
                    <CamposDaConcessionaria value={form} onChange={setForm} operadores={operadores} disabled={salvando} />
                )}

                {passo === 1 && loja && (
                    <>
                        <p className={`${modalStyles.hint} ${modalStyles.flush}`}>Marque as marcas que a {loja.nome} representa. É por elas que os modelos do catálogo aparecem no painel da loja.</p>
                        <MarcasDaLoja
                            concessionariaId={loja.id}
                            inicial={marcas}
                            podeEditar={permissoes?.editarMarcas !== false}
                            onMudou={setMarcas}
                        />
                    </>
                )}

                {passo === 2 && loja && (
                    permissoes && !permissoes.gerirAcessos
                        ? <InlineNotice tone="warning">Criar o login da loja é com o administrador ou o administrativo. Pule este passo: a loja fica com a pendência Sem login até alguém criar.</InlineNotice>
                        : <>
                            <p className={`${modalStyles.hint} ${modalStyles.flush}`}>O titular entra no painel da loja com este e-mail. Sem login ninguém da loja consegue acessar.</p>
                            <UsuariosDaLoja concessionaria={loja} onMudou={() => { void carregarFicha(loja.id); }} onOcupado={setSalvando} />
                        </>
                )}

                {passo === 3 && loja && (
                    permissoes && !permissoes.ativarPlanos
                        ? <InlineNotice tone="warning">Ativar o plano de repasse é com o administrador. Pule este passo: o 0KM da loja funciona sem plano.</InlineNotice>
                        : <>
                            <p className={`${modalStyles.hint} ${modalStyles.flush}`}>Opcional. O plano só é necessário para a loja anunciar repasse; o 0KM funciona sem ele.</p>
                            <PlanoRepasseCard concessionariaId={loja.id} onChange={setPlanoAtivo} />
                        </>
                )}

                {passo === 4 && loja && (
                    <Resumo loja={loja} ficha={ficha} marcas={marcas} />
                )}

                {erro && <InlineNotice>{erro}</InlineNotice>}
            </div>
        </AdminModal>
    );
}

function Resumo({ loja, ficha, marcas }: { loja: LojaCriada; ficha: FichaDaLoja | null; marcas: MarcasVinculadas }) {
    const feito: string[] = ['Cadastro criado'];
    const nMarcas = ficha?.concessionaria.marcaIds.length ?? marcas.marcaIds.length;
    if (nMarcas > 0) feito.push(nMarcas === 1 ? '1 marca vinculada' : `${nMarcas} marcas vinculadas`);
    if (ficha && ficha.acessos.totalTitulares > 0) feito.push('Login do titular criado');
    if (ficha?.planoRepasse.ativo) feito.push(`Plano de repasse ativo${ficha.planoRepasse.planName ? `: ${ficha.planoRepasse.planName}` : ''}`);
    // Loja recém-criada nunca enviou estoque: isso é o próximo passo dela, não algo que ficou para trás aqui.
    const pendentes = (ficha?.pendencias || []).filter(p => p.id !== 'estoque-parado');

    return (
        <>
            <p className={modalStyles.flush}><strong>{loja.nome}</strong> está cadastrada.</p>
            <ul className={styles.pendencias} aria-label="O que foi feito">
                {feito.map(item => (
                    <li key={item} className={styles.pendencia}>
                        <span className={styles.pendenciaTexto}><CircleCheck size={16} aria-hidden="true" /> {item}</span>
                    </li>
                ))}
            </ul>
            {pendentes.length > 0 ? (
                <>
                    <span className={modalStyles.groupLabel}>Ficou pendente</span>
                    <ul className={styles.pendencias} aria-label="O que ficou pendente">
                        {pendentes.map(p => (
                            <li key={p.id} className={styles.pendencia}>
                                <span className={styles.pendenciaTexto}>
                                    <AlertTriangle size={16} aria-hidden="true" />
                                    <span><strong>{p.rotulo}.</strong> {p.detalhe}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className={`${modalStyles.hint} ${modalStyles.flush}`}>As pendências ficam marcadas na lista de Concessionárias e se resolvem na ficha da loja.</p>
                </>
            ) : ficha ? (
                <p className={pageStyles.muted}>Nada ficou pendente. O próximo passo é a loja enviar o estoque.</p>
            ) : (
                <p className={pageStyles.muted}>Não foi possível conferir as pendências agora. Abra a ficha para ver o que falta.</p>
            )}
        </>
    );
}
