import React, { useState } from 'react';
import { MarcasTable } from './MarcasTable';
import { ModelosTable } from './ModelosTable';
import CoresTable from './CoresTable';
import styles from '../../app/dashboard/operator/operator.module.css';

export function TabelasTab() {
    const [activeTable, setActiveTable] = useState<'marcas' | 'modelos' | 'cores'>('marcas');

    return (
        <div className={styles.combinedContainer}>
            <div className={styles.subTabBar}>
                <button
                    className={`${styles.subTab} ${activeTable === 'marcas' ? styles.subTabActive : ''}`}
                    onClick={() => setActiveTable('marcas')}
                >
                    🏷️ Marcas
                </button>
                <button
                    className={`${styles.subTab} ${activeTable === 'modelos' ? styles.subTabActive : ''}`}
                    onClick={() => setActiveTable('modelos')}
                >
                    🚗 Modelos
                </button>
                <button
                    className={`${styles.subTab} ${activeTable === 'cores' ? styles.subTabActive : ''}`}
                    onClick={() => setActiveTable('cores')}
                >
                    🎨 Cores
                </button>
            </div>

            <div className={styles.tabContent}>
                {activeTable === 'marcas' && <MarcasTable />}
                {activeTable === 'modelos' && <ModelosTable />}
                {activeTable === 'cores' && <CoresTable />}
            </div>
        </div>
    );
}
