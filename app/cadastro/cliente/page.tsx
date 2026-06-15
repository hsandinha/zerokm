'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { openSalesWhatsAppForLead } from '@/lib/utils/leadWhatsApp';
import styles from './page.module.css';

type Step = 1 | 2 | 3;
type Tipo = 'pf' | 'pj';

interface FormData {
    tipo: Tipo;
    // Step 1
    nome: string;
    razaoSocial: string;
    documento: string;      // CPF (PF) ou CNPJ (PJ)
    telefone: string;
    celular: string;
    // Step 2
    cep: string;
    endereco: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
    // Step 3
    email: string;
    password: string;
    confirm: string;
}

const EMPTY: FormData = {
    tipo: 'pf',
    nome: '', razaoSocial: '', documento: '', telefone: '', celular: '',
    cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
    email: '', password: '', confirm: '',
};

function maskCpf(v: string) {
    return v.replace(/\D/g, '').slice(0, 11)
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function maskCnpj(v: string) {
    return v.replace(/\D/g, '').slice(0, 14)
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2');
}

function maskPhone(v: string) {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 10) return d.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    return d.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
}

function maskCep(v: string) {
    return v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d{0,3})/, '$1-$2');
}

const STEPS = [
    { num: 1, label: 'Dados' },
    { num: 2, label: 'Endereço' },
    { num: 3, label: 'Acesso' },
];

export default function CadastroClientePage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>(1);
    const [form, setForm] = useState<FormData>(EMPTY);
    const [loading, setLoading] = useState(false);
    const [cepLoading, setCepLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    function set(field: keyof FormData, value: string) {
        setForm(f => ({ ...f, [field]: value }));
        setError('');
    }

    function setTipo(t: Tipo) {
        setForm(f => ({ ...f, tipo: t, documento: '' }));
        setError('');
    }

    function maskDoc(v: string) {
        return form.tipo === 'pf' ? maskCpf(v) : maskCnpj(v);
    }

    async function lookupCep(raw: string) {
        const cep = raw.replace(/\D/g, '');
        if (cep.length !== 8) return;
        setCepLoading(true);
        try {
            const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            const data = await res.json();
            if (!data.erro) {
                setForm(f => ({
                    ...f,
                    endereco: data.logradouro || f.endereco,
                    bairro: data.bairro || f.bairro,
                    cidade: data.localidade || f.cidade,
                    uf: data.uf || f.uf,
                }));
            }
        } catch { /* silent */ }
        finally { setCepLoading(false); }
    }

    function validateStep(): string | null {
        if (step === 1) {
            if (!form.nome.trim()) return 'Nome é obrigatório.';
            const digits = form.documento.replace(/\D/g, '');
            if (form.tipo === 'pf' && digits.length !== 11) return 'CPF deve ter 11 dígitos.';
            if (form.tipo === 'pj' && digits.length !== 14) return 'CNPJ deve ter 14 dígitos.';
            if (!form.telefone.replace(/\D/g, '')) return 'Telefone é obrigatório.';
        }
        if (step === 2) {
            if (!form.cep.replace(/\D/g, '')) return 'CEP é obrigatório.';
            if (!form.endereco.trim()) return 'Endereço é obrigatório.';
            if (!form.numero.trim()) return 'Número é obrigatório.';
            if (!form.cidade.trim()) return 'Cidade é obrigatória.';
            if (!form.uf) return 'UF é obrigatória.';
        }
        if (step === 3) {
            if (!form.email.includes('@')) return 'E-mail inválido.';
            if (form.password.length < 6) return 'Senha deve ter pelo menos 6 caracteres.';
            if (form.password !== form.confirm) return 'As senhas não coincidem.';
        }
        return null;
    }

    function nextStep() {
        const err = validateStep();
        if (err) { setError(err); return; }
        setError('');
        setStep(s => (s + 1) as Step);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const err = validateStep();
        if (err) { setError(err); return; }
        setLoading(true);
        setError('');
        const salesTab = typeof window !== 'undefined' ? window.open('', '_blank') : null;
        let salesTabUsed = false;
        if (salesTab) salesTab.opener = null;
        try {
            const res = await fetch('/api/cadastro/cliente', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) {
                salesTab?.close();
                setError(data.error || 'Erro ao criar conta.');
            } else {
                await openSalesWhatsAppForLead({
                    name: form.nome,
                    email: form.email,
                    phone: form.telefone,
                    mobile: form.celular,
                    document: form.documento,
                    source: 'Cadastro gratis - pagina dedicada',
                }, salesTab);
                salesTabUsed = true;
                setSuccess(true);
                setTimeout(() => router.push('/login'), 3000);
            }
        } catch {
            if (!salesTabUsed) salesTab?.close();
            setError('Erro de conexão. Tente novamente.');
        } finally {
            setLoading(false);
        }
    }

    if (success) {
        return (
            <div className={styles.page}>
                <div className={styles.successCard}>
                    <div className={styles.successIcon}>✓</div>
                    <h2 className={styles.successTitle}>Conta criada com sucesso!</h2>
                    <p className={styles.successMsg}>
                        Bem-vindo à CNV.<br />Redirecionando para o login...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <div className={styles.card}>
                {/* Header */}
                <div className={styles.cardHeader}>
                    <Link href="/">
                        <Image src="/images/logo.png" alt="CNV" width={160} height={54} priority />
                    </Link>
                    <h1 className={styles.title}>Criar conta</h1>
                    <p className={styles.subtitle}>Acesse o estoque de mais de 500 concessionárias. 0% de comissão.</p>
                </div>

                {/* Stepper */}
                <div className={styles.stepper}>
                    {STEPS.map((s, i) => (
                        <div key={s.num} className={styles.stepperItem}>
                            <div className={`${styles.stepperDot} ${step > s.num ? styles.stepperDone : step === s.num ? styles.stepperActive : ''}`}>
                                {step > s.num ? '✓' : s.num}
                            </div>
                            <span className={`${styles.stepperLabel} ${step === s.num ? styles.stepperLabelActive : ''}`}>
                                {s.label}
                            </span>
                            {i < STEPS.length - 1 && <div className={`${styles.stepperLine} ${step > s.num ? styles.stepperLineDone : ''}`} />}
                        </div>
                    ))}
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>

                    {/* ── STEP 1: DADOS ── */}
                    {step === 1 && (
                        <div className={styles.stepContent}>
                            <h2 className={styles.stepTitle}>Seus dados</h2>

                            {/* Tipo toggle */}
                            <div className={styles.tipoToggle}>
                                <button
                                    type="button"
                                    className={`${styles.tipoBtn} ${form.tipo === 'pf' ? styles.tipoBtnActive : ''}`}
                                    onClick={() => setTipo('pf')}
                                >
                                    Pessoa Física (CPF)
                                </button>
                                <button
                                    type="button"
                                    className={`${styles.tipoBtn} ${form.tipo === 'pj' ? styles.tipoBtnActive : ''}`}
                                    onClick={() => setTipo('pj')}
                                >
                                    Pessoa Jurídica (CNPJ)
                                </button>
                            </div>

                            <div className={styles.field}>
                                <label className={styles.label}>
                                    {form.tipo === 'pf' ? 'Nome completo' : 'Nome fantasia'} <span className={styles.required}>*</span>
                                </label>
                                <input className={styles.input} type="text" required
                                    value={form.nome}
                                    onChange={e => set('nome', e.target.value)}
                                    placeholder={form.tipo === 'pf' ? 'Seu nome completo' : 'Como sua empresa é conhecida'} />
                            </div>

                            {form.tipo === 'pj' && (
                                <div className={styles.field}>
                                    <label className={styles.label}>Razão social</label>
                                    <input className={styles.input} type="text"
                                        value={form.razaoSocial}
                                        onChange={e => set('razaoSocial', e.target.value)}
                                        placeholder="Razão social completa" />
                                </div>
                            )}

                            <div className={styles.row}>
                                <div className={styles.field}>
                                    <label className={styles.label}>
                                        {form.tipo === 'pf' ? 'CPF' : 'CNPJ'} <span className={styles.required}>*</span>
                                    </label>
                                    <input className={styles.input} type="text" required
                                        value={form.documento}
                                        onChange={e => set('documento', maskDoc(e.target.value))}
                                        placeholder={form.tipo === 'pf' ? '000.000.000-00' : '00.000.000/0000-00'} />
                                </div>
                                <div className={styles.field}>
                                    <label className={styles.label}>Telefone <span className={styles.required}>*</span></label>
                                    <input className={styles.input} type="tel" required
                                        value={form.telefone}
                                        onChange={e => set('telefone', maskPhone(e.target.value))}
                                        placeholder="(11) 3333-4444" />
                                </div>
                            </div>

                            <div className={styles.field}>
                                <label className={styles.label}>WhatsApp / Celular</label>
                                <input className={styles.input} type="tel"
                                    value={form.celular}
                                    onChange={e => set('celular', maskPhone(e.target.value))}
                                    placeholder="(11) 99999-9999" />
                            </div>

                            {error && <p className={styles.errorMsg}>{error}</p>}
                            <button type="button" className={styles.btnPrimary} onClick={nextStep}>
                                Continuar →
                            </button>
                        </div>
                    )}

                    {/* ── STEP 2: ENDEREÇO ── */}
                    {step === 2 && (
                        <div className={styles.stepContent}>
                            <h2 className={styles.stepTitle}>Endereço</h2>

                            <div className={styles.field}>
                                <label className={styles.label}>CEP <span className={styles.required}>*</span></label>
                                <div className={styles.inputWithIcon}>
                                    <input className={styles.input} type="text" required
                                        value={form.cep}
                                        onChange={e => {
                                            const v = maskCep(e.target.value);
                                            set('cep', v);
                                            lookupCep(v);
                                        }}
                                        placeholder="00000-000" />
                                    {cepLoading && <span className={styles.cepSpinner}>⟳</span>}
                                </div>
                            </div>

                            <div className={styles.field}>
                                <label className={styles.label}>Logradouro <span className={styles.required}>*</span></label>
                                <input className={styles.input} type="text" required
                                    value={form.endereco}
                                    onChange={e => set('endereco', e.target.value)}
                                    placeholder="Rua, Avenida..." />
                            </div>

                            <div className={styles.row}>
                                <div className={styles.fieldSmall}>
                                    <label className={styles.label}>Número <span className={styles.required}>*</span></label>
                                    <input className={styles.input} type="text" required
                                        value={form.numero}
                                        onChange={e => set('numero', e.target.value)}
                                        placeholder="123" />
                                </div>
                                <div className={styles.field}>
                                    <label className={styles.label}>Complemento</label>
                                    <input className={styles.input} type="text"
                                        value={form.complemento}
                                        onChange={e => set('complemento', e.target.value)}
                                        placeholder="Apto, Sala..." />
                                </div>
                            </div>

                            <div className={styles.field}>
                                <label className={styles.label}>Bairro</label>
                                <input className={styles.input} type="text"
                                    value={form.bairro}
                                    onChange={e => set('bairro', e.target.value)}
                                    placeholder="Bairro" />
                            </div>

                            <div className={styles.row}>
                                <div className={styles.field}>
                                    <label className={styles.label}>Cidade <span className={styles.required}>*</span></label>
                                    <input className={styles.input} type="text" required
                                        value={form.cidade}
                                        onChange={e => set('cidade', e.target.value)}
                                        placeholder="São Paulo" />
                                </div>
                                <div className={styles.fieldSmall}>
                                    <label className={styles.label}>UF <span className={styles.required}>*</span></label>
                                    <select className={styles.input} value={form.uf}
                                        onChange={e => set('uf', e.target.value)} required>
                                        <option value="">UF</option>
                                        {['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'].map(u => (
                                            <option key={u} value={u}>{u}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {error && <p className={styles.errorMsg}>{error}</p>}
                            <div className={styles.btnRow}>
                                <button type="button" className={styles.btnBack} onClick={() => setStep(1)}>← Voltar</button>
                                <button type="button" className={styles.btnPrimary} onClick={nextStep}>Continuar →</button>
                            </div>
                        </div>
                    )}

                    {/* ── STEP 3: ACESSO ── */}
                    {step === 3 && (
                        <div className={styles.stepContent}>
                            <h2 className={styles.stepTitle}>Dados de acesso</h2>

                            <div className={styles.field}>
                                <label className={styles.label}>E-mail <span className={styles.required}>*</span></label>
                                <input className={styles.input} type="email" required
                                    value={form.email}
                                    onChange={e => set('email', e.target.value)}
                                    placeholder="seu@email.com" />
                            </div>

                            <div className={styles.row}>
                                <div className={styles.field}>
                                    <label className={styles.label}>Senha <span className={styles.required}>*</span></label>
                                    <input className={styles.input} type="password" required minLength={6}
                                        value={form.password}
                                        onChange={e => set('password', e.target.value)}
                                        placeholder="Mínimo 6 caracteres" />
                                </div>
                                <div className={styles.field}>
                                    <label className={styles.label}>Confirmar senha <span className={styles.required}>*</span></label>
                                    <input className={styles.input} type="password" required
                                        value={form.confirm}
                                        onChange={e => set('confirm', e.target.value)}
                                        placeholder="Repita a senha" />
                                </div>
                            </div>

                            {error && <p className={styles.errorMsg}>{error}</p>}
                            <div className={styles.btnRow}>
                                <button type="button" className={styles.btnBack} onClick={() => setStep(2)}>← Voltar</button>
                                <button type="submit" className={styles.btnPrimary} disabled={loading}>
                                    {loading ? 'Criando conta...' : 'Criar conta'}
                                </button>
                            </div>
                        </div>
                    )}
                </form>

                <p className={styles.loginHint}>
                    Já tem uma conta?{' '}
                    <Link href="/login" className={styles.loginHintLink}>Entrar</Link>
                </p>
                <p className={styles.concessionariaHint}>
                    É concessionária?{' '}
                    <Link href="/cadastro/concessionaria" className={styles.loginHintLink}>Cadastrar concessionária →</Link>
                </p>
            </div>
        </div>
    );
}
