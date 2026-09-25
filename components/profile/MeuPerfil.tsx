'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { CheckCircle2, Loader2, MapPin, UserRound } from 'lucide-react';
import { getUserProfile, updateUserProfile, type UserProfileData } from '@/app/dashboard/profile/actions';
import { MaskedInput } from '@/components/operator/MaskedInput';
import { modalStyles } from '@/components/admin/AdminModal';
import { calculateProfileCompletion } from '@/lib/utils/profileCompletion';
import { validateCPF } from '@/lib/utils/cpf';
import { buscarCep } from '@/lib/utils/cep';
import styles from './MeuPerfil.module.css';

const VAZIO: UserProfileData = {
    displayName: '',
    email: '',
    phoneNumber: '',
    cpf: '',
    address: { street: '', number: '', complement: '', neighborhood: '', city: '', state: '', zipCode: '' },
};

type Endereco = NonNullable<UserProfileData['address']>;

/**
 * Meu perfil: dados pessoais e endereço num formulário só, dentro do painel
 * (o menu lateral continua à vista). O CEP completa o endereço ao terminar de digitar.
 */
export function MeuPerfil() {
    const { update: updateSession } = useSession();
    const [dados, setDados] = useState<UserProfileData>(VAZIO);
    const [original, setOriginal] = useState<UserProfileData>(VAZIO);
    const [carregando, setCarregando] = useState(true);
    const [salvando, setSalvando] = useState(false);
    const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
    const [cpfErro, setCpfErro] = useState('');
    const [cepStatus, setCepStatus] = useState<'idle' | 'buscando' | 'ok' | 'erro'>('idle');
    const ultimoCep = useRef('');

    useEffect(() => {
        getUserProfile()
            .then(data => {
                if (!data) return;
                const completo = { ...VAZIO, ...data, address: { ...(VAZIO.address as Endereco), ...data.address } as Endereco };
                setDados(completo);
                setOriginal(completo);
                ultimoCep.current = (completo.address?.zipCode || '').replace(/\D/g, '');
            })
            .catch(() => setAviso({ tipo: 'erro', texto: 'Não foi possível carregar seu perfil.' }))
            .finally(() => setCarregando(false));
    }, []);

    const endereco = dados.address as Endereco;
    const setEndereco = (campo: keyof Endereco, valor: string) =>
        setDados(prev => ({ ...prev, address: { ...(prev.address as Endereco), [campo]: valor } }));

    const completo = calculateProfileCompletion(dados);
    const alterado = JSON.stringify(dados) !== JSON.stringify(original);

    const aoMudarCep = async (valor: string) => {
        setEndereco('zipCode', valor);
        const limpo = valor.replace(/\D/g, '');
        if (limpo.length < 8) { setCepStatus('idle'); return; }
        if (limpo === ultimoCep.current) return;
        ultimoCep.current = limpo;
        setCepStatus('buscando');
        const achado = await buscarCep(limpo);
        if (!achado) { setCepStatus('erro'); return; }
        setDados(prev => {
            const atual = prev.address as Endereco;
            return {
                ...prev,
                address: {
                    ...atual,
                    street: achado.street || atual.street,
                    neighborhood: achado.neighborhood || atual.neighborhood,
                    city: achado.city || atual.city,
                    state: achado.state || atual.state,
                },
            };
        });
        setCepStatus('ok');
    };

    const validarCpf = () => {
        const digitos = (dados.cpf || '').replace(/\D/g, '');
        setCpfErro(digitos.length === 11 && !validateCPF(dados.cpf || '') ? 'CPF inválido' : '');
    };

    const salvar = async (event: React.FormEvent) => {
        event.preventDefault();
        if (cpfErro) return;
        setSalvando(true);
        setAviso(null);
        try {
            const result = await updateUserProfile({ ...dados, creditCard: undefined });
            if (!result.success) {
                setAviso({ tipo: 'erro', texto: result.error || 'Erro ao salvar o perfil.' });
                return;
            }
            setOriginal(dados);
            await updateSession({ profileCompletion: calculateProfileCompletion(dados) });
            setAviso({ tipo: 'ok', texto: 'Perfil salvo.' });
        } catch {
            setAviso({ tipo: 'erro', texto: 'Erro de conexão. Tente novamente.' });
        } finally {
            setSalvando(false);
        }
    };

    if (carregando) {
        return <p className={styles.carregando}><Loader2 size={16} className={styles.girando} aria-hidden="true" /> Carregando perfil...</p>;
    }

    return (
        <form className={styles.perfil} onSubmit={salvar}>
            <div className={styles.progresso}>
                <div className={styles.progressoTexto}>
                    <strong>Perfil {completo}% preenchido</strong>
                    {completo < 100 && <span>Complete seus dados para liberar o acesso completo.</span>}
                </div>
                <div className={styles.barra} role="progressbar" aria-valuenow={completo} aria-valuemin={0} aria-valuemax={100} aria-label="Perfil preenchido">
                    <div className={styles.barraFill} data-nivel={completo < 40 ? 'baixo' : completo < 100 ? 'medio' : 'alto'} style={{ width: `${completo}%` }} />
                </div>
            </div>

            <section className={styles.card}>
                <header className={styles.cardHead}>
                    <span className={styles.cardIcon}><UserRound size={18} aria-hidden="true" /></span>
                    <div>
                        <h2>Dados pessoais</h2>
                        <p>Nome, documento e contato usados nas cotações e no atendimento.</p>
                    </div>
                </header>
                <div className={modalStyles.grid2}>
                    <label className={modalStyles.field}>
                        Nome completo
                        <input value={dados.displayName || ''} onChange={e => setDados(p => ({ ...p, displayName: e.target.value }))} required autoComplete="name" />
                    </label>
                    <label className={modalStyles.field}>
                        E-mail
                        <input value={dados.email || ''} disabled title="O e-mail não pode ser alterado" />
                    </label>
                    <div className={modalStyles.field}>
                        <span>CPF</span>
                        <MaskedInput plain mask="cpf" value={dados.cpf || ''} onChange={v => { setDados(p => ({ ...p, cpf: v })); setCpfErro(''); }} onBlur={validarCpf} placeholder="000.000.000-00" />
                        {cpfErro && <span className={styles.erro}>{cpfErro}</span>}
                    </div>
                    <div className={modalStyles.field}>
                        <span>Telefone</span>
                        <MaskedInput plain mask="phone" value={dados.phoneNumber || ''} onChange={v => setDados(p => ({ ...p, phoneNumber: v }))} placeholder="(00) 00000-0000" />
                    </div>
                </div>
            </section>

            <section className={styles.card}>
                <header className={styles.cardHead}>
                    <span className={styles.cardIcon}><MapPin size={18} aria-hidden="true" /></span>
                    <div>
                        <h2>Endereço</h2>
                        <p>Digite o CEP e o endereço é preenchido automaticamente.</p>
                    </div>
                </header>
                <div className={styles.gridEndereco}>
                    <div className={`${modalStyles.field} ${styles.c2}`}>
                        <span className={styles.labelLinha}>
                            CEP
                            <span className={styles.cepStatus} data-status={cepStatus} aria-live="polite">
                                {cepStatus === 'buscando' && <><Loader2 size={12} className={styles.girando} aria-hidden="true" /> buscando...</>}
                                {cepStatus === 'ok' && <><CheckCircle2 size={12} aria-hidden="true" /> encontrado</>}
                                {cepStatus === 'erro' && 'não encontrado'}
                            </span>
                        </span>
                        <MaskedInput plain mask="cep" value={endereco.zipCode || ''} onChange={aoMudarCep} placeholder="00000-000" />
                    </div>
                    <label className={`${modalStyles.field} ${styles.c4}`}>
                        Rua
                        <input value={endereco.street || ''} onChange={e => setEndereco('street', e.target.value)} autoComplete="address-line1" />
                    </label>
                    <label className={`${modalStyles.field} ${styles.c1}`}>
                        Número
                        <input value={endereco.number || ''} onChange={e => setEndereco('number', e.target.value)} />
                    </label>
                    <label className={`${modalStyles.field} ${styles.c2}`}>
                        Complemento
                        <input value={endereco.complement || ''} onChange={e => setEndereco('complement', e.target.value)} />
                    </label>
                    <label className={`${modalStyles.field} ${styles.c3}`}>
                        Bairro
                        <input value={endereco.neighborhood || ''} onChange={e => setEndereco('neighborhood', e.target.value)} />
                    </label>
                    <label className={`${modalStyles.field} ${styles.c5}`}>
                        Cidade
                        <input value={endereco.city || ''} onChange={e => setEndereco('city', e.target.value)} autoComplete="address-level2" />
                    </label>
                    <label className={`${modalStyles.field} ${styles.c1}`}>
                        UF
                        <input value={endereco.state || ''} onChange={e => setEndereco('state', e.target.value.toUpperCase())} maxLength={2} placeholder="UF" />
                    </label>
                </div>
            </section>

            <footer className={styles.rodape}>
                {aviso && <span className={styles.aviso} data-tipo={aviso.tipo} role="status">{aviso.texto}</span>}
                <button type="button" className={modalStyles.secondary} onClick={() => { setDados(original); setAviso(null); setCpfErro(''); }} disabled={salvando || !alterado}>
                    Descartar
                </button>
                <button type="submit" className={modalStyles.primary} disabled={salvando || !alterado || !!cpfErro}>
                    {salvando ? 'Salvando...' : 'Salvar alterações'}
                </button>
            </footer>
        </form>
    );
}
