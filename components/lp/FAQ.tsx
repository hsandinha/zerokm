'use client';

import { useState } from 'react';
import styles from './FAQ.module.css';

interface FAQItem {
    q: string;
    a: string;
}

export default function LandingFAQ({ items }: { items: FAQItem[] }) {
    const [open, setOpen] = useState<number | null>(null);

    return (
        <div className={styles.faq}>
            {items.map((item, i) => (
                <div key={i} className={`${styles.item} ${open === i ? styles.open : ''}`}>
                    <button className={styles.btn} onClick={() => setOpen(open === i ? null : i)}>
                        <span>{item.q}</span>
                        <svg
                            className={styles.chevron}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            width="16"
                            height="16"
                        >
                            <polyline points="6 9 12 15 18 9" />
                        </svg>
                    </button>
                    {open === i && (
                        <div className={styles.answer}>{item.a}</div>
                    )}
                </div>
            ))}
        </div>
    );
}
