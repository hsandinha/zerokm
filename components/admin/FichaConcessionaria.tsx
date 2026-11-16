'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { AlertTriangle, Receipt } from 'lucide-react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import { Avatar, Button, StatusBadge, pageStyles } from '@/components/ui/Page';
import { InlineNotice } from '@/components/ui/Feedback';
import { PlanoRepasseCard } from '@/components/dealership/PlanoRepasseCard';
import { AtendentesDaLojaMiolo } from '@/components/dealership/Atendentes';
import { DealerInventory } from '@/components/dealership/DealerInventory';
import { UsuariosDaLoja } from '@/components/admin/UsuariosDaLojaModal';
import { RecursosDaConta } from '@/components/admin/RecursosManagement';
import { CobrancasManagement } from '@/components/admin/CobrancasManagement';
import { EmitirBoletoConcessionariaModal } from '@/components/admin/EmitirBoletoConcessionariaModal';
import { CamposDaConcessionaria, dadosDaLoja, useOperadores, type DadosForm } from '@/components/admin/ficha/DadosDaConcessionaria';
import { MarcasDaLoja } from '@/components/admin/ficha/MarcasDaLoja';
import { AssinaturaAtendimentoCard } from '@/components/admin/ficha/AssinaturaAtendimentoCard';
import type { Pendencia } from '@/lib/utils/pendenciasDaLoja';
import type { PermissoesDaFicha } from '@/lib/utils/permissoesDaFicha';
import planoStyles from '@/components/dealership/RepasseCatalog.module.css';
import styles from './FichaConcessionaria.module.css';

export type AbaDaFicha = 'dados' | 'marcas' | 'acessos' | 'planos' | 'funcionalidades' | 'cobrancas' | 'estoque';

type Atendimento = {
    liberado: boolean;
    situacao: 'nao_liberado' | 'nao_iniciado' | 'teste' | 'assinante' | 'vencido';
    plano: string | null;
    ate: string | null;
};

/** Resposta de GET /api/admin/concessionarias/:id/ficha. */
export type FichaDaLoja = {
    concessionaria: {
        id: string;
        nome?: string;
        razaoSocial?: string;
        cnpj?: string;
        cidade?: string;
        uf?: string;
        ativo?: boolean;
        marcaIds: string[];
        marcas: string[];
        ocultarVitrine?: boolean;
        totalVeiculos?: number;
        [campo: string]: unknown;
    };
    operador: { id: string; nome: string } | null;
    acessos: {
        titulares: Array<{ nome: string; email: string }>;
        totalTitulares: number;
        atendentes: number;
        atendentesAtivos: number;
        limiteAtendentes: number;
    };
    planoRepasse: { ativo: boolean; planName: string | null; expiresAt: string | null };
    atendimento: Atendimento;
    pendencias: Pendencia[];
    permissoes: PermissoesDaFicha;
};

const ROTULO_DA_ABA: Record<AbaDaFicha, string> = {
    dados: 'Dados',
    marcas: 'Marcas',
    acessos: 'Acessos',
    planos: 'Planos e assinaturas',
    funcionalidades: 'Funcionalidades',
    cobrancas: 'Cobranças',
    estoque: 'Estoque',
};

const ORDEM: AbaDaFicha[] = ['dados', 'marcas', 'acessos', 'planos', 'funcionalidades', 'cobrancas', 'estoque'];

const cnpjFormatado = (valor?: string) => {
    const d = (valor ?? '').replace(/\D/g, '');
    return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : valor || '';
};
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '-');

/** Abas que o perfil logado usa. As demais nem aparecem: o servidor recusaria os dados delas. */
export function abasDaFicha(permissoes: PermissoesDaFicha): AbaDaFicha[] {
    return ORDEM.filter(aba => (
        aba === 'funcionalidades' ? permissoes.liberarRecursos
            : aba === 'cobrancas' ? permissoes.verCobrancas
                : aba === 'estoque' ? permissoes.verEstoque
                    : true
    ));
}

/**
 * Ficha única da concessionária: tudo o que a equipe faz por uma loja (cadastro,
 * marcas, acessos, planos, funcionalidades, cobranças e estoque) num modal só,
 * com as pendências no cabeçalho. Cada aba só carrega quando é aberta, e
 * continua montada depois para não perder o que estava sendo feito.
 */
export function FichaConcessionariaModal({ concessionariaId, abaInicial = 'dados', onClose, onMudou }: {
    concessionariaId: string;
    abaInicial?: AbaDaFicha;
    onClose: () => void;
    /** Algo da loja mudou: a lista de Concessionárias recarrega. */
    onMudou?: () => void;
}) {
    const [ficha, setFicha] = useState<FichaDaLoja | null>(null);
    const [erro, setErro] = useState<string | null>(null);
    const [aba, setAba] = useState<AbaDaFicha>(abaInicial);
    const [abertas, setAbertas] = useState<AbaDaFicha[]>([abaInicial]);
    const [emitindoBoleto, setEmitindoBoleto] = useState(false);
    const [boletosEmitidos, setBoletosEmitidos] = useState(0);
    const onMudouRef = useRef(onMudou);
    onMudouRef.current = onMudou;

    const carregar = useCallback(async () => {
        try {
            const res = await fetch(`/api/admin/concessionarias/${concessionariaId}/ficha`);
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'Não foi possível carregar a ficha.');
            setFicha(body);
            setErro(null);
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível carregar a ficha.');
        }
    }, [concessionariaId]);

    useEffect(() => { void carregar(); }, [carregar]);

    /** Depois de qualquer alteração: pendências do cabeçalho e a lista atrás do modal. */
    const mudou = useCallback(() => {
        void carregar();
        onMudouRef.current?.();
    }, [carregar]);

    // O cartão do plano avisa a cada leitura; só interessa quando a situação muda.
    const planoAtivo = useRef<boolean | null>(null);
    const planoMudou = useCallback((ativo: boolean) => {
        if (planoAtivo.current !== null && planoAtivo.current !== ativo) mudou();
        planoAtivo.current = ativo;
    }, [mudou]);

    const fechar = () => {
        // Renovação de plano muda o vencimento sem mudar a situação: a lista recarrega ao fechar.
        if (abertas.includes('planos') || abertas.includes('cobrancas')) onMudouRef.current?.();
        onClose();
    };

    const abrir = (proxima: AbaDaFicha) => {
        setAba(proxima);
        setAbertas(atual => (atual.includes(proxima) ? atual : [...atual, proxima]));
    };

    const loja = ficha?.concessionaria;
    const abas = ficha ? abasDaFicha(ficha.permissoes) : [];
    // Aba pedida que o perfil não usa (ex.: vendedor em Estoque) cai nos dados.
    const atual: AbaDaFicha = ficha && !abas.includes(aba) ? 'dados' : aba;
    const montada = (a: AbaDaFicha) => abas.includes(a) && (a === atual || abertas.includes(a));
    const nome = loja?.nome || loja?.razaoSocial || 'Concessionária';
    const local = [loja?.cidade, loja?.uf].filter(Boolean).join('/');

    return (
        <AdminModal
            size="xxl"
            title={ficha ? nome : 'Ficha da concessionária'}
            leading={ficha ? <Avatar name={nome} /> : undefined}
            subtitle={ficha
                ? [loja?.cnpj ? `CNPJ ${cnpjFormatado(loja.cnpj)}` : 'Sem CNPJ', local || 'Sem cidade'].join(' · ')
                : 'Carregando...'}
            titleAside={ficha && (
                <span className={styles.selos}>
                    <StatusBadge tone={loja?.ativo === false ? 'neutral' : 'positive'}>{loja?.ativo === false ? 'Inativa' : 'Ativa'}</StatusBadge>
                    {loja?.ocultarVitrine && <StatusBadge tone="warning" dot={false}>Oculta na vitrine</StatusBadge>}
                    {ficha.pendencias.map(p => (
                        <button key={p.id} type="button" className={styles.selo} title={`${p.detalhe} Clique para resolver.`} onClick={() => abrir(p.aba)}>
                            <StatusBadge tone="warning">{p.rotulo}</StatusBadge>
                        </button>
                    ))}
                </span>
            )}
            toolbar={ficha && (
                <div className={styles.abas} role="tablist" aria-label="Seções da ficha">
                    {abas.map(a => {
                        const pendente = ficha.pendencias.some(p => p.aba === a);
                        return (
                            <button key={a} type="button" role="tab" aria-selected={a === atual} className={pageStyles.tab} onClick={() => abrir(a)}>
                                {ROTULO_DA_ABA[a]}
                                {pendente && <span className={styles.abaPonto} role="img" aria-label="com pendência" />}
                            </button>
                        );
                    })}
                </div>
            )}
            onClose={fechar}
            bodyClassName={styles.corpo}
            footer={<button type="button" className={modalStyles.secondary} onClick={fechar}>Fechar</button>}
        >
            {erro && <InlineNotice>{erro}</InlineNotice>}
            {!ficha && !erro && <p className={pageStyles.muted}>Carregando a ficha...</p>}

            {ficha && loja && (
                <>
                    {montada('dados') && (
                        <div role="tabpanel" hidden={atual !== 'dados'}>
                            <AbaDados ficha={ficha} onAbrir={abrir} onSalvo={mudou} />
                        </div>
                    )}

                    {montada('marcas') && (
                        <div role="tabpanel" hidden={atual !== 'marcas'}>
                            <MarcasDaLoja
                                concessionariaId={loja.id}
                                inicial={{ marcaIds: loja.marcaIds || [], marcas: loja.marcas || [] }}
                                podeEditar={ficha.permissoes.editarMarcas}
                                onMudou={mudou}
                            />
                        </div>
                    )}

                    {montada('acessos') && (
                        <div role="tabpanel" hidden={atual !== 'acessos'}>
                            {ficha.permissoes.gerirAcessos ? (
                                <>
                                    <section className={styles.secao}>
                                        <h3 className={styles.secaoTitulo}>Login do titular</h3>
                                        <p className={styles.secaoTexto}>Quem entra no painel da loja com acesso a tudo: estoque, preços, repasse, plano e cobrança.</p>
                                        <UsuariosDaLoja concessionaria={{ id: loja.id, nome }} onMudou={mudou} />
                                    </section>
                                    <section className={styles.secao}>
                                        <h3 className={styles.secaoTitulo}>Atendentes</h3>
                                        <p className={styles.secaoTexto}>Logins que operam o estoque, os preços, o repasse e o atendimento da loja, sem acesso a plano e cobrança.</p>
                                        <AtendentesDaLojaMiolo concessionariaId={loja.id} />
                                    </section>
                                </>
                            ) : (
                                <div className={modalStyles.stack}>
                                    <div className={modalStyles.facts}>
                                        <div className={modalStyles.fact}>
                                            <span className={modalStyles.factLabel}>Login do titular</span>
                                            <span className={modalStyles.factValue}>{ficha.acessos.totalTitulares > 0 ? `${ficha.acessos.totalTitulares} com acesso` : 'Nenhum'}</span>
                                        </div>
                                        <div className={modalStyles.fact}>
                                            <span className={modalStyles.factLabel}>Atendentes ativos</span>
                                            <span className={modalStyles.factValue}>{ficha.acessos.atendentesAtivos} de {ficha.acessos.limiteAtendentes}</span>
                                        </div>
                                    </div>
                                    <InlineNotice tone="warning">Criar, vincular e redefinir logins é com o administrador ou o administrativo.</InlineNotice>
                                </div>
                            )}
                        </div>
                    )}

                    {montada('planos') && (
                        <div role="tabpanel" hidden={atual !== 'planos'}>
                            <div className={styles.cartoes}>
                                <section>
                                    <h3 className={styles.secaoTitulo}>Plano de repasse</h3>
                                    <p className={styles.secaoTexto}>Com o plano em dia, os repasses desta loja aparecem para os lojistas. O 0KM não depende de plano.</p>
                                    {ficha.permissoes.ativarPlanos
                                        ? <PlanoRepasseCard concessionariaId={loja.id} onChange={planoMudou} />
                                        : <RepasseResumo plano={ficha.planoRepasse} />}
                                </section>
                                <section>
                                    <h3 className={styles.secaoTitulo}>Atendimento por WhatsApp</h3>
                                    <p className={styles.secaoTexto}>Central de conversas e IA de vendas da loja. A assinatura cobre a plataforma; o consumo a loja paga ao provedor.</p>
                                    {ficha.permissoes.ativarPlanos
                                        ? <AssinaturaAtendimentoCard
                                            // Liberar o Atendimento na aba Funcionalidades muda este cartão: ele relê.
                                            key={String(ficha.atendimento.liberado)}
                                            concessionariaId={loja.id}
                                            onChange={mudou}
                                            onAbrirFuncionalidades={abas.includes('funcionalidades') ? () => abrir('funcionalidades') : undefined}
                                        />
                                        : <AtendimentoResumo atendimento={ficha.atendimento} />}
                                </section>
                            </div>
                            <div className={styles.acoesDaAba}>
                                {!ficha.permissoes.ativarPlanos && <span className={pageStyles.muted}>Ativar, renovar e dar cortesia é com o administrador.</span>}
                                {ficha.permissoes.emitirBoleto && (
                                    <Button icon={<Receipt size={16} aria-hidden="true" />} onClick={() => setEmitindoBoleto(true)}>Emitir boleto para esta loja</Button>
                                )}
                            </div>
                        </div>
                    )}

                    {montada('funcionalidades') && (
                        <div role="tabpanel" hidden={atual !== 'funcionalidades'}>
                            <RecursosDaConta tipo="concessionaria" id={loja.id} onSalvo={mudou} />
                        </div>
                    )}

                    {montada('cobrancas') && (
                        <div role="tabpanel" hidden={atual !== 'cobrancas'}>
                            <CobrancasManagement key={boletosEmitidos} concessionaria={{ id: loja.id, nome }} />
                        </div>
                    )}

                    {montada('estoque') && (
                        <div role="tabpanel" hidden={atual !== 'estoque'}>
                            <DealerInventory concessionariaId={loja.id} />
                        </div>
                    )}
                </>
            )}

            {emitindoBoleto && loja && (
                <EmitirBoletoConcessionariaModal
                    concessionaria={{ id: loja.id, nome }}
                    onClose={() => setEmitindoBoleto(false)}
                    // O boleto novo entra na aba Cobranças, se ela já estiver aberta.
                    onEmitido={() => { setBoletosEmitidos(n => n + 1); mudou(); }}
                />
            )}
        </AdminModal>
    );
}

/** Aba Dados: o que falta resolver, o cadastro e o operador responsável. */
function AbaDados({ ficha, onAbrir, onSalvo }: { ficha: FichaDaLoja; onAbrir: (aba: AbaDaFicha) => void; onSalvo: () => void }) {
    const operadores = useOperadores();
    const [form, setForm] = useState<DadosForm>(() => dadosDaLoja(ficha.concessionaria as any));
    const [salvo, setSalvo] = useState(form);
    const [salvando, setSalvando] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const mudou = JSON.stringify(form) !== JSON.stringify(salvo);

    const salvar = async (event: FormEvent) => {
        event.preventDefault();
        setSalvando(true);
        setErro(null);
        setAviso(null);
        try {
            const res = await fetch(`/api/concessionarias/${ficha.concessionaria.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...form, uf: form.uf.toUpperCase() }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error || 'Não foi possível salvar o cadastro.');
            setSalvo(form);
            setAviso('Cadastro salvo.');
            onSalvo();
        } catch (e) {
            setErro(e instanceof Error ? e.message : 'Não foi possível salvar o cadastro.');
        } finally {
            setSalvando(false);
        }
    };

    return (
        <>
            {ficha.pendencias.length > 0 && (
                <ul className={styles.pendencias} aria-label="Pendências desta loja">
                    {ficha.pendencias.map(p => (
                        <li key={p.id} className={styles.pendencia}>
                            <span className={styles.pendenciaTexto}>
                                <AlertTriangle size={16} aria-hidden="true" />
                                <span><strong>{p.rotulo}.</strong> {p.detalhe}</span>
                            </span>
                            <Button onClick={() => onAbrir(p.aba)}>Resolver</Button>
                        </li>
                    ))}
                </ul>
            )}
            <form onSubmit={salvar}>
                <CamposDaConcessionaria
                    value={form}
                    onChange={v => { setAviso(null); setForm(v); }}
                    operadores={operadores}
                    podeTrocarOperador={ficha.permissoes.trocarOperador}
                    disabled={salvando || !ficha.permissoes.editarDados}
                />
                {erro && <InlineNotice>{erro}</InlineNotice>}
                {aviso && <InlineNotice tone="positive">{aviso}</InlineNotice>}
                {ficha.permissoes.editarDados && (
                    <div className={styles.acoesDaAba}>
                        <button type="submit" className={modalStyles.primary} disabled={salvando || !mudou}>
                            {salvando ? 'Salvando...' : 'Salvar alterações'}
                        </button>
                    </div>
                )}
            </form>
        </>
    );
}

/** Cartão de situação para quem só consulta (ativar e renovar é do administrador). */
function CartaoDeSituacao({ titulo, texto, emDia }: { titulo: string; texto: string; emDia: boolean }) {
    return (
        <div className={`${planoStyles.planoCard} ${emDia ? planoStyles.planoAtivo : planoStyles.planoInativo}`}>
            <div className={planoStyles.planoHeader}>
                <div>
                    <strong>{titulo}</strong>
                    <p className={planoStyles.planoTexto}>{texto}</p>
                </div>
            </div>
        </div>
    );
}

function RepasseResumo({ plano }: { plano: FichaDaLoja['planoRepasse'] }) {
    if (plano.ativo) {
        return <CartaoDeSituacao emDia titulo={`Plano de repasse ativo: ${plano.planName || 'plano'}`} texto={`Válido até ${data(plano.expiresAt)}. Os repasses da loja aparecem para os lojistas.`} />;
    }
    return plano.expiresAt
        ? <CartaoDeSituacao emDia={false} titulo="Plano de repasse vencido" texto={`Venceu em ${data(plano.expiresAt)}. Os anúncios estão fora da vitrine até a renovação.`} />
        : <CartaoDeSituacao emDia={false} titulo="Sem plano de repasse" texto="A loja ainda não anuncia repasse para os lojistas." />;
}

function AtendimentoResumo({ atendimento }: { atendimento: Atendimento }) {
    const { situacao, plano, ate } = atendimento;
    const titulo = situacao === 'nao_liberado' ? 'Atendimento não liberado para esta loja'
        : situacao === 'nao_iniciado' ? 'Atendimento liberado, ainda sem uso'
            : situacao === 'assinante' ? `Assinatura do atendimento ativa: ${plano || 'plano'}`
                : situacao === 'teste' ? 'Atendimento em período de teste'
                    : 'Assinatura do atendimento vencida';
    const texto = situacao === 'nao_liberado' ? 'A funcionalidade Atendimento está desligada para esta conta.'
        : situacao === 'nao_iniciado' ? 'O teste de 7 dias começa no primeiro acesso da loja ao atendimento.'
            : situacao === 'assinante' ? `Válida até ${data(ate)}.`
                : situacao === 'teste' ? `Teste até ${data(ate)}.`
                    : `Sem acesso desde ${data(ate)}. A IA está parada.`;
    return <CartaoDeSituacao titulo={titulo} texto={texto} emDia={situacao === 'assinante' || situacao === 'teste'} />;
}
