'use client';

import { useState, useEffect } from 'react';
import styles from './MargemManagement.module.css';

export function MargemManagement() {
    const [margem, setMargem] = useState<number>(0);
    const [fixedMargin, setFixedMargin] = useState<number>(0);
    const [marginMode, setMarginMode] = useState<'percent' | 'fixed'>('percent');
    const [inputMargem, setInputMargem] = useState<string>('0');
    const [inputFixed, setInputFixed] = useState<string>('0');
    const [saving, setSaving] = useState<boolean>(false);

    // Carregar margem da API ao iniciar
    useEffect(() => {
        const fetchMargem = async () => {
            try {
                const response = await fetch('/api/config/margem');
                if (response.ok) {
                    const data = await response.json();
                    const margemValue = data.margem || 0;
                    const fixedValue = data.fixedMargin || 0;
                    const mode = (data.marginMode === 'fixed' ? 'fixed' : 'percent') as 'percent' | 'fixed';
                    setMargem(margemValue);
                    setFixedMargin(fixedValue);
                    setMarginMode(mode);
                    setInputMargem(margemValue.toString());
                    setInputFixed(fixedValue.toString());
                }
            } catch (error) {
                console.error('Erro ao carregar margem:', error);
                // Fallback para localStorage se API falhar
                const savedMargem = localStorage.getItem('vehicleMargem');
                if (savedMargem) {
                    const parsedMargem = parseFloat(savedMargem);
                    setMargem(parsedMargem);
                    setInputMargem(parsedMargem.toString());
                }
            }
        };
        fetchMargem();
    }, []);

    const handleSaveMargem = async () => {
        const newMargem = parseFloat(inputMargem) || 0;
        const newFixed = parseFloat(inputFixed) || 0;

        if (marginMode === 'percent' && (newMargem < 0 || newMargem > 100)) {
            alert('A margem percentual deve estar entre 0% e 100%');
            return;
        }

        if (marginMode === 'fixed' && newFixed < 0) {
            alert('O valor fixo deve ser maior ou igual a 0.');
            return;
        }

        setSaving(true);

        try {
            const response = await fetch('/api/config/margem', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ margem: newMargem, marginMode, fixedMargin: newFixed })
            });

            if (response.ok) {
                setMargem(newMargem);
                setFixedMargin(newFixed);
                setMarginMode(marginMode);
                // Manter localStorage como backup
                localStorage.setItem('vehicleMargem', newMargem.toString());
                alert(
                    marginMode === 'percent'
                        ? `Margem de ${newMargem}% salva com sucesso!\n\nTodos os usuários verão esta margem ao calcularem preços de venda.`
                        : `Adicional fixo de R$ ${newFixed.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} salvo com sucesso!\n\nTodos os usuários verão esta margem ao calcularem preços de venda.`
                );
            } else {
                const error = await response.json();
                alert(`Erro ao salvar margem: ${error.error || 'Erro desconhecido'}`);
            }
        } catch (error) {
            console.error('Erro ao salvar margem:', error);
            alert('Erro ao salvar margem. Verifique sua conexão e tente novamente.');
        } finally {
            setSaving(false);
        }
    };

    const handleInputChange = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        // Permite apenas números e ponto decimal
        if (/^\d*\.?\d*$/.test(value)) {
            setter(value);
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
                        <p>Configure a margem aplicada aos preços exibidos.</p>
                    </div>

                    <div className={styles.configCardBody}>
                        <div className={styles.margemInputGroup}>
                            <label>Tipo de Margem:</label>
                            <div className={styles.modeSwitch}>
                                <label className={styles.radioLabel}>
                                    <input
                                        type="radio"
                                        name="marginMode"
                                        value="percent"
                                        checked={marginMode === 'percent'}
                                        onChange={() => setMarginMode('percent')}
                                    />
                                    Percentual (%)
                                </label>
                                <label className={styles.radioLabel}>
                                    <input
                                        type="radio"
                                        name="marginMode"
                                        value="fixed"
                                        checked={marginMode === 'fixed'}
                                        onChange={() => setMarginMode('fixed')}
                                    />
                                    Valor Fixo (R$)
                                </label>
                            </div>
                        </div>

                        <div className={styles.margemInputGroup}>
                            <label htmlFor="margem">
                                {marginMode === 'percent' ? 'Margem (%)' : 'Adicional Fixo (R$)'}
                            </label>
                            <div className={styles.inputWithButton}>
                                {marginMode === 'percent' ? (
                                    <>
                                        <input
                                            id="margem"
                                            type="text"
                                            value={inputMargem}
                                            onChange={handleInputChange(setInputMargem)}
                                            className={styles.margemInput}
                                            placeholder="Ex: 8"
                                        />
                                        <span className={styles.percentSymbol}>%</span>
                                    </>
                                ) : (
                                    <>
                                        <span className={styles.percentSymbol}>R$</span>
                                        <input
                                            id="margem"
                                            type="text"
                                            value={inputFixed}
                                            onChange={handleInputChange(setInputFixed)}
                                            className={styles.margemInput}
                                            placeholder="Ex: 1500"
                                        />
                                    </>
                                )}
                                <button
                                    onClick={handleSaveMargem}
                                    className={styles.saveButton}
                                    disabled={saving}
                                >
                                    {saving ? 'Salvando...' : 'Salvar'}
                                </button>
                            </div>
                        </div>

                        <div className={styles.margemInfo}>
                            <div className={styles.infoRow}>
                                <span>Margem Atual:</span>
                                <strong>
                                    {marginMode === 'percent'
                                        ? `${margem}%`
                                        : `R$ ${fixedMargin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                </strong>
                            </div>
                            <div className={styles.infoRow}>
                                <span>Exemplo de Cálculo:</span>
                                <span>
                                    {marginMode === 'percent'
                                        ? `Preço R$ 100.000 + ${margem}% = R$ ${(100000 * (1 + margem / 100)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
                                        : `Preço R$ 100.000 + R$ ${fixedMargin.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} = R$ ${(100000 + fixedMargin).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
