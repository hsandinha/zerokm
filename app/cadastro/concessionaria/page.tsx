'use client';
import { validateDocumento } from '@/lib/utils/cpf';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import styles from './page.module.css';

type Step = 1 | 2 | 3;

interface FormData {
    // Step 1 — Empresa
    nomeFantasia: string;
    razaoSocial: string;
    marcaId: string;
    marca: string;
    cnpj: string;
    inscricaoEstadual: string;
    telefone: string;
    celular: string;
    // Step 2 — Endereço
    cep: string;
    endereco: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    uf: string;
    // Step 3 — Responsável & Acesso
    nomeResponsavel: string;
    telefoneResponsavel: string;
    email: string;
    password: string;
    confirm: string;
}

const EMPTY: FormData = {
    nomeFantasia: '', razaoSocial: '', marcaId: '', marca: '', cnpj: '', inscricaoEstadual: '',
    telefone: '', celular: '',
    cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
    nomeResponsavel: '', telefoneResponsavel: '', email: '', password: '', confirm: '',
};

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
    { num: 1, label: 'Empresa' },
    { num: 2, label: 'Endereço' },
    { num: 3, label: 'Acesso' },
];

interface MarcaOption {
    id: string;
    nome: string;
}

export default function CadastroConcessionariaPage() {
    const router = useRouter();
    const [step, setStep] = useState<Step>(1);
    const [form, setForm] = useState<FormData>(EMPTY);
    const [loading, setLoading] = useState(false);
    const [marcasLoading, setMarcasLoading] = useState(false);
    const [marcas, setMarcas] = useState<MarcaOption[]>([]);
    const [cepLoading, setCepLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    function set(field: keyof FormData, value: string) {
        setForm(f => ({ ...f, [field]: value }));
        setError('');
    }

    useEffect(() => {
        let active = true;

        async function loadMarcas() {
            setMarcasLoading(true);
            try {
                const res = await fetch('/api/catalog/brands');
                if (!res.ok) return;
                const data = await res.json();
                if (active && Array.isArray(data)) {
                    setMarcas(data.map((item: any) => ({ id: item.id, nome: item.nome })).filter((item: MarcaOption) => item.id && item.nome));
                }
            } catch {
                // Cadastro continua bloqueando sem marca; operador pode cadastrar a marca no painel.
            } finally {
                if (active) setMarcasLoading(false);
            }
        }

        loadMarcas();

        return () => {
            active = false;
        };
    }, []);

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
        } catch {
            // silent — user fills manually
        } finally {
            setCepLoading(false);
        }
    }

    function validateStep(): string | null {
        if (step === 1) {
            if (!form.nomeFantasia.trim()) return 'Nome fantasia é obrigatório.';
            if (!form.marcaId) return 'Selecione a marca representada pela concessionária.';
            const cnpjError = validateDocumento('pj', form.cnpj);
            if (cnpjError) return cnpjError;
            if (!form.telefone.replace(/\D/g, '')) return 'Telefone é obrigatório.';
        }
        if (step === 2) {
            if (!form.cep.replace(/\D/g, '')) return 'CEP é obrigatório.';
            if (!form.endereco.trim()) return 'Endereço é obrigatório.';
            if (!form.numero.trim()) return 'Número é obrigatório.';
            if (!form.cidade.trim()) return 'Cidade é obrigatória.';
            if (!form.uf.trim()) return 'UF é obrigatória.';
        }
        if (step === 3) {
            if (!form.nomeResponsavel.trim()) return 'Nome do responsável é obrigatório.';
            if (!form.telefoneResponsavel.replace(/\D/g, '')) return 'Telefone do responsável é obrigatório.';
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
        try {
            const res = await fetch('/api/cadastro/concessionaria', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Erro ao criar cadastro.');
            } else {
                setSuccess(true);
                setTimeout(() => router.push('/login'), 3000);
            }
        } catch {
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
                    <h2 className={styles.successTitle}>Cadastro realizado!</h2>
                    <p className={styles.successMsg}>
                        Sua concessionária foi cadastrada com sucesso.<br />
                        Redirecionando para o login...
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
                    <h1 className={styles.title}>Cadastrar concessionária</h1>
                    <p className={styles.subtitle}>Venda seus carros para o Brasil todo. 0% de comissão.</p>
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
                    {/* ── STEP 1: EMPRESA ── */}
                    {step === 1 && (
                        <div className={styles.stepContent}>
                            <h2 className={styles.stepTitle}>Dados da empresa</h2>

                            <div className={styles.field}>
                                <label className={styles.label}>Nome fantasia <span className={styles.required}>*</span></label>
                                <input className={styles.input} type="text" required
                                    value={form.nomeFantasia}
                                    onChange={e => set('nomeFantasia', e.target.value)}
                                    placeholder="Como sua loja é conhecida" />
                            </div>

                            <div className={styles.field}>
                                <label className={styles.label}>Razão social</label>
                                <input className={styles.input} type="text"
                                    value={form.razaoSocial}
                                    onChange={e => set('razaoSocial', e.target.value)}
                                    placeholder="Razão social completa" />
                            </div>

                            <div className={styles.field}>
                                <label className={styles.label}>Marca representada <span className={styles.required}>*</span></label>
                                <select
                                    className={styles.input}
                                    value={form.marcaId}
                                    onChange={e => {
                                        const selected = marcas.find(marca => marca.id === e.target.value);
                                        setForm(f => ({
                                            ...f,
                                            marcaId: selected?.id || '',
                                            marca: selected?.nome || '',
                                        }));
                                        setError('');
                                    }}
                                    required
                                    disabled={marcasLoading}
                                >
                                    <option value="">{marcasLoading ? 'Carregando marcas...' : 'Selecione a marca'}</option>
                                    {marcas.map(marca => (
                                        <option key={marca.id} value={marca.id}>{marca.nome}</option>
                                    ))}
                                </select>
                                {marcas.length === 0 && !marcasLoading && (
                                    <p className={styles.helpText}>Nenhuma marca disponível. Peça ao operador para cadastrar a marca no Catálogo.</p>
                                )}
                            </div>

                            <div className={styles.row}>
                                <div className={styles.field}>
                                    <label className={styles.label}>CNPJ <span className={styles.required}>*</span></label>
                                    <input className={styles.input} type="text" required
                                        value={form.cnpj}
                                        onChange={e => set('cnpj', maskCnpj(e.target.value))}
                                        placeholder="00.000.000/0000-00" />
                                </div>
                                <div className={styles.field}>
                                    <label className={styles.label}>Inscrição estadual</label>
                                    <input className={styles.input} type="text"
                                        value={form.inscricaoEstadual}
                                        onChange={e => set('inscricaoEstadual', e.target.value)}
                                        placeholder="Opcional" />
                                </div>
                            </div>

                            <div className={styles.row}>
                                <div className={styles.field}>
                                    <label className={styles.label}>Telefone <span className={styles.required}>*</span></label>
                                    <input className={styles.input} type="tel" required
                                        value={form.telefone}
                                        onChange={e => set('telefone', maskPhone(e.target.value))}
                                        placeholder="(11) 3333-4444" />
                                </div>
                                <div className={styles.field}>
                                    <label className={styles.label}>WhatsApp / Celular</label>
                                    <input className={styles.input} type="tel"
                                        value={form.celular}
                                        onChange={e => set('celular', maskPhone(e.target.value))}
                                        placeholder="(11) 99999-9999" />
                                </div>
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
                                        placeholder="Sala, bloco..." />
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
                                    <select className={styles.input}
                                        value={form.uf}
                                        onChange={e => set('uf', e.target.value)}
                                        required>
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

                    {/* ── STEP 3: RESPONSÁVEL & ACESSO ── */}
                    {step === 3 && (
                        <div className={styles.stepContent}>
                            <h2 className={styles.stepTitle}>Responsável & acesso</h2>

                            <div className={styles.row}>
                                <div className={styles.field}>
                                    <label className={styles.label}>Nome do responsável <span className={styles.required}>*</span></label>
                                    <input className={styles.input} type="text" required
                                        value={form.nomeResponsavel}
                                        onChange={e => set('nomeResponsavel', e.target.value)}
                                        placeholder="Nome completo" />
                                </div>
                                <div className={styles.field}>
                                    <label className={styles.label}>Telefone do responsável <span className={styles.required}>*</span></label>
                                    <input className={styles.input} type="tel" required
                                        value={form.telefoneResponsavel}
                                        onChange={e => set('telefoneResponsavel', maskPhone(e.target.value))}
                                        placeholder="(11) 99999-9999" />
                                </div>
                            </div>

                            <div className={styles.divider} />

                            <div className={styles.field}>
                                <label className={styles.label}>E-mail de acesso <span className={styles.required}>*</span></label>
                                <input className={styles.input} type="email" required
                                    value={form.email}
                                    onChange={e => set('email', e.target.value)}
                                    placeholder="email@suaconcessionaria.com.br" />
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
                                    {loading ? 'Cadastrando...' : 'Cadastrar concessionária'}
                                </button>
                            </div>
                        </div>
                    )}
                </form>

                <p className={styles.loginHint}>
                    Já tem uma conta?{' '}
                    <Link href="/login" className={styles.loginHintLink}>Entrar</Link>
                </p>

                <p className={styles.loginHint}>
                    É cliente?{' '}
                    <Link href="/cadastro/cliente" className={styles.loginHintLink}>Cadastrar cliente →</Link>
                </p>

            </div>
        </div>
    );
}
