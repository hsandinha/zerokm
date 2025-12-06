'use client';

import { useState, useEffect } from 'react';
import styles from './MargemManagement.module.css';

export function MargemManagement() {
    const [margem, setMargem] = useState<number>(0);
    const [inputMargem, setInputMargem] = useState<string>('0');

    // Carregar margem do localStorage ao iniciar
    useEffect(() => {
        const savedMargem = localStorage.getItem('vehicleMargem');
        if (savedMargem) {
            const parsedMargem = parseFloat(savedMargem);
            setMargem(parsedMargem);
            setInputMargem(parsedMargem.toString());
        }
    }, []);

    const handleSaveMargem = () => {
        const newMargem = parseFloat(inputMargem) || 0;
        setMargem(newMargem);
        localStorage.setItem('vehicleMargem', newMargem.toString());
        alert(`Margem de ${newMargem}% salva com sucesso!`);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        // Permite apenas números e ponto decimal
        if (/^\d*\.?\d*$/.test(value)) {
            setInputMargem(value);
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.configHeader}>
                <h2>Margem</h2>
                <p>Defina a margem percentual aplicada ao preço dos veículos.</p>
            </div>

            <div className={styles.configSection}>
                <div className={styles.configCard}>
                    <div className={styles.configCardHeader}>
                        <h3>Margem de Lucro dos Veículos</h3>
                        <p>Configure a margem percentual aplicada aos preços exibidos.</p>
                    </div>

                    <div className={styles.configCardBody}>
                        <div className={styles.margemInputGroup}>
                            <label htmlFor="margem">Margem (%):</label>
                            <div className={styles.inputWithButton}>
                                <input
                                    id="margem"
                                    type="text"
                                    value={inputMargem}
                                    onChange={handleInputChange}
                                    placeholder=""
                                    className={styles.margemInput}
                                />
                                <span className={styles.percentSymbol}>%</span>
                                <button
                                    onClick={handleSaveMargem}
                                    className={styles.saveButton}
                                >
                                    Salvar
                                </button>
                            </div>
                        </div>

                        <div className={styles.margemInfo}>
                            <div className={styles.infoRow}>
                                <span>Margem Atual:</span>
                                <strong>{margem}%</strong>
                            </div>
                            <div className={styles.infoRow}>
                                <span>Exemplo de Cálculo:</span>
                                <span>Preço R$ 100.000 + {margem}% = R$ {(100000 * (1 + margem / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
