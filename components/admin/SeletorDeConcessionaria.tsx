'use client';

// Escolher uma concessionária entre centenas: busca por nome, razão social,
// CNPJ, cidade, UF, marca ou contato, em vez de uma lista suspensa com 950
// linhas. Teclado: setas, Enter e Esc. Cada linha mostra marca, cidade e
// quantos veículos ativos a loja tem, para a pessoa confirmar que é a certa.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import type { Concessionaria } from '@/lib/services/concessionariaService';
import styles from './SeletorDeConcessionaria.module.css';

const MAX_NA_LISTA = 40;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const soDigitos = (s: string) => s.replace(/\D/g, '');

type Loja = Concessionaria & { razaoSocial?: string; cnpj?: string; contato?: string };

/** Texto pesquisável de uma loja (sem acento, minúsculo) e os dígitos do CNPJ. */
export function indiceDaLoja(c: Loja): { texto: string; digitos: string } {
    const marcas = c.marcas?.length ? c.marcas : c.marca ? [c.marca] : [];
    const texto = semAcento([c.nome, c.razaoSocial, c.cidade, c.uf, c.nomeResponsavel, c.contato, c.emailResponsavel, ...marcas].filter(Boolean).join(' '));
    return { texto, digitos: soDigitos(c.cnpj || '') };
}

/**
 * Lojas que casam com a busca: todas as palavras têm de aparecer (em qualquer
 * ordem); busca só de números casa com o CNPJ. Quem começa pelo termo vem antes.
 */
export function filtrarLojas<T extends Loja>(lojas: T[], busca: string): T[] {
    const termo = semAcento(busca.trim());
    if (!termo) return lojas;
    const palavras = termo.split(/\s+/).filter(Boolean);
    const digitos = soDigitos(busca);
    const soNumero = digitos.length >= 3 && /^[\d.\-/\s]+$/.test(busca.trim());
    const achadas = lojas.filter((c) => {
        const idx = indiceDaLoja(c);
        if (soNumero) return idx.digitos.includes(digitos);
        return palavras.every((p) => idx.texto.includes(p));
    });
    const comeca = (c: T) => (semAcento(c.nome || '').startsWith(palavras[0] ?? '') ? 0 : 1);
    return [...achadas].sort((a, b) => comeca(a) - comeca(b));
}

export function rotuloDaLoja(c: Loja): string {
    const marcas = c.marcas?.length ? c.marcas : c.marca ? [c.marca] : [];
    const local = c.cidade ? `${c.cidade}${c.uf ? `/${c.uf}` : ''}` : '';
    return [marcas.length ? marcas.join(', ') : 'Sem marca', local].filter(Boolean).join(' · ');
}

export function SeletorDeConcessionaria({
    lojas,
    value,
    onChange,
    loading = false,
    autoFocus = false,
}: {
    lojas: Loja[];
    value: string;
    onChange: (id: string) => void;
    loading?: boolean;
    autoFocus?: boolean;
}) {
    const [busca, setBusca] = useState('');
    const [aberto, setAberto] = useState(false);
    const [destaque, setDestaque] = useState(0);
    const caixa = useRef<HTMLDivElement>(null);
    const campo = useRef<HTMLInputElement>(null);
    const idLista = useId();

    const selecionada = lojas.find((c) => c.id === value) || null;
    const achadas = useMemo(() => filtrarLojas(lojas, busca), [lojas, busca]);
    const visiveis = achadas.slice(0, MAX_NA_LISTA);

    // Fecha ao clicar fora.
    useEffect(() => {
        if (!aberto) return;
        const fora = (e: MouseEvent) => {
            if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
        };
        document.addEventListener('mousedown', fora);
        return () => document.removeEventListener('mousedown', fora);
    }, [aberto]);

    useEffect(() => setDestaque(0), [busca]);

    const escolher = (id: string) => {
        onChange(id);
        setBusca('');
        setAberto(false);
    };

    const tecla = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setAberto(true);
            setDestaque((d) => Math.min(d + 1, Math.max(visiveis.length - 1, 0)));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setDestaque((d) => Math.max(d - 1, 0));
        } else if (e.key === 'Enter') {
            if (aberto && visiveis[destaque]) {
                e.preventDefault();
                escolher(visiveis[destaque].id!);
            }
        } else if (e.key === 'Escape') {
            setAberto(false);
        }
    };

    return (
        <div className={styles.caixa} ref={caixa}>
            <div className={styles.campo}>
                <Search size={16} className={styles.icone} aria-hidden="true" />
                <input
                    ref={campo}
                    type="text"
                    role="combobox"
                    aria-expanded={aberto}
                    aria-controls={idLista}
                    aria-autocomplete="list"
                    aria-label="Buscar concessionária"
                    autoFocus={autoFocus}
                    disabled={loading}
                    placeholder={loading ? 'Carregando...' : selecionada ? selecionada.nome : 'Buscar por nome, CNPJ, cidade ou marca'}
                    className={selecionada && !busca ? styles.comEscolha : undefined}
                    value={busca}
                    onChange={(e) => { setBusca(e.target.value); setAberto(true); }}
                    onFocus={() => setAberto(true)}
                    onKeyDown={tecla}
                />
                {(busca || selecionada) && !loading && (
                    <button
                        type="button"
                        className={styles.limpar}
                        aria-label={busca ? 'Limpar busca' : 'Tirar a concessionária escolhida'}
                        onClick={() => { if (busca) setBusca(''); else onChange(''); campo.current?.focus(); }}
                    >
                        <X size={15} aria-hidden="true" />
                    </button>
                )}
            </div>

            {aberto && !loading && (
                <div className={styles.lista} id={idLista} role="listbox">
                    {visiveis.length === 0 && <div className={styles.vazio}>Nenhuma concessionária com “{busca}”.</div>}
                    {visiveis.map((c, i) => {
                        const ativos = c.totalAtivos || 0;
                        return (
                            <button
                                type="button"
                                key={c.id}
                                role="option"
                                aria-selected={c.id === value}
                                className={`${styles.item} ${i === destaque ? styles.itemDestaque : ''}`}
                                onMouseEnter={() => setDestaque(i)}
                                onClick={() => escolher(c.id!)}
                            >
                                <span className={styles.itemTexto}>
                                    <span className={styles.itemNome}>{c.nome}{c.ativo === false && <span className={styles.inativa}> · inativa</span>}</span>
                                    <span className={styles.itemSub}>{rotuloDaLoja(c)}</span>
                                </span>
                                <span className={ativos > 0 ? styles.contagem : styles.contagemZero}>
                                    {ativos.toLocaleString('pt-BR')} {ativos === 1 ? 'veículo' : 'veículos'}
                                </span>
                            </button>
                        );
                    })}
                    {achadas.length > visiveis.length && (
                        <div className={styles.rodape}>
                            Mostrando {visiveis.length} de {achadas.length.toLocaleString('pt-BR')}. Digite mais para afinar.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
