'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { InlineNotice } from '@/components/ui/Feedback';
import { lerValorEmReais } from '@/lib/utils/valorCombinado';
import styles from './ClienteFinanceiro.module.css';

type Resumo = {
    plano: { id: string; nome: string; periodicidade: 'monthly' | 'annual'; tabela: number } | null;
    valorCombinado: { valor?: number; observacao?: string; atualizadoPor?: string; atualizadoEm?: string; vale: boolean } | null;
    valorAtual: number | null;
    telasExtras: number;
    valorPorTela: number;
    proximaCobranca: number | null;
    boletosEmAberto: number;
    assinaturaCartao?: 'atualizada' | 'falhou' | null;
};

const brl = (v: number) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const valorNoCampo = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Valor que o cliente paga: o da tabela do plano ou um valor combinado pela
 * equipe. O combinado vale para as próximas cobranças do sistema (boleto de
 * renovação, cartão, Pix da Vera e checkout) enquanto o cliente estiver no
 * mesmo plano e na mesma periodicidade.
 */
export function ValorCombinadoCliente({ userId, onChange }: { userId: string; onChange?: () => void }) {
    const [resumo, setResumo] = useState<Resumo | null>(null);
    const [carregando, setCarregando] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [form, setForm] = useState<{ valor: string; observacao: string } | null>(null);
    const [salvando, setSalvando] = useState(false);

    const carregar = useCallback(async () => {
        setCarregando(true);
        setErro(null);
        try {
            const res = await fetch(`/api/admin/clientes/${userId}/valor-combinado`, { cache: 'no-store' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Não foi possível carregar o valor do cliente.');
            setResumo(data);
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível carregar o valor do cliente.');
        } finally {
            setCarregando(false);
        }
    }, [userId]);

    useEffect(() => { void carregar(); }, [carregar]);

    const depoisDeSalvar = (data: Resumo, mensagem: string) => {
        setResumo(data);
        const extras = [
            data.assinaturaCartao === 'atualizada' ? 'A assinatura no cartão já foi atualizada no Mercado Pago.' : '',
            data.assinaturaCartao === 'falhou' ? 'Atenção: não deu para atualizar a assinatura no cartão do Mercado Pago. Confira lá.' : '',
            data.boletosEmAberto > 0 ? `${data.boletosEmAberto === 1 ? 'Há 1 boleto em aberto' : `Há ${data.boletosEmAberto} boletos em aberto`} com o valor antigo.` : '',
        ].filter(Boolean);
        setAviso([mensagem, ...extras].join(' '));
        onChange?.();
    };

    const salvar = async (event: FormEvent) => {
        event.preventDefault();
        if (!form) return;
        const valor = lerValorEmReais(form.valor);
        if (valor === null || valor <= 0) {
            setErro('Informe um valor maior que zero.');
            return;
        }
        setSalvando(true);
        setErro(null);
        try {
            const res = await fetch(`/api/admin/clientes/${userId}/valor-combinado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ valor, observacao: form.observacao }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Não foi possível salvar o valor.');
            setForm(null);
            depoisDeSalvar(data, data.valorCombinado?.vale ? `Valor combinado salvo: ${brl(data.valorAtual)}.` : 'Valor igual ao da tabela: o cliente segue no preço do plano.');
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível salvar o valor.');
        } finally {
            setSalvando(false);
        }
    };

    const voltarParaTabela = async () => {
        setSalvando(true);
        setErro(null);
        try {
            const res = await fetch(`/api/admin/clientes/${userId}/valor-combinado`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Não foi possível voltar para a tabela.');
            depoisDeSalvar(data, 'O cliente voltou para o preço da tabela.');
        } catch (e: any) {
            setErro(e?.message || 'Não foi possível voltar para a tabela.');
        } finally {
            setSalvando(false);
        }
    };

    if (carregando && !resumo) return <p className={styles.vazio}>Carregando valor...</p>;
    if (!resumo) return erro ? <div className={styles.erro}>{erro}</div> : null;

    const periodo = resumo.plano?.periodicidade === 'annual' ? '/ano' : '/mês';
    const combinado = resumo.valorCombinado?.vale ? resumo.valorCombinado : null;
    const combinadoDeOutroPlano = resumo.valorCombinado && !resumo.valorCombinado.vale ? resumo.valorCombinado : null;

    return (
        <div className={styles.wrap}>
            {erro && !form && <div className={styles.erro}>{erro}</div>}
            {aviso && <div className={styles.aviso}>{aviso}</div>}

            {!resumo.plano ? (
                <p className={styles.vazio}>O cliente não tem plano mensal ativo. Ative um plano para combinar um valor.</p>
            ) : (
                <article className={styles.card}>
                    <header className={styles.cardTopo}>
                        <div>
                            <strong className={styles.valor}>{brl(resumo.valorAtual || 0)}{periodo}</strong>
                            <span className={styles.plano}>{resumo.plano.nome}</span>
                        </div>
                        <span className={`${styles.chip} ${combinado ? styles.alerta : styles.neutro}`}>{combinado ? 'Valor combinado' : 'Preço da tabela'}</span>
                    </header>

                    <dl className={styles.dados}>
                        <div>
                            <dt>Tabela</dt>
                            <dd>{brl(resumo.plano.tabela)}{periodo}</dd>
                        </div>
                        <div>
                            <dt>Próxima cobrança</dt>
                            <dd>
                                {brl(resumo.proximaCobranca || 0)}
                                {resumo.telasExtras > 0 && (
                                    <span className={styles.sub}>
                                        {brl(resumo.valorAtual || 0)} + {resumo.telasExtras} {resumo.telasExtras === 1 ? 'tela extra' : 'telas extras'} de {brl(resumo.valorPorTela)}
                                    </span>
                                )}
                            </dd>
                        </div>
                        {combinado && (
                            <div>
                                <dt>Combinado por</dt>
                                <dd>
                                    {combinado.atualizadoPor || '-'}
                                    {combinado.atualizadoEm && <span className={styles.sub}>{new Date(combinado.atualizadoEm).toLocaleDateString('pt-BR')}</span>}
                                    {combinado.observacao && <span className={styles.sub}>{combinado.observacao}</span>}
                                </dd>
                            </div>
                        )}
                        {combinadoDeOutroPlano && (
                            <div>
                                <dt>Atenção</dt>
                                <dd>
                                    <span className={styles.sub}>
                                        Havia um valor combinado de {brl(combinadoDeOutroPlano.valor || 0)} para outro plano ou periodicidade. Ele não vale para o plano atual.
                                    </span>
                                </dd>
                            </div>
                        )}
                    </dl>

                    <footer className={styles.acoes}>
                        <button
                            type="button"
                            className={`${styles.btn} ${styles.btnPrimario}`}
                            onClick={() => { setErro(null); setAviso(null); setForm({ valor: valorNoCampo(resumo.valorAtual || resumo.plano!.tabela), observacao: combinado?.observacao || '' }); }}
                            disabled={salvando}
                        >
                            {combinado ? 'Alterar valor' : 'Combinar outro valor'}
                        </button>
                        {combinado && (
                            <button type="button" className={styles.btn} onClick={voltarParaTabela} disabled={salvando}>
                                Voltar ao preço da tabela
                            </button>
                        )}
                    </footer>
                </article>
            )}

            {form && resumo.plano && (
                <AdminModal
                    size="sm"
                    title="Valor combinado"
                    subtitle={<>Vale para as próximas cobranças de <strong>{resumo.plano.nome}</strong> ({resumo.plano.periodicidade === 'annual' ? 'anual' : 'mensal'}). Tabela: {brl(resumo.plano.tabela)}{periodo}.</>}
                    onClose={() => { if (!salvando) setForm(null); }}
                    busy={salvando}
                    onSubmit={salvar}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={() => setForm(null)} disabled={salvando}>Cancelar</button>
                        <button type="submit" className={modalStyles.primary} disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar valor'}</button>
                    </>}
                >
                    <div className={modalStyles.stack}>
                        {erro && <InlineNotice>{erro}</InlineNotice>}
                        <label className={modalStyles.field}>
                            Valor do plano ({resumo.plano.periodicidade === 'annual' ? 'por ano' : 'por mês'})
                            <input
                                value={form.valor}
                                onChange={e => setForm({ ...form, valor: e.target.value })}
                                inputMode="decimal"
                                placeholder="Ex.: 500,00"
                                autoFocus
                            />
                            <span className={modalStyles.hint}>
                                Sem as telas extras{resumo.telasExtras > 0 ? `: as ${resumo.telasExtras} do cliente continuam somadas a ${brl(resumo.valorPorTela)} cada` : ''}.
                                Se o cliente mudar de plano ou de periodicidade, volta a valer a tabela.
                            </span>
                        </label>
                        <label className={modalStyles.field}>
                            Observação (opcional)
                            <input
                                value={form.observacao}
                                onChange={e => setForm({ ...form, observacao: e.target.value })}
                                maxLength={300}
                                placeholder="Ex.: desconto de parceria"
                            />
                        </label>
                    </div>
                </AdminModal>
            )}
        </div>
    );
}
