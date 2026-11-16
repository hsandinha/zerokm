'use client';

// Barra de rolagem horizontal presa no rodapé da tela.
//
// Tabela larga e comprida: a barra horizontal de verdade fica no fim da
// tabela, e a pessoa tinha de descer até lá, rolar para o lado e subir de
// novo. Esta barra é um espelho dela, fixo na base da janela, que aparece só
// enquanto a barra de verdade está fora da tela. Rolar uma move a outra.
//
// Só em telas de mouse (a partir de 769px): no toque, arrasta-se a tabela.

import { useEffect, useRef, useState, type RefObject } from 'react';
import styles from './BarraHorizontalFixa.module.css';

type Medida = { visivel: boolean; left: number; width: number; conteudo: number };

const OCULTA: Medida = { visivel: false, left: 0, width: 0, conteudo: 0 };

/** Pura, para teste: decide se o espelho aparece e onde. */
export function medirBarra(
    alvo: { top: number; bottom: number; left: number; clientWidth: number; scrollWidth: number },
    janela: { altura: number; largura: number },
): Medida {
    const transborda = alvo.scrollWidth > alvo.clientWidth + 1;
    // A barra de verdade está abaixo da dobra, e a tabela já entrou na tela.
    const fimForaDaTela = alvo.bottom > janela.altura + 4;
    const tabelaNaTela = alvo.top < janela.altura - 96;
    if (!transborda || !fimForaDaTela || !tabelaNaTela || janela.largura < 769) return OCULTA;
    return { visivel: true, left: Math.round(alvo.left), width: Math.round(alvo.clientWidth), conteudo: alvo.scrollWidth };
}

export function BarraHorizontalFixa({ alvo }: { alvo: RefObject<HTMLElement | null> }) {
    const espelho = useRef<HTMLDivElement>(null);
    const [m, setM] = useState<Medida>(OCULTA);

    useEffect(() => {
        const el = alvo.current;
        if (!el) return;
        let quadro = 0;

        const medir = () => {
            quadro = 0;
            const r = el.getBoundingClientRect();
            const nova = medirBarra(
                { top: r.top, bottom: r.bottom, left: r.left, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth },
                { altura: window.innerHeight, largura: window.innerWidth },
            );
            setM((antiga) =>
                antiga.visivel === nova.visivel && antiga.left === nova.left && antiga.width === nova.width && antiga.conteudo === nova.conteudo
                    ? antiga
                    : nova,
            );
        };
        const agendar = () => {
            if (!quadro) quadro = requestAnimationFrame(medir);
        };
        // A tabela rolou: o espelho acompanha.
        const acompanhar = () => {
            const e = espelho.current;
            if (e && Math.abs(e.scrollLeft - el.scrollLeft) > 1) e.scrollLeft = el.scrollLeft;
        };

        medir();
        // capture: pega a rolagem de qualquer ancestral, não só da janela.
        window.addEventListener('scroll', agendar, { capture: true, passive: true });
        window.addEventListener('resize', agendar);
        el.addEventListener('scroll', acompanhar, { passive: true });
        const observador = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(agendar) : null;
        observador?.observe(el);
        if (el.firstElementChild) observador?.observe(el.firstElementChild);

        return () => {
            if (quadro) cancelAnimationFrame(quadro);
            window.removeEventListener('scroll', agendar, { capture: true });
            window.removeEventListener('resize', agendar);
            el.removeEventListener('scroll', acompanhar);
            observador?.disconnect();
        };
    }, [alvo]);

    // Ao aparecer, o espelho começa onde a tabela está.
    useEffect(() => {
        if (m.visivel && espelho.current && alvo.current) espelho.current.scrollLeft = alvo.current.scrollLeft;
    }, [m.visivel, m.conteudo, alvo]);

    if (!m.visivel) return null;

    return (
        <div
            ref={espelho}
            className={styles.barra}
            style={{ left: m.left, width: m.width }}
            // Decorativa para leitor de tela: a tabela continua rolável por teclado.
            aria-hidden="true"
            onScroll={(e) => {
                const el = alvo.current;
                const x = e.currentTarget.scrollLeft;
                if (el && Math.abs(el.scrollLeft - x) > 1) el.scrollLeft = x;
            }}
        >
            <div style={{ width: m.conteudo, height: 1 }} />
        </div>
    );
}
