'use client';

import { useId, useState } from 'react';
import styles from '@/app/page.module.css';
import { OpenModalButton } from '@/components/lp/OpenModalButton';

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

/**
 * "Faça a conta da sua loja": o lojista informa quantos carros compra pela
 * mesa e quanto paga por carro; a diferença para o plano mais barato é o que
 * fica na loja em um ano. Sem número inventado: a conta é com os dados dele.
 */
export function ComissaoCalculadora({ precoPlanoMensal, nomePlano }: { precoPlanoMensal: number; nomePlano: string }) {
    const [carros, setCarros] = useState(8);
    const [comissao, setComissao] = useState(1200);
    const idCarros = useId();
    const idComissao = useId();

    const mesaAno = carros * comissao * 12;
    const planoAno = precoPlanoMensal * 12;
    const sobra = Math.max(0, mesaAno - planoAno);

    return (
        <div className={styles.calc}>
            <div className={styles.calcHead}>
                <h3 className={styles.calcTitle}>Faça a conta da sua loja</h3>
                <p className={styles.calcSub}>Mova os controles com os números do seu mês.</p>
            </div>

            <div className={styles.calcField}>
                <span className={styles.calcFieldTop}>
                    <label htmlFor={idCarros}>Carros comprados pela mesa por mês</label>
                    <output htmlFor={idCarros} className={styles.calcValue}>{carros}</output>
                </span>
                <input id={idCarros} type="range" min={1} max={60} step={1} value={carros}
                    onChange={e => setCarros(Number(e.target.value))} className={styles.calcRange} />
            </div>

            <div className={styles.calcField}>
                <span className={styles.calcFieldTop}>
                    <label htmlFor={idComissao}>Comissão paga por carro</label>
                    <output htmlFor={idComissao} className={styles.calcValue}>{brl(comissao)}</output>
                </span>
                <input id={idComissao} type="range" min={300} max={5000} step={100} value={comissao}
                    onChange={e => setComissao(Number(e.target.value))} className={styles.calcRange} />
            </div>

            <div className={styles.calcLines}>
                <div className={styles.calcLine}><span>Comissão para a mesa por ano</span><strong>{brl(mesaAno)}</strong></div>
                <div className={styles.calcLine}><span>{nomePlano} por ano</span><strong>{brl(planoAno)}</strong></div>
            </div>

            <div className={styles.calcResult} aria-live="polite">
                <span className={styles.calcResultLabel}>Fica na sua loja em um ano</span>
                <span className={styles.calcResultValue}>{brl(sobra)}</span>
            </div>

            <OpenModalButton type="cliente" className={`${styles.btn} ${styles.btnLg} ${styles.btnPrimary} ${styles.btnBlock}`}>
                Testar grátis por 10 minutos
            </OpenModalButton>
        </div>
    );
}
