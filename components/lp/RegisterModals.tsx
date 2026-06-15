'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { signIn } from 'next-auth/react';
import { auth } from '@/lib/firebase';
import { openSalesWhatsAppForLead } from '@/lib/utils/leadWhatsApp';
import modalStyles from './RegisterModals.module.css';
import formStyles from '@/app/cadastro/concessionaria/page.module.css';

// ── Shared helpers ──────────────────────────────────────────────

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

const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT',
    'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

// ── CLIENTE FORM ─────────────────────────────────────────────────

type Tipo = 'pf' | 'pj';
type CStep = 1 | 2 | 3;

interface ClienteData {
    tipo: Tipo;
    nome: string; razaoSocial: string; documento: string; telefone: string; celular: string;
    cep: string; endereco: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string;
    email: string; password: string; confirm: string;
}

const CLIENTE_EMPTY: ClienteData = {
    tipo: 'pf', nome: '', razaoSocial: '', documento: '', telefone: '', celular: '',
    cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
    email: '', password: '', confirm: '',
};

const CLIENTE_STEPS = [{ num: 1, label: 'Dados' }, { num: 2, label: 'Endereço' }, { num: 3, label: 'Acesso' }];

function ClienteForm({ onClose, planId, billing }: { onClose: () => void; planId?: string; billing?: 'monthly' | 'annual' }) {
    const [step, setStep] = useState<CStep>(1);
    const [form, setForm] = useState<ClienteData>(CLIENTE_EMPTY);
    const [loading, setLoading] = useState(false);
    const [cepLoading, setCepLoading] = useState(false);
    const [error, setError] = useState('');

    function set(field: keyof ClienteData, value: string) {
        setForm(f => ({ ...f, [field]: value }));
        setError('');
    }
    function setTipo(t: Tipo) {
        setForm(f => ({ ...f, tipo: t, documento: '' }));
        setError('');
    }
    function maskDoc(v: string) { return form.tipo === 'pf' ? maskCpf(v) : maskCnpj(v); }

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
            const d = form.documento.replace(/\D/g, '');
            if (form.tipo === 'pf' && d.length !== 11) return 'CPF deve ter 11 dígitos.';
            if (form.tipo === 'pj' && d.length !== 14) return 'CNPJ deve ter 14 dígitos.';
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
        setStep(s => (s + 1) as CStep);
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
            // 1. Criar conta no servidor
            const res = await fetch('/api/cadastro/cliente', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) {
                salesTab?.close();
                setError(data.error || 'Erro ao criar conta.');
                return;
            }

            await openSalesWhatsAppForLead({
                name: form.nome,
                email: form.email,
                phone: form.telefone,
                mobile: form.celular,
                document: form.documento,
                source: 'Cadastro gratis - landing page',
            }, salesTab);
            salesTabUsed = true;

            // 2. Login automático via Firebase
            const credential = await signInWithEmailAndPassword(auth, form.email, form.password);
            const token = await credential.user.getIdToken();

            // 3. Criar sessão NextAuth
            await signIn('credentials', {
                token,
                selectedProfile: 'gratis',
                redirect: false,
            });

            // 4. Se houver plano pago selecionado, abrir o modal de pagamento
            //    interno (in-app) ao invés de redirecionar para o checkout do MP.
            if (planId) {
                const qs = new URLSearchParams({
                    upgrade: '1',
                    plan: planId,
                    billing: billing ?? 'monthly',
                });
                window.location.href = `/dashboard/cliente?${qs.toString()}`;
                return;
            }

            // 5. Redirecionar para o dashboard
            window.location.href = '/dashboard/cliente';
        } catch {
            if (!salesTabUsed) salesTab?.close();
            setError('Erro de conexão. Tente novamente.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <div className={formStyles.cardHeader}>
                <Image src="/images/logo.png" alt="CNV" width={140} height={47} priority />
                <h1 className={formStyles.title}>Criar conta</h1>
                <p className={formStyles.subtitle}>Acesse o estoque de mais de 500 concessionárias. 0% de comissão.</p>
            </div>

            <div className={formStyles.stepper}>
                {CLIENTE_STEPS.map((s, i) => (
                    <div key={s.num} className={formStyles.stepperItem}>
                        <div className={`${formStyles.stepperDot} ${step > s.num ? formStyles.stepperDone : step === s.num ? formStyles.stepperActive : ''}`}>
                            {step > s.num ? '✓' : s.num}
                        </div>
                        <span className={`${formStyles.stepperLabel} ${step === s.num ? formStyles.stepperLabelActive : ''}`}>{s.label}</span>
                        {i < CLIENTE_STEPS.length - 1 && <div className={`${formStyles.stepperLine} ${step > s.num ? formStyles.stepperLineDone : ''}`} />}
                    </div>
                ))}
            </div>

            <form onSubmit={handleSubmit} className={formStyles.form}>
                {step === 1 && (
                    <div className={formStyles.stepContent}>
                        <h2 className={formStyles.stepTitle}>Seus dados</h2>
                        <div className={formStyles.tipoToggle}>
                            <button type="button" className={`${formStyles.tipoBtn} ${form.tipo === 'pf' ? formStyles.tipoBtnActive : ''}`} onClick={() => setTipo('pf')}>
                                Pessoa Física (CPF)
                            </button>
                            <button type="button" className={`${formStyles.tipoBtn} ${form.tipo === 'pj' ? formStyles.tipoBtnActive : ''}`} onClick={() => setTipo('pj')}>
                                Pessoa Jurídica (CNPJ)
                            </button>
                        </div>
                        <div className={formStyles.field}>
                            <label className={formStyles.label}>{form.tipo === 'pf' ? 'Nome completo' : 'Nome fantasia'} <span className={formStyles.required}>*</span></label>
                            <input className={formStyles.input} type="text" required value={form.nome} onChange={e => set('nome', e.target.value)} placeholder={form.tipo === 'pf' ? 'Seu nome completo' : 'Como sua empresa é conhecida'} />
                        </div>
                        {form.tipo === 'pj' && (
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>Razão social</label>
                                <input className={formStyles.input} type="text" value={form.razaoSocial} onChange={e => set('razaoSocial', e.target.value)} placeholder="Razão social completa" />
                            </div>
                        )}
                        <div className={formStyles.row}>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>{form.tipo === 'pf' ? 'CPF' : 'CNPJ'} <span className={formStyles.required}>*</span></label>
                                <input className={formStyles.input} type="text" required value={form.documento} onChange={e => set('documento', maskDoc(e.target.value))} placeholder={form.tipo === 'pf' ? '000.000.000-00' : '00.000.000/0000-00'} />
                            </div>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>Telefone <span className={formStyles.required}>*</span></label>
                                <input className={formStyles.input} type="tel" required value={form.telefone} onChange={e => set('telefone', maskPhone(e.target.value))} placeholder="(11) 3333-4444" />
                            </div>
                        </div>
                        <div className={formStyles.field}>
                            <label className={formStyles.label}>WhatsApp / Celular</label>
                            <input className={formStyles.input} type="tel" value={form.celular} onChange={e => set('celular', maskPhone(e.target.value))} placeholder="(11) 99999-9999" />
                        </div>
                        {error && <p className={formStyles.errorMsg}>{error}</p>}
                        <button type="button" className={formStyles.btnPrimary} onClick={nextStep}>Continuar →</button>
                    </div>
                )}

                {step === 2 && (
                    <div className={formStyles.stepContent}>
                        <h2 className={formStyles.stepTitle}>Endereço</h2>
                        <div className={formStyles.field}>
                            <label className={formStyles.label}>CEP <span className={formStyles.required}>*</span></label>
                            <div className={formStyles.inputWithIcon}>
                                <input className={formStyles.input} type="text" required value={form.cep} onChange={e => { const v = maskCep(e.target.value); set('cep', v); lookupCep(v); }} placeholder="00000-000" />
                                {cepLoading && <span className={formStyles.cepSpinner}>⟳</span>}
                            </div>
                        </div>
                        <div className={formStyles.field}>
                            <label className={formStyles.label}>Logradouro <span className={formStyles.required}>*</span></label>
                            <input className={formStyles.input} type="text" required value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, Avenida..." />
                        </div>
                        <div className={formStyles.row}>
                            <div className={formStyles.fieldSmall}>
                                <label className={formStyles.label}>Número <span className={formStyles.required}>*</span></label>
                                <input className={formStyles.input} type="text" required value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="123" />
                            </div>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>Complemento</label>
                                <input className={formStyles.input} type="text" value={form.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Apto, Sala..." />
                            </div>
                        </div>
                        <div className={formStyles.field}>
                            <label className={formStyles.label}>Bairro</label>
                            <input className={formStyles.input} type="text" value={form.bairro} onChange={e => set('bairro', e.target.value)} placeholder="Bairro" />
                        </div>
                        <div className={formStyles.row}>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>Cidade <span className={formStyles.required}>*</span></label>
                                <input className={formStyles.input} type="text" required value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="São Paulo" />
                            </div>
                            <div className={formStyles.fieldSmall}>
                                <label className={formStyles.label}>UF <span className={formStyles.required}>*</span></label>
                                <select className={formStyles.input} value={form.uf} onChange={e => set('uf', e.target.value)} required>
                                    <option value="">UF</option>
                                    {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                        </div>
                        {error && <p className={formStyles.errorMsg}>{error}</p>}
                        <div className={formStyles.btnRow}>
                            <button type="button" className={formStyles.btnBack} onClick={() => setStep(1)}>← Voltar</button>
                            <button type="button" className={formStyles.btnPrimary} onClick={nextStep}>Continuar →</button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className={formStyles.stepContent}>
                        <h2 className={formStyles.stepTitle}>Dados de acesso</h2>
                        <div className={formStyles.field}>
                            <label className={formStyles.label}>E-mail <span className={formStyles.required}>*</span></label>
                            <input className={formStyles.input} type="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder="seu@email.com" />
                        </div>
                        <div className={formStyles.row}>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>Senha <span className={formStyles.required}>*</span></label>
                                <input className={formStyles.input} type="password" required minLength={6} value={form.password} onChange={e => set('password', e.target.value)} placeholder="Mínimo 6 caracteres" />
                            </div>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>Confirmar senha <span className={formStyles.required}>*</span></label>
                                <input className={formStyles.input} type="password" required value={form.confirm} onChange={e => set('confirm', e.target.value)} placeholder="Repita a senha" />
                            </div>
                        </div>
                        {error && <p className={formStyles.errorMsg}>{error}</p>}
                        <div className={formStyles.btnRow}>
                            <button type="button" className={formStyles.btnBack} onClick={() => setStep(2)}>← Voltar</button>
                            <button type="submit" className={formStyles.btnPrimary} disabled={loading}>{loading ? 'Criando conta...' : 'Criar conta'}</button>
                        </div>
                    </div>
                )}
            </form>

            <p className={formStyles.loginHint}>
                Já tem uma conta?{' '}
                <a href="/login" className={formStyles.loginHintLink}>Entrar</a>
            </p>
            <p className={formStyles.loginHint}>
                É concessionária?{' '}
                <button
                    type="button"
                    className={formStyles.loginHintLink}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                    onClick={() => window.dispatchEvent(new CustomEvent('open-register', { detail: { type: 'concessionaria' } }))}
                >
                    Cadastrar concessionária →
                </button>
            </p>
        </>
    );
}

// ── CONCESSIONARIA FORM ──────────────────────────────────────────

interface ConcData {
    nomeFantasia: string; razaoSocial: string; cnpj: string; inscricaoEstadual: string;
    telefone: string; celular: string;
    cep: string; endereco: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string;
    nomeResponsavel: string; telefoneResponsavel: string; email: string; password: string; confirm: string;
}

const CONC_EMPTY: ConcData = {
    nomeFantasia: '', razaoSocial: '', cnpj: '', inscricaoEstadual: '', telefone: '', celular: '',
    cep: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '',
    nomeResponsavel: '', telefoneResponsavel: '', email: '', password: '', confirm: '',
};

const CONC_STEPS = [{ num: 1, label: 'Empresa' }, { num: 2, label: 'Endereço' }, { num: 3, label: 'Acesso' }];

function ConcessionariaForm({ onClose }: { onClose: () => void }) {
    const [step, setStep] = useState<1 | 2 | 3>(1);
    const [form, setForm] = useState<ConcData>(CONC_EMPTY);
    const [loading, setLoading] = useState(false);
    const [cepLoading, setCepLoading] = useState(false);
    const [error, setError] = useState('');

    function set(field: keyof ConcData, value: string) {
        setForm(f => ({ ...f, [field]: value }));
        setError('');
    }

    async function lookupCep(raw: string) {
        const cep = raw.replace(/\D/g, '');
        if (cep.length !== 8) return;
        setCepLoading(true);
        try {
            const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            const data = await res.json();
            if (!data.erro) {
                setForm(f => ({ ...f, endereco: data.logradouro || f.endereco, bairro: data.bairro || f.bairro, cidade: data.localidade || f.cidade, uf: data.uf || f.uf }));
            }
        } catch { /* silent */ }
        finally { setCepLoading(false); }
    }

    function validateStep(): string | null {
        if (step === 1) {
            if (!form.nomeFantasia.trim()) return 'Nome fantasia é obrigatório.';
            if (form.cnpj.replace(/\D/g, '').length !== 14) return 'CNPJ deve ter 14 dígitos.';
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
        setStep(s => (s + 1) as 1 | 2 | 3);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const err = validateStep();
        if (err) { setError(err); return; }
        setLoading(true);
        setError('');
        try {
            // 1. Criar conta no servidor
            const res = await fetch('/api/cadastro/concessionaria', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(form),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error || 'Erro ao criar cadastro.');
                return;
            }

            // 2. Login automático via Firebase
            const credential = await signInWithEmailAndPassword(auth, form.email, form.password);
            const token = await credential.user.getIdToken();

            // 3. Criar sessão NextAuth
            await signIn('credentials', {
                token,
                selectedProfile: 'concessionaria',
                redirect: false,
            });

            // 4. Redirecionar para o dashboard
            window.location.href = '/dashboard/dealership';
        } catch {
            setError('Erro de conexão. Tente novamente.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <>
            <div className={formStyles.cardHeader}>
                <Image src="/images/logo.png" alt="CNV" width={140} height={47} priority />
                <h1 className={formStyles.title}>Cadastrar concessionária</h1>
                <p className={formStyles.subtitle}>Venda seus carros para o Brasil todo. 0% de comissão.</p>
            </div>

            <div className={formStyles.stepper}>
                {CONC_STEPS.map((s, i) => (
                    <div key={s.num} className={formStyles.stepperItem}>
                        <div className={`${formStyles.stepperDot} ${step > s.num ? formStyles.stepperDone : step === s.num ? formStyles.stepperActive : ''}`}>
                            {step > s.num ? '✓' : s.num}
                        </div>
                        <span className={`${formStyles.stepperLabel} ${step === s.num ? formStyles.stepperLabelActive : ''}`}>{s.label}</span>
                        {i < CONC_STEPS.length - 1 && <div className={`${formStyles.stepperLine} ${step > s.num ? formStyles.stepperLineDone : ''}`} />}
                    </div>
                ))}
            </div>

            <form onSubmit={handleSubmit} className={formStyles.form}>
                {step === 1 && (
                    <div className={formStyles.stepContent}>
                        <h2 className={formStyles.stepTitle}>Dados da empresa</h2>
                        <div className={formStyles.field}>
                            <label className={formStyles.label}>Nome fantasia <span className={formStyles.required}>*</span></label>
                            <input className={formStyles.input} type="text" required value={form.nomeFantasia} onChange={e => set('nomeFantasia', e.target.value)} placeholder="Como sua loja é conhecida" />
                        </div>
                        <div className={formStyles.field}>
                            <label className={formStyles.label}>Razão social</label>
                            <input className={formStyles.input} type="text" value={form.razaoSocial} onChange={e => set('razaoSocial', e.target.value)} placeholder="Razão social completa" />
                        </div>
                        <div className={formStyles.row}>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>CNPJ <span className={formStyles.required}>*</span></label>
                                <input className={formStyles.input} type="text" required value={form.cnpj} onChange={e => set('cnpj', maskCnpj(e.target.value))} placeholder="00.000.000/0000-00" />
                            </div>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>Inscrição estadual</label>
                                <input className={formStyles.input} type="text" value={form.inscricaoEstadual} onChange={e => set('inscricaoEstadual', e.target.value)} placeholder="Opcional" />
                            </div>
                        </div>
                        <div className={formStyles.row}>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>Telefone <span className={formStyles.required}>*</span></label>
                                <input className={formStyles.input} type="tel" required value={form.telefone} onChange={e => set('telefone', maskPhone(e.target.value))} placeholder="(11) 3333-4444" />
                            </div>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>WhatsApp / Celular</label>
                                <input className={formStyles.input} type="tel" value={form.celular} onChange={e => set('celular', maskPhone(e.target.value))} placeholder="(11) 99999-9999" />
                            </div>
                        </div>
                        {error && <p className={formStyles.errorMsg}>{error}</p>}
                        <button type="button" className={formStyles.btnPrimary} onClick={nextStep}>Continuar →</button>
                    </div>
                )}

                {step === 2 && (
                    <div className={formStyles.stepContent}>
                        <h2 className={formStyles.stepTitle}>Endereço</h2>
                        <div className={formStyles.field}>
                            <label className={formStyles.label}>CEP <span className={formStyles.required}>*</span></label>
                            <div className={formStyles.inputWithIcon}>
                                <input className={formStyles.input} type="text" required value={form.cep} onChange={e => { const v = maskCep(e.target.value); set('cep', v); lookupCep(v); }} placeholder="00000-000" />
                                {cepLoading && <span className={formStyles.cepSpinner}>⟳</span>}
                            </div>
                        </div>
                        <div className={formStyles.field}>
                            <label className={formStyles.label}>Logradouro <span className={formStyles.required}>*</span></label>
                            <input className={formStyles.input} type="text" required value={form.endereco} onChange={e => set('endereco', e.target.value)} placeholder="Rua, Avenida..." />
                        </div>
                        <div className={formStyles.row}>
                            <div className={formStyles.fieldSmall}>
                                <label className={formStyles.label}>Número <span className={formStyles.required}>*</span></label>
                                <input className={formStyles.input} type="text" required value={form.numero} onChange={e => set('numero', e.target.value)} placeholder="123" />
                            </div>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>Complemento</label>
                                <input className={formStyles.input} type="text" value={form.complemento} onChange={e => set('complemento', e.target.value)} placeholder="Sala, bloco..." />
                            </div>
                        </div>
                        <div className={formStyles.field}>
                            <label className={formStyles.label}>Bairro</label>
                            <input className={formStyles.input} type="text" value={form.bairro} onChange={e => set('bairro', e.target.value)} placeholder="Bairro" />
                        </div>
                        <div className={formStyles.row}>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>Cidade <span className={formStyles.required}>*</span></label>
                                <input className={formStyles.input} type="text" required value={form.cidade} onChange={e => set('cidade', e.target.value)} placeholder="São Paulo" />
                            </div>
                            <div className={formStyles.fieldSmall}>
                                <label className={formStyles.label}>UF <span className={formStyles.required}>*</span></label>
                                <select className={formStyles.input} value={form.uf} onChange={e => set('uf', e.target.value)} required>
                                    <option value="">UF</option>
                                    {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                        </div>
                        {error && <p className={formStyles.errorMsg}>{error}</p>}
                        <div className={formStyles.btnRow}>
                            <button type="button" className={formStyles.btnBack} onClick={() => setStep(1)}>← Voltar</button>
                            <button type="button" className={formStyles.btnPrimary} onClick={nextStep}>Continuar →</button>
                        </div>
                    </div>
                )}

                {step === 3 && (
                    <div className={formStyles.stepContent}>
                        <h2 className={formStyles.stepTitle}>Responsável & acesso</h2>
                        <div className={formStyles.row}>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>Nome do responsável <span className={formStyles.required}>*</span></label>
                                <input className={formStyles.input} type="text" required value={form.nomeResponsavel} onChange={e => set('nomeResponsavel', e.target.value)} placeholder="Nome completo" />
                            </div>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>Telefone do responsável <span className={formStyles.required}>*</span></label>
                                <input className={formStyles.input} type="tel" required value={form.telefoneResponsavel} onChange={e => set('telefoneResponsavel', maskPhone(e.target.value))} placeholder="(11) 99999-9999" />
                            </div>
                        </div>
                        <div className={formStyles.divider} />
                        <div className={formStyles.field}>
                            <label className={formStyles.label}>E-mail de acesso <span className={formStyles.required}>*</span></label>
                            <input className={formStyles.input} type="email" required value={form.email} onChange={e => set('email', e.target.value)} placeholder="email@suaconcessionaria.com.br" />
                        </div>
                        <div className={formStyles.row}>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>Senha <span className={formStyles.required}>*</span></label>
                                <input className={formStyles.input} type="password" required minLength={6} value={form.password} onChange={e => set('password', e.target.value)} placeholder="Mínimo 6 caracteres" />
                            </div>
                            <div className={formStyles.field}>
                                <label className={formStyles.label}>Confirmar senha <span className={formStyles.required}>*</span></label>
                                <input className={formStyles.input} type="password" required value={form.confirm} onChange={e => set('confirm', e.target.value)} placeholder="Repita a senha" />
                            </div>
                        </div>
                        {error && <p className={formStyles.errorMsg}>{error}</p>}
                        <div className={formStyles.btnRow}>
                            <button type="button" className={formStyles.btnBack} onClick={() => setStep(2)}>← Voltar</button>
                            <button type="submit" className={formStyles.btnPrimary} disabled={loading}>{loading ? 'Cadastrando...' : 'Cadastrar concessionária'}</button>
                        </div>
                    </div>
                )}
            </form>

            <p className={formStyles.loginHint}>
                Já tem uma conta?{' '}
                <a href="/login" className={formStyles.loginHintLink}>Entrar</a>
            </p>
        </>
    );
}

// ── MODAL SHELL ──────────────────────────────────────────────────

export function RegisterModals() {
    const [open, setOpen] = useState<'cliente' | 'concessionaria' | null>(null);
    const [planId, setPlanId] = useState<string | undefined>(undefined);
    const [billing, setBilling] = useState<'monthly' | 'annual' | undefined>(undefined);

    useEffect(() => {
        function handler(e: Event) {
            const detail = (e as CustomEvent<{ type: string; planId?: string; billing?: 'monthly' | 'annual' }>).detail;
            const type = detail?.type;
            if (type === 'cliente' || type === 'concessionaria') {
                setOpen(type);
                setPlanId(detail?.planId);
                setBilling(detail?.billing);
            }
        }
        window.addEventListener('open-register', handler);
        return () => window.removeEventListener('open-register', handler);
    }, []);

    useEffect(() => {
        function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(null); }
        if (open) {
            document.addEventListener('keydown', onKey);
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.removeEventListener('keydown', onKey);
            document.body.style.overflow = '';
        };
    }, [open]);

    if (!open) return null;

    return (
        <div className={modalStyles.backdrop} onClick={() => setOpen(null)} role="dialog" aria-modal="true">
            <div className={modalStyles.modal} onClick={e => e.stopPropagation()}>
                <button className={modalStyles.closeBtn} onClick={() => setOpen(null)} aria-label="Fechar">✕</button>
                <div className={modalStyles.modalBody}>
                    {open === 'cliente'
                        ? <ClienteForm onClose={() => setOpen(null)} planId={planId} billing={billing} />
                        : <ConcessionariaForm onClose={() => setOpen(null)} />
                    }
                </div>
            </div>
        </div>
    );
}
