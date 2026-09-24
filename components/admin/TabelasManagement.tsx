'use client';

import { useState } from 'react';
import { Tags, CarFront, Palette } from 'lucide-react';
import { MarcasTable } from '../../components/operator/MarcasTable';
import { ModelosTable } from '../../components/operator/ModelosTable';
import CoresTable from '../../components/operator/CoresTable';
import styles from './TabelasManagement.module.css';

export function TabelasManagement() {
    const [activeTable, setActiveTable] = useState<'marcas' | 'modelos' | 'cores'>('marcas');

    return (
        <div className={styles.combinedContainer}>
            <div className={styles.subTabBar}>
                <button
                    className={`${styles.subTab} ${activeTable === 'marcas' ? styles.subTabActive : ''}`}
                    onClick={() => setActiveTable('marcas')}
                >
                    <Tags size={16} aria-hidden="true" /> Marcas
                </button>
                <button
                    className={`${styles.subTab} ${activeTable === 'modelos' ? styles.subTabActive : ''}`}
                    onClick={() => setActiveTable('modelos')}
                >
                    <CarFront size={16} aria-hidden="true" /> Modelos
                </button>
                <button
                    className={`${styles.subTab} ${activeTable === 'cores' ? styles.subTabActive : ''}`}
                    onClick={() => setActiveTable('cores')}
                >
                    <Palette size={16} aria-hidden="true" /> Cores
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
