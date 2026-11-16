'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { InlineNotice } from '@/components/ui/Feedback';
import { BoletoDetalhes, CadastroIncompleto, brl, type CobrancaDaLoja } from '@/components/dealership/BoletoDetalhes';
import {
    PRAZO_MAXIMO_BOLETO_DIAS,
    PRAZO_PADRAO_BOLETO_DIAS,
    ROTULO_TIPO_COBRANCA,
    diaEmBrasilia,
    somarDias,
    type TipoCobrancaConcessionaria,
} from '@/lib/utils/cobrancaConcessionaria';

type Loja = { id: string; nome: string; cnpj?: string; ativo?: boolean };
type PlanoVenda = { id: string; name: string; price: number; annualPrice: number | null };
type Info = {
    concessionaria: { id: string; nome: string; razaoSocial: string; email: string };
    faltando: string[];
    planos: PlanoVenda[];
    banners: Array<{ id: string; title: string }>;
};
type Resultado = { cobranca: CobrancaDaLoja; email: { enviado: boolean; para: string; erro: string | null } };

const valorNoCampo = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * A equipe do CNV emite um boleto para uma concessionária: plano de repasse,
 * banner ou cobrança avulsa. Aberto pela tela de Cobranças (escolhe a loja) ou
 * pela ficha da concessionária (loja já definida).
 */
export function EmitirBoletoConcessionariaModal({ concessionaria, tipoInicial = 'plano', onClose, onEmitido }: {
    concessionaria?: { id: string; nome?: string };
    tipoInicial?: TipoCobrancaConcessionaria;
    onClose: () => void;
    onEmitido?: () => void;
}) {
    const hoje = useMemo(() => diaEmBrasilia(new Date()), []);
    const [lojas, setLojas] = useState<Loja[]>([]);
    const [lojaId, setLojaId] = useState(concessionaria?.id || '');
    const [info, setInfo] = useState<Info | null>(null);
    const [carregando, setCarregando] = useState(false);

    const [tipo, setTipo] = useState<TipoCobrancaConcessionaria>(tipoInicial);
    const [planId, setPlanId] = useState('');
    const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
    const [bannerId, setBannerId] = useState('');
    const [descricao, setDescricao] = useState('');
    const [valor, setValor] = useState('');
    const [vencimento, setVencimento] = useState(somarDias(hoje, PRAZO_PADRAO_BOLETO_DIAS));
    const [enviarEmail, setEnviarEmail] = useState(true);
    const [email, setEmail] = useState('');

    const [emitindo, setEmitindo] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [faltando, setFaltando] = useState<string[]>([]);
    const [resultado, setResultado] = useState<Resultado | null>(null);

    // Lista de concessionárias, só quando a loja não veio definida.
    useEffect(() => {
        if (concessionaria?.id) return;
        fetch('/api/admin/cobrancas/concessionaria')
            .then(async res => ({ ok: res.ok, body: await res.json() }))
            .then(({ ok, body }) => { if (ok) setLojas(body.concessionarias || []); else setErro(body.error || 'Erro ao carregar as concessionárias'); })
            .catch(() => setErro('Erro ao carregar as concessionárias'));
    }, [concessionaria?.id]);

    // Dados da loja escolhida: o que falta no cadastro, planos e banners.
    useEffect(() => {
        setInfo(null);
        setFaltando([]);
        setErro(null);
        setBannerId('');
        if (!lojaId) return;
        let vivo = true;
        setCarregando(true);
        fetch(`/api/admin/cobrancas/concessionaria?concessionariaId=${encodeURIComponent(lojaId)}`)
            .then(async res => ({ ok: res.ok, body: await res.json() }))
            .then(({ ok, body }) => {
                if (!vivo) return;
                if (!ok) { setErro(body.error || 'Erro ao carregar a concessionária'); return; }
                setInfo(body);
                setFaltando(body.faltando || []);
                setEmail(body.concessionaria?.email || '');
                setPlanId(prev => (body.planos || []).some((p: PlanoVenda) => p.id === prev) ? prev : body.planos?.[0]?.id || '');
            })
            .catch(() => { if (vivo) setErro('Erro ao carregar a concessionária'); })
            .finally(() => { if (vivo) setCarregando(false); });
        return () => { vivo = false; };
    }, [lojaId]);

    const plano = info?.planos.find(p => p.id === planId) || null;

    // No plano de repasse o valor nasce da tabela; a equipe pode trocar.
    useEffect(() => {
        if (tipo !== 'plano' || !plano) return;
        const anual = billing === 'annual' && plano.annualPrice;
        if (billing === 'annual' && !plano.annualPrice) setBilling('monthly');
        setValor(valorNoCampo(anual ? plano.annualPrice! : plano.price));
    }, [tipo, plano, billing]);

    const cadastroOk = Boolean(info) && faltando.length === 0;
    const semPlanos = tipo === 'plano' && Boolean(info) && info!.planos.length === 0;
    const podeEmitir = cadastroOk && !emitindo && valor.trim() !== '' && Boolean(vencimento)
        && (tipo !== 'plano' || Boolean(planId))
        && (tipo !== 'avulsa' || descricao.trim().length >= 3)
        && (!enviarEmail || email.trim() !== '');

    const emitir = async (event: FormEvent) => {
        event.preventDefault();
        if (!podeEmitir) return;
        setEmitindo(true);
        setErro(null);
        try {
            const res = await fetch('/api/admin/cobrancas/concessionaria', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    concessionariaId: lojaId,
                    tipo,
                    ...(tipo === 'plano' ? { planId, billingType: billing } : {}),
                    ...(tipo === 'banner' && bannerId ? { bannerId } : {}),
                    ...(tipo !== 'plano' ? { descricao: descricao.trim() } : {}),
                    valor,
                    vencimento,
                    enviarEmail,
                    email: email.trim(),
                }),
            });
            const body = await res.json();
            if (!res.ok) {
                if (Array.isArray(body.faltando) && body.faltando.length > 0) setFaltando(body.faltando);
                throw new Error(body.error || 'Não foi possível emitir o boleto');
            }
            setResultado({ cobranca: body.cobranca, email: body.email });
            onEmitido?.();
        } catch (err: any) {
            setErro(err?.message || 'Não foi possível emitir o boleto');
        } finally {
            setEmitindo(false);
        }
    };

    const nomeLoja = info?.concessionaria.nome || concessionaria?.nome || lojas.find(l => l.id === lojaId)?.nome || '';

    if (resultado) {
        return (
            <AdminModal
                title="Boleto emitido"
                subtitle={nomeLoja}
                size="md"
                onClose={onClose}
                footer={<button type="button" className={modalStyles.primary} onClick={onClose}>Concluir</button>}
            >
                <div className={modalStyles.stack}>
                    <BoletoDetalhes cobranca={resultado.cobranca} />
                    {resultado.email.enviado && <InlineNotice tone="positive">Boleto enviado para {resultado.email.para}.</InlineNotice>}
                    {resultado.email.erro && (
                        <InlineNotice tone="warning">O boleto foi emitido, mas o e-mail para {resultado.email.para} falhou: {resultado.email.erro}. Reenvie pela lista de Cobranças.</InlineNotice>
                    )}
                    {!resultado.email.enviado && !resultado.email.erro && (
                        <p className={modalStyles.hint}>O boleto não foi enviado por e-mail. Ele aparece para a concessionária em Cobranças e pode ser reenviado pela lista.</p>
                    )}
                </div>
            </AdminModal>
        );
    }

    return (
        <AdminModal
            title="Emitir boleto para concessionária"
            subtitle={nomeLoja || 'Plano de repasse, banner ou cobrança avulsa'}
            size="md"
            busy={emitindo}
            onClose={onClose}
            onSubmit={emitir}
            footer={<>
                <button type="button" className={modalStyles.secondary} onClick={onClose} disabled={emitindo}>Cancelar</button>
                <button type="submit" className={modalStyles.primary} disabled={!podeEmitir}>{emitindo ? 'Emitindo...' : 'Emitir boleto'}</button>
            </>}
        >
            <div className={modalStyles.stack}>
                {!concessionaria?.id && (
                    <label className={modalStyles.field}>
                        Concessionária
                        <select value={lojaId} onChange={e => setLojaId(e.target.value)} required autoFocus>
                            <option value="">Escolha a concessionária</option>
                            {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}{l.ativo === false ? ' (inativa)' : ''}</option>)}
                        </select>
                    </label>
                )}

                {carregando && <p className={modalStyles.hint}>Conferindo o cadastro da concessionária...</p>}
                {info && faltando.length > 0 && <InlineNotice tone="warning"><CadastroIncompleto faltando={faltando} paraEquipe /></InlineNotice>}

                {info && (
                    <>
                        <fieldset className={modalStyles.group}>
                            <legend className={modalStyles.groupLabel}>O que está sendo cobrado</legend>
                            <div className={modalStyles.choices}>
                                {(Object.keys(ROTULO_TIPO_COBRANCA) as TipoCobrancaConcessionaria[]).map(t => (
                                    <label key={t} className={modalStyles.choice}>
                                        <input type="radio" name="tipo-cobranca" checked={tipo === t} onChange={() => { setTipo(t); if (t !== 'plano') setValor(''); }} />
                                        {ROTULO_TIPO_COBRANCA[t]}
                                    </label>
                                ))}
                            </div>
                        </fieldset>

                        {tipo === 'plano' && (
                            semPlanos
                                ? <InlineNotice tone="warning">Nenhum plano de concessionária ativo. Crie um em Administração, Planos, com o público Concessionária.</InlineNotice>
                                : (
                                    <div className={modalStyles.grid2}>
                                        <label className={modalStyles.field}>
                                            Plano de repasse
                                            <select value={planId} onChange={e => setPlanId(e.target.value)} required>
                                                {info.planos.map(p => <option key={p.id} value={p.id}>{p.name} · {brl(p.price)}/mês</option>)}
                                            </select>
                                        </label>
                                        <label className={modalStyles.field}>
                                            Período
                                            <select value={billing} onChange={e => setBilling(e.target.value as 'monthly' | 'annual')}>
                                                <option value="monthly">Mensal (30 dias)</option>
                                                {plano?.annualPrice && <option value="annual">Anual</option>}
                                            </select>
                                        </label>
                                        <span className={`${modalStyles.hint} ${modalStyles.span2}`}>Quando o boleto for pago, o plano de repasse da loja é ativado ou renovado sozinho.</span>
                                    </div>
                                )
                        )}

                        {tipo === 'banner' && (
                            <div className={modalStyles.stack}>
                                {info.banners.length > 0 && (
                                    <label className={modalStyles.field}>
                                        Anúncio aguardando pagamento (opcional)
                                        <select value={bannerId} onChange={e => setBannerId(e.target.value)}>
                                            <option value="">Nenhum: só registrar a cobrança</option>
                                            {info.banners.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
                                        </select>
                                        <span className={modalStyles.hint}>Com um anúncio escolhido, o pagamento manda o banner para a análise da equipe.</span>
                                    </label>
                                )}
                                <label className={modalStyles.field}>
                                    Descrição (opcional)
                                    <input type="text" maxLength={140} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: banner da página inicial, 7 dias" />
                                </label>
                            </div>
                        )}

                        {tipo === 'avulsa' && (
                            <label className={modalStyles.field}>
                                Descrição da cobrança
                                <input type="text" required minLength={3} maxLength={140} value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex.: taxa de adesão" />
                                <span className={modalStyles.hint}>Aparece no boleto, no e-mail e no histórico da concessionária.</span>
                            </label>
                        )}

                        <div className={modalStyles.grid2}>
                            <label className={modalStyles.field}>
                                Valor (R$)
                                <input type="text" inputMode="decimal" required value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
                            </label>
                            <label className={modalStyles.field}>
                                Vencimento
                                <input type="date" required value={vencimento} min={somarDias(hoje, 1)} max={somarDias(hoje, PRAZO_MAXIMO_BOLETO_DIAS)} onChange={e => setVencimento(e.target.value)} />
                            </label>
                        </div>

                        <div className={modalStyles.stack}>
                            <div className={modalStyles.choices}>
                                <label className={modalStyles.choice}>
                                    <input type="checkbox" checked={enviarEmail} onChange={e => setEnviarEmail(e.target.checked)} />
                                    Enviar o boleto por e-mail
                                </label>
                            </div>
                            {enviarEmail && (
                                <label className={modalStyles.field}>
                                    E-mail de destino
                                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} />
                                    <span className={modalStyles.hint}>Preenchido com o e-mail do cadastro da concessionária.</span>
                                </label>
                            )}
                        </div>
                    </>
                )}

                {erro && <InlineNotice>{erro}</InlineNotice>}
            </div>
        </AdminModal>
    );
}
