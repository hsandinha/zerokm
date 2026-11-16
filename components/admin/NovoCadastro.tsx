'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { getSession } from 'next-auth/react';
import { Building2, Check, ContactRound, Plus, Store } from 'lucide-react';
import { AdminModal, modalStyles } from './AdminModal';
import styles from './NovoCadastro.module.css';
import crmStyles from './CRMManagement.module.css';
import { Button, StatusBadge } from '@/components/ui/Page';
import { InlineNotice } from '@/components/ui/Feedback';
import { NovaConcessionariaGuiada } from './NovaConcessionariaGuiada';
import { FichaClienteModal } from './FichaCliente';
import { PerfisDaEquipe } from './PerfisDaEquipe';
import {
    AtribuirPlanoCampos, atribuicaoInicial, enviarAtribuicaoDePlano, erroDaAtribuicao,
    type AtribuicaoDePlano, type ClienteDoPlano, type ModoDeAtribuicao,
} from './cliente/AtribuirPlano';
import { ConvidadosDoCliente } from './cliente/ConvidadosDoCliente';
import { carregarPlanosDoLojista, mascaraTelefone, type CRMClient, type PlanoDoLojista } from './cliente/tipos';
import { createUser } from '@/app/dashboard/admin/users/actions';
import { toggleProfileSelection } from '@/lib/utils/userProfiles';
import { validateCNPJ, validateCPF } from '@/lib/utils/cpf';
import { pendenciasDoCliente, type PendenciaDoCliente } from '@/lib/utils/pendenciasDoCliente';
import { perfisRestritosDoCriador, tiposDeCadastroDoPerfil, type TipoDeCadastro } from '@/lib/utils/perfisDoNovoCadastro';
import type { UserProfile } from '@/lib/types/auth';

export type CadastroCriado = { tipo: TipoDeCadastro; id?: string };

export interface NovoCadastroModalProps {
    onClose: () => void;
    /** Chamado assim que a conta passa a existir (o passo a passo pode continuar depois). */
    onCriado?: (criado: CadastroCriado) => void;
    /** Abre direto no passo a passo deste perfil, se quem está logado puder criar. */
    perfilInicial?: TipoDeCadastro;
    /** Perfil de quem está criando. Sem ele, vem da sessão. */
    perfil?: string | null;
}

const OPCOES: Record<TipoDeCadastro, { titulo: string; descricao: string; passos: string; icone: ReactNode }> = {
    concessionaria: {
        titulo: 'Concessionária',
        descricao: 'Loja que anuncia estoque de zero km e repasse.',
        passos: 'Dados da loja, marcas e login',
        icone: <Building2 size={22} aria-hidden="true" />,
    },
    lojista: {
        titulo: 'Lojista (cliente)',
        descricao: 'Revenda ou lojista que consulta o estoque de zero km.',
        passos: 'Dados, acesso, assinatura e convidados',
        icone: <Store size={22} aria-hidden="true" />,
    },
    equipe: {
        titulo: 'Equipe interna',
        descricao: 'Pessoa do time: administração, operação, vendas ou marketing.',
        passos: 'Nome, e-mail, senha provisória e perfis',
        icone: <ContactRound size={22} aria-hidden="true" />,
    },
};

/**
 * Cadastro unificado: primeiro o perfil da conta, depois o passo a passo dele.
 * Cada opção só aparece para quem o servidor deixa criar (lib/utils/perfisDoNovoCadastro.ts).
 */
export function NovoCadastroModal({ onClose, onCriado, perfilInicial, perfil }: NovoCadastroModalProps) {
    const [perfilDaSessao, setPerfilDaSessao] = useState<string | null | undefined>(perfil);
    const [tipo, setTipo] = useState<TipoDeCadastro | null>(null);
    const [escolheu, setEscolheu] = useState(false);

    useEffect(() => {
        if (perfil !== undefined) { setPerfilDaSessao(perfil); return; }
        let vivo = true;
        getSession()
            .then(s => { if (vivo) setPerfilDaSessao((s?.user?.profile as string | undefined) ?? null); })
            .catch(() => { if (vivo) setPerfilDaSessao(null); });
        return () => { vivo = false; };
    }, [perfil]);

    const carregando = perfilDaSessao === undefined;
    const tipos = tiposDeCadastroDoPerfil(perfilDaSessao);
    // O perfil inicial só vale se o criador puder; a escolha manual tem prioridade.
    const atual = tipo ?? (!escolheu && perfilInicial && tipos.includes(perfilInicial) ? perfilInicial : null);
    const voltar = tipos.length > 1 ? () => { setTipo(null); setEscolheu(true); } : undefined;

    if (atual === 'concessionaria') {
        return <NovaConcessionariaGuiada onClose={onClose} onCriada={(loja?: { id?: string }) => onCriado?.({ tipo: 'concessionaria', id: loja?.id })} />;
    }
    if (atual === 'lojista') return <CadastroDeLojista onClose={onClose} onVoltar={voltar} onCriado={onCriado} />;
    if (atual === 'equipe') return <CadastroDeEquipe onClose={onClose} onVoltar={voltar} onCriado={onCriado} restritos={perfisRestritosDoCriador(perfilDaSessao) as UserProfile[]} />;

    return (
        <AdminModal
            size="lg"
            title="Novo cadastro"
            subtitle="Escolha o perfil da conta. Cada um tem o seu passo a passo."
            onClose={onClose}
            footer={<button type="button" className={modalStyles.secondary} onClick={onClose}>Cancelar</button>}
        >
            {carregando ? (
                <p className={`${modalStyles.hint} ${modalStyles.flush}`}>Conferindo o seu perfil...</p>
            ) : tipos.length === 0 ? (
                <InlineNotice tone="warning">Seu perfil não cria cadastros. Peça a um administrador.</InlineNotice>
            ) : (
                <div className={styles.cartoes}>
                    {tipos.map(t => (
                        <button key={t} type="button" className={styles.cartao} onClick={() => { setTipo(t); setEscolheu(true); }}>
                            <span className={styles.cartaoIcone}>{OPCOES[t].icone}</span>
                            <strong className={styles.cartaoTitulo}>{OPCOES[t].titulo}</strong>
                            <span className={styles.cartaoDescricao}>{OPCOES[t].descricao}</span>
                            <span className={styles.cartaoPassos}>{OPCOES[t].passos}</span>
                        </button>
                    ))}
                </div>
            )}
        </AdminModal>
    );
}

/** Botão "Novo cadastro" pronto para o cabeçalho das telas. Some para quem não cria nada. */
export function NovoCadastroButton({ perfilInicial, onCriado, onFechar, label = 'Novo cadastro', perfil }: {
    perfilInicial?: TipoDeCadastro;
    onCriado?: (criado: CadastroCriado) => void;
    /** Ao fechar o modal (com ou sem cadastro), para a tela recarregar a lista. */
    onFechar?: () => void;
    label?: string;
    perfil?: string | null;
}) {
    const [aberto, setAberto] = useState(false);
    return <>
        <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setAberto(true)}>{label}</Button>
        {aberto && (
            <NovoCadastroModal
                perfil={perfil}
                perfilInicial={perfilInicial}
                onCriado={onCriado}
                onClose={() => { setAberto(false); onFechar?.(); }}
            />
        )}
    </>;
}

/* ───────────────────────── Passos ───────────────────────── */

function Passos({ passos, atual }: { passos: string[]; atual: number }) {
    return (
        <ol className={styles.passos} aria-label="Passos do cadastro">
            {passos.map((nome, i) => (
                <li key={nome} className={styles.passo} data-estado={i < atual ? 'feito' : i === atual ? 'atual' : 'depois'} aria-current={i === atual ? 'step' : undefined}>
                    <span className={styles.passoNumero}>{i < atual ? <Check size={13} aria-hidden="true" /> : i + 1}</span>
                    {nome}
                </li>
            ))}
        </ol>
    );
}

function SenhaProvisoria({ titulo, email, senha }: { titulo: string; email: string; senha: string }) {
    const [copiado, setCopiado] = useState(false);
    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(`Login: ${email}\nSenha provisória: ${senha}`);
            setCopiado(true);
        } catch { /* sem permissão de área de transferência: a senha está na tela */ }
    };
    return (
        <div className={crmStyles.passwordBox} role="status">
            <strong>{titulo}</strong>
            <span>Login: {email}. A senha é provisória: a pessoa escolhe a própria no primeiro acesso.</span>
            <code className={crmStyles.passwordValue}>{senha}</code>
            <div><button type="button" className={modalStyles.secondary} onClick={copiar}>{copiado ? 'Copiado' : 'Copiar login e senha'}</button></div>
        </div>
    );
}

/* ───────────────────────── Lojista ───────────────────────── */

const PASSOS_DO_LOJISTA = ['Dados', 'Acesso', 'Assinatura', 'Convidados', 'Resumo'];

type Assinatura = 'plano' | 'combinado' | 'cortesia' | 'teste';

const ASSINATURAS: Array<{ valor: Assinatura; rotulo: string; explica: string }> = [
    { valor: 'plano', rotulo: 'Plano pago', explica: 'Mensal, anual ou pacote de créditos, com pagamento recebido por fora (PIX, boleto ou cartão). Gera o registro no extrato.' },
    { valor: 'combinado', rotulo: 'Valor combinado', explica: 'Plano de assinatura com valor diferente da tabela. O valor fica guardado para as próximas cobranças.' },
    { valor: 'cortesia', rotulo: 'Cortesia', explica: 'Libera o plano sem cobrança. Entra no extrato com R$ 0,00.' },
    { valor: 'teste', rotulo: 'Teste grátis', explica: 'Libera 24 horas de consulta para o lojista conhecer a plataforma.' },
];

/** Documento opcional; se vier, tem que ser um CPF ou CNPJ de verdade. */
export function erroDoDocumento(valor: string): string | null {
    const digitos = valor.replace(/\D/g, '');
    if (!digitos) return null;
    if (digitos.length === 11) return validateCPF(digitos) ? null : 'CPF inválido.';
    if (digitos.length === 14) return validateCNPJ(digitos) ? null : 'CNPJ inválido.';
    return 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).';
}

function CadastroDeLojista({ onClose, onVoltar, onCriado }: {
    onClose: () => void;
    onVoltar?: () => void;
    onCriado?: (criado: CadastroCriado) => void;
}) {
    const [passo, setPasso] = useState(0);
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState<string | null>(null);

    // 1. Dados
    const [dados, setDados] = useState({ nome: '', email: '', telefone: '', documento: '', cidade: '', uf: '' });
    const [conta, setConta] = useState<{ id: string; email: string; nome: string } | null>(null);

    // 2. Acesso
    const [senha, setSenha] = useState('');
    const [modoSenha, setModoSenha] = useState<'gerar' | 'definir'>('gerar');
    const [senhaDigitada, setSenhaDigitada] = useState('');
    const [senhaTrocada, setSenhaTrocada] = useState(false);

    // 3. Assinatura
    const [plans, setPlans] = useState<PlanoDoLojista[] | null>(null);
    const [assinatura, setAssinatura] = useState<Assinatura>('plano');
    const [atribuicao, setAtribuicao] = useState<AtribuicaoDePlano | null>(null);
    const [assinaturaFeita, setAssinaturaFeita] = useState<string | null>(null);

    // 4. Convidados e 5. Resumo
    const [convidados, setConvidados] = useState(0);
    const [pendencias, setPendencias] = useState<PendenciaDoCliente[] | null>(null);
    const [fichaAberta, setFichaAberta] = useState(false);

    const clienteDoPlano: ClienteDoPlano | null = conta
        ? { id: conta.id, displayName: conta.nome, email: conta.email, planId: null, billingType: null, expiresAt: null, valorPlano: null, valorCombinadoAtivo: false }
        : null;
    const modo: ModoDeAtribuicao = assinatura === 'teste' ? 'plano' : assinatura;

    useEffect(() => {
        if (passo !== 2 || plans !== null) return;
        carregarPlanosDoLojista().then(setPlans).catch(() => setPlans([]));
    }, [passo, plans]);

    // A atribuição nasce quando os planos chegam e acompanha a troca de opção.
    useEffect(() => {
        if (!clienteDoPlano || !plans || assinatura === 'teste') return;
        setAtribuicao(anterior => {
            const base = anterior ?? atribuicaoInicial(clienteDoPlano, plans, modo);
            const permitidos = modo === 'combinado' ? plans.filter(p => p.type === 'monthly') : plans;
            return {
                ...base,
                planId: permitidos.some(p => p.id === base.planId) ? base.planId : permitidos[0]?.id ?? '',
                activationMethod: modo === 'cortesia' ? 'cortesia' : 'manual',
                salvarValorCombinado: true,
            };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plans, assinatura, conta?.id]);

    // Resumo: as pendências saem do cadastro como ele ficou gravado.
    useEffect(() => {
        if (passo !== 4 || !conta) return;
        setPendencias(null);
        fetch(`/api/admin/crm?id=${encodeURIComponent(conta.id)}`, { cache: 'no-store' })
            .then(r => r.json())
            .then(data => {
                const cliente: CRMClient | undefined = data?.client ?? (data?.clients || []).find((c: CRMClient) => c.id === conta.id);
                setPendencias(cliente ? pendenciasDoCliente(cliente) : []);
            })
            .catch(() => setPendencias([]));
    }, [passo, conta]);

    const avancar = () => { setErro(null); setPasso(p => p + 1); };

    const salvarDados = async () => {
        const nome = dados.nome.trim();
        const email = dados.email.trim().toLowerCase();
        if (!nome) { setErro('Informe o nome do lojista.'); return; }
        if (!/^\S+@\S+\.\S+$/.test(email)) { setErro('Informe um e-mail válido. Ele é o login do lojista.'); return; }
        const problema = erroDoDocumento(dados.documento);
        if (problema) { setErro(problema); return; }
        const uf = dados.uf.trim().toUpperCase();
        if (uf && uf.length !== 2) { setErro('A UF tem duas letras. Ex.: MG.'); return; }

        setOcupado(true);
        setErro(null);
        try {
            const res = await fetch('/api/admin/crm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome,
                    email,
                    telefone: dados.telefone,
                    cpf: dados.documento,
                    address: { street: '', number: '', complement: '', neighborhood: '', city: dados.cidade.trim(), state: uf, zipCode: '' },
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.id) {
                setErro(data.error || 'Erro ao criar o cliente.');
                return;
            }
            setConta({ id: data.id, email, nome });
            setSenha(data.tempPassword || '');
            onCriado?.({ tipo: 'lojista', id: data.id });
            setPasso(1);
        } catch {
            setErro('Erro de conexão.');
        } finally {
            setOcupado(false);
        }
    };

    const salvarAcesso = async () => {
        if (!conta) return;
        if (modoSenha === 'definir' && senhaDigitada.trim().length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); return; }
        setOcupado(true);
        setErro(null);
        try {
            const res = await fetch('/api/admin/crm/acesso', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: conta.id, ...(modoSenha === 'definir' ? { senha: senhaDigitada.trim() } : {}) }),
            });
            const data = await res.json();
            if (!res.ok || !data.senhaProvisoria) {
                setErro(data.error || 'Não foi possível gravar a senha.');
                return;
            }
            setSenha(data.senhaProvisoria);
            setSenhaTrocada(true);
            setPasso(2);
        } catch {
            setErro('Erro de conexão.');
        } finally {
            setOcupado(false);
        }
    };

    const salvarAssinatura = async () => {
        if (!conta) return;
        setErro(null);
        if (assinatura === 'teste') {
            setOcupado(true);
            try {
                const res = await fetch('/api/admin/crm/renew-trial', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: conta.id }),
                });
                const data = await res.json();
                if (!data.ok) { setErro(data.error || 'Erro ao liberar o teste.'); return; }
                setAssinaturaFeita('Teste grátis de 24 horas liberado');
                setPasso(3);
            } catch {
                setErro('Erro de conexão.');
            } finally {
                setOcupado(false);
            }
            return;
        }
        if (!atribuicao || !plans) return;
        const problema = erroDaAtribuicao(atribuicao, plans, modo);
        if (problema) { setErro(problema); return; }
        setOcupado(true);
        const falha = await enviarAtribuicaoDePlano(conta.id, atribuicao, plans);
        setOcupado(false);
        if (falha) { setErro(falha); return; }
        const plano = plans.find(p => p.id === atribuicao.planId);
        const periodo = plano?.type === 'credits' ? 'créditos' : atribuicao.paymentFrequency === 'annual' ? 'anual' : 'mensal';
        setAssinaturaFeita(`${plano?.name ?? 'Plano'} (${periodo})${assinatura === 'cortesia' ? ', cortesia' : assinatura === 'combinado' ? ', valor combinado' : ''}`);
        setPasso(3);
    };

    if (fichaAberta && conta) return <FichaClienteModal userId={conta.id} onClose={onClose} onMudou={() => onCriado?.({ tipo: 'lojista', id: conta.id })} />;

    const rodape = passo === 0 ? <>
        {onVoltar && <button type="button" className={modalStyles.secondary} onClick={onVoltar} disabled={ocupado}>Voltar</button>}
        <button type="button" className={modalStyles.secondary} onClick={onClose} disabled={ocupado}>Cancelar</button>
        <button type="button" className={modalStyles.primary} onClick={salvarDados} disabled={ocupado}>{ocupado ? 'Salvando...' : 'Salvar e continuar'}</button>
    </> : passo === 1 ? <>
        <button type="button" className={modalStyles.secondary} onClick={avancar} disabled={ocupado}>Pular</button>
        <button type="button" className={modalStyles.primary} onClick={salvarAcesso} disabled={ocupado}>{ocupado ? 'Salvando...' : 'Salvar e continuar'}</button>
    </> : passo === 2 ? <>
        <button type="button" className={modalStyles.secondary} onClick={avancar} disabled={ocupado}>Pular</button>
        <button type="button" className={modalStyles.primary} onClick={salvarAssinatura} disabled={ocupado || (assinatura !== 'teste' && !atribuicao?.planId)}>{ocupado ? 'Salvando...' : 'Salvar e continuar'}</button>
    </> : passo === 3 ? (
        <button type="button" className={modalStyles.primary} onClick={avancar}>{convidados > 0 ? 'Continuar' : 'Pular'}</button>
    ) : <>
        <button type="button" className={modalStyles.secondary} onClick={onClose}>Fechar</button>
        <button type="button" className={modalStyles.primary} onClick={() => setFichaAberta(true)}>Abrir ficha</button>
    </>;

    return (
        <AdminModal
            size="lg"
            title="Novo lojista"
            subtitle={conta ? `${conta.nome} · ${conta.email}` : 'Revenda ou lojista que consulta o estoque de zero km.'}
            onClose={onClose}
            busy={ocupado}
            toolbar={<Passos passos={PASSOS_DO_LOJISTA} atual={passo} />}
            footer={rodape}
        >
            <div className={modalStyles.stack}>
                {passo === 0 && (
                    <div className={modalStyles.grid2}>
                        <label className={`${modalStyles.field} ${modalStyles.span2}`}>
                            Nome
                            <input value={dados.nome} onChange={e => setDados({ ...dados, nome: e.target.value })} placeholder="Nome do lojista ou da loja" autoFocus />
                        </label>
                        <label className={modalStyles.field}>
                            E-mail
                            <input type="email" value={dados.email} onChange={e => setDados({ ...dados, email: e.target.value })} placeholder="email@exemplo.com" />
                            <span className={modalStyles.hint}>É o login do lojista.</span>
                        </label>
                        <label className={modalStyles.field}>
                            Telefone / WhatsApp
                            <input type="tel" value={dados.telefone} onChange={e => setDados({ ...dados, telefone: mascaraTelefone(e.target.value) })} placeholder="(31) 99999-9999" />
                        </label>
                        <label className={modalStyles.field}>
                            CPF ou CNPJ
                            <input value={dados.documento} onChange={e => setDados({ ...dados, documento: e.target.value })} placeholder="Só números ou com pontuação" inputMode="numeric" />
                        </label>
                        <div className={styles.cidadeUf}>
                            <label className={modalStyles.field}>
                                Cidade
                                <input value={dados.cidade} onChange={e => setDados({ ...dados, cidade: e.target.value })} placeholder="Belo Horizonte" />
                            </label>
                            <label className={modalStyles.field}>
                                UF
                                <input value={dados.uf} onChange={e => setDados({ ...dados, uf: e.target.value.replace(/[^a-zA-Z]/g, '').slice(0, 2).toUpperCase() })} placeholder="MG" maxLength={2} />
                            </label>
                        </div>
                        <p className={`${modalStyles.hint} ${modalStyles.flush} ${modalStyles.span2}`}>
                            Só nome e e-mail são obrigatórios. Ao salvar, a conta é criada e os próximos passos podem ser pulados e retomados depois, na ficha do cliente.
                        </p>
                    </div>
                )}

                {passo === 1 && conta && <>
                    <SenhaProvisoria titulo="Login criado." email={conta.email} senha={senha} />
                    <fieldset className={modalStyles.group}>
                        <legend className={modalStyles.groupLabel}>Trocar a senha provisória <span className={modalStyles.groupHint}>· opcional</span></legend>
                        <div className={modalStyles.choices}>
                            <label className={modalStyles.choice}>
                                <input type="radio" name="modo-senha" checked={modoSenha === 'gerar'} onChange={() => setModoSenha('gerar')} />
                                Gerar uma senha aleatória
                            </label>
                            <label className={modalStyles.choice}>
                                <input type="radio" name="modo-senha" checked={modoSenha === 'definir'} onChange={() => setModoSenha('definir')} />
                                Definir a senha
                            </label>
                        </div>
                    </fieldset>
                    {modoSenha === 'definir' && (
                        <label className={modalStyles.field}>
                            Senha provisória
                            <input value={senhaDigitada} onChange={e => setSenhaDigitada(e.target.value)} placeholder="Mínimo 6 caracteres" minLength={6} autoComplete="off" />
                        </label>
                    )}
                    <p className={`${modalStyles.hint} ${modalStyles.flush}`}>
                        Salvar grava a nova senha no login. Pular mantém a senha acima. Nos dois casos o lojista escolhe a própria senha no primeiro acesso.
                    </p>
                </>}

                {passo === 2 && conta && <>
                    <fieldset className={modalStyles.group}>
                        <legend className={modalStyles.groupLabel}>Como este lojista começa</legend>
                        <div className={modalStyles.choices}>
                            {ASSINATURAS.map(a => (
                                <label key={a.valor} className={modalStyles.choice}>
                                    <input type="radio" name="assinatura" checked={assinatura === a.valor} onChange={() => { setAssinatura(a.valor); setErro(null); }} />
                                    {a.rotulo}
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <p className={`${modalStyles.hint} ${modalStyles.flush}`}>{ASSINATURAS.find(a => a.valor === assinatura)?.explica}</p>
                    {assinatura !== 'teste' && (
                        plans === null || !atribuicao || !clienteDoPlano
                            ? <p className={`${modalStyles.hint} ${modalStyles.flush}`}>Carregando os planos...</p>
                            : <AtribuirPlanoCampos client={clienteDoPlano} plans={plans} valor={atribuicao} onChange={setAtribuicao} modo={modo} permitirGratis={false} />
                    )}
                </>}

                {passo === 3 && conta && <>
                    <p className={`${modalStyles.hint} ${modalStyles.flush}`}>
                        Convidados são telas extras: cada um tem login próprio e usa o plano desta conta. Cada inclusão já fica gravada. Se não houver convidado, é só pular.
                    </p>
                    <ConvidadosDoCliente clienteEmail={conta.email} onQuantidade={setConvidados} />
                </>}

                {passo === 4 && conta && <>
                    <InlineNotice tone="positive">{conta.nome} está cadastrado.</InlineNotice>
                    <ul className={styles.resumo}>
                        <li><StatusBadge tone="positive">Feito</StatusBadge> Dados e login ({conta.email})</li>
                        <li>
                            <StatusBadge tone={senhaTrocada ? 'positive' : 'neutral'}>{senhaTrocada ? 'Feito' : 'Pulado'}</StatusBadge>
                            {' '}Senha provisória: <code>{senha}</code>{senhaTrocada ? '' : ' (a do cadastro)'}
                        </li>
                        <li>
                            <StatusBadge tone={assinaturaFeita ? 'positive' : 'warning'}>{assinaturaFeita ? 'Feito' : 'Pendente'}</StatusBadge>
                            {' '}{assinaturaFeita ?? 'Assinatura: nenhum plano ou teste foi liberado'}
                        </li>
                        <li>
                            <StatusBadge tone={convidados > 0 ? 'positive' : 'neutral'}>{convidados > 0 ? 'Feito' : 'Pulado'}</StatusBadge>
                            {' '}{convidados > 0 ? `${convidados} ${convidados === 1 ? 'convidado' : 'convidados'}` : 'Nenhum convidado'}
                        </li>
                    </ul>
                    <div>
                        <strong className={styles.resumoTitulo}>O que ficou pendente</strong>
                        {pendencias === null ? (
                            <p className={`${modalStyles.hint} ${modalStyles.flush}`}>Conferindo o cadastro...</p>
                        ) : pendencias.length === 0 ? (
                            <p className={`${modalStyles.hint} ${modalStyles.flush}`}>Nada pendente. O lojista já pode entrar.</p>
                        ) : (
                            <ul className={styles.resumo}>
                                {pendencias.map(p => (
                                    <li key={p.codigo}><StatusBadge tone={p.tom}>{p.rotulo}</StatusBadge> {p.detalhe}</li>
                                ))}
                            </ul>
                        )}
                    </div>
                    <p className={`${modalStyles.hint} ${modalStyles.flush}`}>Tudo isto pode ser ajustado na ficha do cliente.</p>
                </>}

                {erro && <InlineNotice>{erro}</InlineNotice>}
            </div>
        </AdminModal>
    );
}

/* ───────────────────────── Equipe interna ───────────────────────── */

function CadastroDeEquipe({ onClose, onVoltar, onCriado, restritos }: {
    onClose: () => void;
    onVoltar?: () => void;
    onCriado?: (criado: CadastroCriado) => void;
    restritos: UserProfile[];
}) {
    const [form, setForm] = useState({ displayName: '', email: '', password: '', allowedProfiles: ['operador'] as UserProfile[] });
    const [ocupado, setOcupado] = useState(false);
    const [erro, setErro] = useState<string | null>(null);
    const [criado, setCriado] = useState<{ email: string; senha: string } | null>(null);

    const criar = async (event: React.FormEvent) => {
        event.preventDefault();
        if (form.allowedProfiles.length === 0) { setErro('Escolha pelo menos um perfil.'); return; }
        setOcupado(true);
        setErro(null);
        try {
            const email = form.email.trim().toLowerCase();
            const result = await createUser({
                email,
                password: form.password,
                displayName: form.displayName.trim(),
                allowedProfiles: form.allowedProfiles,
            });
            if (result.success) {
                setCriado({ email, senha: form.password });
                onCriado?.({ tipo: 'equipe', id: 'uid' in result ? result.uid : undefined });
            } else {
                setErro(`Não foi possível criar o usuário: ${result.error}`);
            }
        } catch (error) {
            console.error('Error creating user:', error);
            setErro('Falha de conexão ao criar o usuário. Tente de novo.');
        } finally {
            setOcupado(false);
        }
    };

    if (criado) {
        return (
            <AdminModal
                title="Novo usuário da equipe"
                subtitle="Cadastro concluído"
                onClose={onClose}
                footer={<button type="button" className={modalStyles.primary} onClick={onClose}>Concluir</button>}
            >
                <SenhaProvisoria titulo="Usuário criado." email={criado.email} senha={criado.senha} />
            </AdminModal>
        );
    }

    return (
        <AdminModal
            title="Novo usuário da equipe"
            subtitle="Cria o acesso e define o que a pessoa pode usar na plataforma."
            onClose={onClose}
            busy={ocupado}
            onSubmit={criar}
            footer={<>
                {onVoltar && <button type="button" className={modalStyles.secondary} onClick={onVoltar} disabled={ocupado}>Voltar</button>}
                <button type="button" className={modalStyles.secondary} onClick={onClose} disabled={ocupado}>Cancelar</button>
                <button type="submit" className={modalStyles.primary} disabled={ocupado}>{ocupado ? 'Criando...' : 'Criar usuário'}</button>
            </>}
        >
            <div className={modalStyles.stack}>
                <div className={modalStyles.grid2}>
                    <label className={`${modalStyles.field} ${modalStyles.span2}`}>
                        Nome completo
                        <input type="text" value={form.displayName} onChange={e => setForm({ ...form, displayName: e.target.value })} required placeholder="Ex.: João Silva" />
                    </label>
                    <label className={modalStyles.field}>
                        E-mail
                        <input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required placeholder="email@exemplo.com" />
                    </label>
                    <label className={modalStyles.field}>
                        Senha provisória
                        <input type="text" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required placeholder="Mínimo 6 caracteres" minLength={6} autoComplete="off" />
                        <span className={modalStyles.hint}>A pessoa troca no primeiro acesso.</span>
                    </label>
                </div>
                <PerfisDaEquipe
                    name="novo"
                    selected={form.allowedProfiles}
                    restricted={restritos}
                    onToggle={perfil => setForm({ ...form, allowedProfiles: toggleProfileSelection(form.allowedProfiles, perfil) })}
                />
                {erro && <InlineNotice>{erro}</InlineNotice>}
            </div>
        </AdminModal>
    );
}
