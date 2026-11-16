'use client';

// Faixas de preço do modal "Configurar margem": cada faixa vale até um preço
// e sobe o veículo em % ou em valor fixo. O que fica acima da última faixa
// usa a margem geral do modal. A conta em si mora em lib/utils/margem.ts.

import { Plus, Trash2 } from 'lucide-react';
import adminModal from '@/components/admin/AdminModal.module.css';
import { MAX_FAIXAS, aplicarMargem, type FaixaDeMargem, type TipoDeMargem } from '@/lib/utils/margem';
import styles from './MargemFaixas.module.css';
import { CampoValor } from '@/components/ui/CampoValor';

/** Linha como está sendo digitada (texto), antes de virar número. */
export type FaixaEmEdicao = { id: string; ate: string; tipo: TipoDeMargem; valor: string };

let seq = 0;
const novoId = () => `faixa-${Date.now().toString(36)}-${seq++}`;

/** "100.000,50" ou "100000.5" → 100000.5; vazio ou inválido → null. */
export function lerNumero(texto: string): number | null {
    const t = texto.trim();
    if (!t) return null;
    // Com vírgula, o ponto é separador de milhar; sem vírgula, ponto é decimal
    // só quando não parece milhar (1.000 → 1000, 4.5 → 4.5).
    const limpo = t.includes(',')
        ? t.replace(/\./g, '').replace(',', '.')
        : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t;
    if (!/^\d+(\.\d+)?$/.test(limpo)) return null;
    const n = Number(limpo);
    return Number.isFinite(n) ? n : null;
}

const paraTexto = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export function faixasParaEdicao(faixas: FaixaDeMargem[] | undefined): FaixaEmEdicao[] {
    return (faixas ?? []).map((f) => ({ id: novoId(), ate: paraTexto(f.ate), tipo: f.tipo, valor: paraTexto(f.valor) }));
}

/** As linhas preenchidas viram faixas; linha totalmente vazia é ignorada. */
export function faixasDaEdicao(linhas: FaixaEmEdicao[]): { faixas: FaixaDeMargem[] } | { erro: string } {
    const faixas: FaixaDeMargem[] = [];
    for (const l of linhas) {
        if (!l.ate.trim() && !l.valor.trim()) continue;
        const ate = lerNumero(l.ate);
        const valor = lerNumero(l.valor);
        if (ate === null || ate <= 0) return { erro: 'Informe até que preço cada faixa vale.' };
        if (valor === null) return { erro: 'Informe a margem de cada faixa.' };
        if (l.tipo === 'percent' && valor > 100) return { erro: 'A margem percentual de uma faixa vai de 0 a 100.' };
        faixas.push({ ate, tipo: l.tipo, valor });
    }
    faixas.sort((a, b) => a.ate - b.ate);
    for (let i = 1; i < faixas.length; i++) {
        if (faixas[i].ate === faixas[i - 1].ate) return { erro: 'Há duas faixas com o mesmo preço limite.' };
    }
    return { faixas };
}

const reais = (v: number) => `R$ ${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}`;

/** "De R$ 100.000 até R$ 300.000", pelo teto das outras linhas já preenchidas. */
function rotulo(linhas: FaixaEmEdicao[], linha: FaixaEmEdicao): string {
    const ate = lerNumero(linha.ate);
    if (ate === null) return 'Nova faixa';
    const anteriores = linhas
        .filter((l) => l.id !== linha.id)
        .map((l) => lerNumero(l.ate))
        .filter((n): n is number => n !== null && n < ate);
    const piso = anteriores.length ? Math.max(...anteriores) : null;
    return piso === null ? `Até ${reais(ate)}` : `De ${reais(piso)} até ${reais(ate)}`;
}

/** "R$ 80.000 vira R$ 84.000": um preço dentro da faixa, para conferir. */
function exemplo(linhas: FaixaEmEdicao[], linha: FaixaEmEdicao): string | null {
    const ate = lerNumero(linha.ate);
    const valor = lerNumero(linha.valor);
    if (ate === null || valor === null) return null;
    const final = aplicarMargem(ate, { margem: 0, marginMode: 'percent', fixedMargin: 0, faixas: [{ ate, tipo: linha.tipo, valor }] });
    return `Exemplo: ${reais(ate)} vira ${reais(final)}`;
}

export function MargemFaixas({
    linhas,
    onChange,
    disabled = false,
}: {
    linhas: FaixaEmEdicao[];
    onChange: (linhas: FaixaEmEdicao[]) => void;
    disabled?: boolean;
}) {
    const trocar = (id: string, patch: Partial<FaixaEmEdicao>) =>
        onChange(linhas.map((l) => (l.id === id ? { ...l, ...patch } : l)));

    return (
        <fieldset className={adminModal.group}>
            <legend className={adminModal.groupLabel}>
                Margem por faixa de preço <span className={adminModal.groupHint}>(opcional)</span>
            </legend>
            <div className={styles.lista}>
                {linhas.length === 0 && (
                    <span className={adminModal.hint}>
                        Sem faixas, todos os veículos usam a margem acima. Crie faixas para subir cada nível de preço de um jeito, em % ou em valor fixo.
                    </span>
                )}
                {linhas.map((l, i) => (
                    <div key={l.id} className={styles.linha}>
                        <span className={styles.rotulo}>{rotulo(linhas, l)}</span>
                        <label className={styles.campo}>
                            Veículos até (R$)
                            <CampoValor
                                placeholder="100.000"
                                valor={l.ate}
                                disabled={disabled}
                                aria-label={`Faixa ${i + 1}: preço até`}
                                aoMudar={(texto) => trocar(l.id, { ate: texto })}
                            />
                        </label>
                        <div className={styles.tipo} role="group" aria-label={`Faixa ${i + 1}: tipo de margem`}>
                            <button type="button" aria-pressed={l.tipo === 'percent'} disabled={disabled} onClick={() => trocar(l.id, { tipo: 'percent' })}>%</button>
                            <button type="button" aria-pressed={l.tipo === 'fixed'} disabled={disabled} onClick={() => trocar(l.id, { tipo: 'fixed' })}>R$</button>
                        </div>
                        <label className={styles.campo}>
                            {l.tipo === 'percent' ? 'Sobe (%)' : 'Sobe (R$)'}
                            <CampoValor
                                placeholder={l.tipo === 'percent' ? '5' : '1.000'}
                                valor={l.valor}
                                disabled={disabled}
                                aria-label={`Faixa ${i + 1}: margem`}
                                aoMudar={(texto) => trocar(l.id, { valor: texto })}
                            />
                        </label>
                        <button
                            type="button"
                            className={styles.remover}
                            disabled={disabled}
                            aria-label={`Remover a faixa ${i + 1}`}
                            title="Remover faixa"
                            onClick={() => onChange(linhas.filter((x) => x.id !== l.id))}
                        >
                            <Trash2 size={16} aria-hidden="true" />
                        </button>
                        {exemplo(linhas, l) && <span className={styles.exemplo}>{exemplo(linhas, l)}</span>}
                    </div>
                ))}
                {!disabled && (
                    <button
                        type="button"
                        className={styles.adicionar}
                        disabled={linhas.length >= MAX_FAIXAS}
                        onClick={() => onChange([...linhas, { id: novoId(), ate: '', tipo: 'percent', valor: '' }])}
                    >
                        <Plus size={15} aria-hidden="true" /> Adicionar faixa
                    </button>
                )}
                {linhas.length > 0 && (
                    <span className={adminModal.hint}>
                        Veículos acima da última faixa usam a margem geral acima.
                    </span>
                )}
            </div>
        </fieldset>
    );
}
