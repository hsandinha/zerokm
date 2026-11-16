'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MaskedInput } from '@/components/operator/MaskedInput';
import { modalStyles } from '@/components/admin/AdminModal';

/**
 * Dados cadastrais da concessionária: os mesmos campos na aba Dados da ficha
 * (components/admin/FichaConcessionaria.tsx) e no primeiro passo do cadastro
 * guiado (components/admin/NovaConcessionariaGuiada.tsx).
 */
export type DadosForm = {
    nome: string;
    razaoSocial: string;
    inscricaoEstadual: string;
    telefone: string;
    celular: string;
    contato: string;
    email: string;
    endereco: string;
    numero: string;
    complemento: string;
    bairro: string;
    cidade: string;
    cnpj: string;
    uf: string;
    cep: string;
    nomeResponsavel: string;
    telefoneResponsavel: string;
    emailResponsavel: string;
    observacoes: string;
    ativo: boolean;
    operadorId: string;
};

export type Operador = { _id: string; displayName: string; email: string };

type LojaParaForm = Partial<Record<Exclude<keyof DadosForm, 'ativo'>, string | null>> & { ativo?: boolean | null };

const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

const digitos = (valor?: string | null) => (valor ?? '').replace(/\D/g, '');

export const dadosVazios = (): DadosForm => ({
    nome: '', razaoSocial: '', inscricaoEstadual: '', telefone: '', celular: '', contato: '', email: '', endereco: '', numero: '',
    complemento: '', bairro: '', cidade: '', cnpj: '', uf: '', cep: '', nomeResponsavel: '', telefoneResponsavel: '',
    emailResponsavel: '', observacoes: '', ativo: true, operadorId: '',
});

export const dadosDaLoja = (loja: LojaParaForm): DadosForm => ({
    nome: loja.nome ?? '',
    razaoSocial: loja.razaoSocial ?? '',
    inscricaoEstadual: loja.inscricaoEstadual ?? '',
    telefone: digitos(loja.telefone),
    celular: digitos(loja.celular),
    contato: loja.contato ?? '',
    email: loja.email ?? '',
    endereco: loja.endereco ?? '',
    numero: loja.numero ?? '',
    complemento: loja.complemento ?? '',
    bairro: loja.bairro ?? '',
    cidade: loja.cidade ?? '',
    cnpj: digitos(loja.cnpj),
    uf: loja.uf ?? '',
    cep: digitos(loja.cep),
    nomeResponsavel: loja.nomeResponsavel ?? '',
    telefoneResponsavel: digitos(loja.telefoneResponsavel),
    emailResponsavel: loja.emailResponsavel ?? '',
    observacoes: loja.observacoes ?? '',
    ativo: loja.ativo ?? true,
    operadorId: loja.operadorId ?? '',
});

/** Equipe que pode ser responsável por uma loja (a rota já só responde para a equipe). */
export function useOperadores(): Operador[] {
    const [operadores, setOperadores] = useState<Operador[]>([]);
    useEffect(() => {
        let vivo = true;
        fetch('/api/admin/users')
            .then(res => res.json())
            .then(data => { if (vivo && Array.isArray(data)) setOperadores(data); })
            .catch(() => undefined);
        return () => { vivo = false; };
    }, []);
    return operadores;
}

export function CamposDaConcessionaria({ value, onChange, operadores, podeTrocarOperador = true, disabled = false }: {
    value: DadosForm;
    onChange: (proximo: DadosForm) => void;
    operadores: Operador[];
    podeTrocarOperador?: boolean;
    disabled?: boolean;
}) {
    const [buscandoCep, setBuscandoCep] = useState(false);
    const [cepErro, setCepErro] = useState<string | null>(null);
    const ultimoCep = useRef('');
    // O CEP responde depois: grava sobre o valor mais recente, não sobre o da hora do pedido.
    const atual = useRef(value);
    atual.current = value;

    const campo = <K extends keyof DadosForm>(chave: K, valor: DadosForm[K]) => onChange({ ...atual.current, [chave]: valor });

    const buscarCep = useCallback(async (cep: string) => {
        if (cep.length !== 8 || ultimoCep.current === cep) return;
        ultimoCep.current = cep;
        setBuscandoCep(true);
        setCepErro(null);
        try {
            const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
            if (!res.ok) throw new Error('Erro ao buscar CEP');
            const data = await res.json();
            if (data.erro) { setCepErro('CEP não encontrado.'); return; }
            const v = atual.current;
            onChange({
                ...v,
                endereco: data.logradouro || v.endereco,
                bairro: data.bairro || v.bairro,
                cidade: data.localidade || v.cidade,
                uf: data.uf || v.uf,
                complemento: data.complemento || v.complemento,
            });
        } catch {
            setCepErro('Erro ao buscar CEP.');
        } finally {
            setBuscandoCep(false);
        }
    }, [onChange]);

    const mudarCep = (cep: string) => {
        campo('cep', cep);
        if (cep.length === 8) void buscarCep(cep);
        else { setCepErro(null); ultimoCep.current = ''; }
    };

    return (
        <fieldset className={`${modalStyles.group} ${modalStyles.stack}`} disabled={disabled}>
            <div className={modalStyles.row}>
                <label className={modalStyles.field}>
                    Nome Fantasia
                    <input type="text" value={value.nome} onChange={e => campo('nome', e.target.value)} />
                </label>
                <label className={modalStyles.field}>
                    Razão Social
                    <input type="text" value={value.razaoSocial} onChange={e => campo('razaoSocial', e.target.value)} />
                </label>
            </div>

            <div className={modalStyles.row}>
                <div className={`${modalStyles.field} ${modalStyles.maskedField}`}>
                    <MaskedInput plain name="cnpj" label="CNPJ" value={value.cnpj} onChange={v => campo('cnpj', v)} mask="cnpj" placeholder="00.000.000/0000-00" />
                </div>
                <label className={modalStyles.field}>
                    Inscrição Estadual
                    <input type="text" value={value.inscricaoEstadual} onChange={e => campo('inscricaoEstadual', e.target.value)} placeholder="000.000.000.000" />
                </label>
                <label className={modalStyles.field}>
                    Status
                    <select value={value.ativo ? 'true' : 'false'} onChange={e => campo('ativo', e.target.value === 'true')}>
                        <option value="true">Ativa</option>
                        <option value="false">Inativa</option>
                    </select>
                </label>
            </div>

            <div className={modalStyles.row}>
                <div className={`${modalStyles.field} ${modalStyles.maskedField}`}>
                    <MaskedInput plain name="telefone" label="Telefone" value={value.telefone} onChange={v => campo('telefone', v)} mask="phone" placeholder="(11)99999-9999" />
                </div>
                <div className={`${modalStyles.field} ${modalStyles.maskedField}`}>
                    <MaskedInput plain name="celular" label="Celular" value={value.celular} onChange={v => campo('celular', v)} mask="phone" placeholder="(11)99999-9999" />
                </div>
                <label className={modalStyles.field}>
                    Contato
                    <input type="text" value={value.contato} onChange={e => campo('contato', e.target.value)} />
                </label>
            </div>

            <div className={modalStyles.row}>
                <label className={modalStyles.field}>
                    E-mail
                    <input type="email" value={value.email} onChange={e => campo('email', e.target.value)} placeholder="contato@empresa.com.br" />
                </label>
                <label className={modalStyles.field}>
                    Nome do Responsável
                    <input type="text" value={value.nomeResponsavel} onChange={e => campo('nomeResponsavel', e.target.value)} />
                </label>
                <div className={`${modalStyles.field} ${modalStyles.maskedField}`}>
                    <MaskedInput plain name="telefoneResponsavel" label="Telefone do Responsável" value={value.telefoneResponsavel} onChange={v => campo('telefoneResponsavel', v)} mask="phone" placeholder="(11)99999-9999" />
                </div>
            </div>

            <div className={modalStyles.row}>
                <label className={modalStyles.field}>
                    E-mail do Responsável
                    <input type="email" value={value.emailResponsavel} onChange={e => campo('emailResponsavel', e.target.value)} placeholder="responsavel@empresa.com.br" />
                </label>
                <label className={modalStyles.field}>
                    Operador responsável
                    <select value={value.operadorId} onChange={e => campo('operadorId', e.target.value)} disabled={!podeTrocarOperador}>
                        <option value="">Sem operador</option>
                        {operadores.map(op => <option key={op._id} value={op._id}>{op.displayName || op.email}</option>)}
                    </select>
                    <span className={modalStyles.hint}>Quem da equipe do CNV cuida desta loja.</span>
                </label>
            </div>

            <div className={modalStyles.row}>
                <div className={`${modalStyles.field} ${modalStyles.maskedField}`}>
                    <MaskedInput plain name="cep" label="CEP" value={value.cep} onChange={mudarCep} mask="cep" placeholder="00000-000" />
                    {buscandoCep && <small className={modalStyles.hint}>Buscando CEP...</small>}
                    {cepErro && <small className={modalStyles.fieldError}>{cepErro}</small>}
                </div>
                <label className={modalStyles.field}>
                    Número
                    <input type="text" value={value.numero} onChange={e => campo('numero', e.target.value)} />
                </label>
                <label className={modalStyles.field}>
                    Complemento
                    <input type="text" value={value.complemento} onChange={e => campo('complemento', e.target.value)} placeholder="Opcional" />
                </label>
            </div>

            <div className={modalStyles.row}>
                <label className={modalStyles.field}>
                    Endereço
                    <input type="text" value={value.endereco} onChange={e => campo('endereco', e.target.value)} />
                </label>
                <label className={modalStyles.field}>
                    Bairro
                    <input type="text" value={value.bairro} onChange={e => campo('bairro', e.target.value)} />
                </label>
            </div>

            <div className={modalStyles.row}>
                <label className={modalStyles.field}>
                    Cidade
                    <input type="text" value={value.cidade} onChange={e => campo('cidade', e.target.value)} />
                </label>
                <label className={modalStyles.field}>
                    UF
                    <select value={value.uf} onChange={e => campo('uf', e.target.value)}>
                        <option value="">Selecione</option>
                        {UFS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
                    </select>
                </label>
            </div>

            <label className={modalStyles.field}>
                Observações
                <textarea value={value.observacoes} onChange={e => campo('observacoes', e.target.value)} rows={3} placeholder="Informações adicionais, acordos comerciais ou notas internas" />
            </label>
        </fieldset>
    );
}
