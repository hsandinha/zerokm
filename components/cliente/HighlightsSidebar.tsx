'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import styles from './HighlightsSidebar.module.css';

interface Vehicle {
    _id: string;
    marca: string;
    modelo: string;
    preco: string | number;
    fotos?: string[];
}

export function HighlightsSidebar() {
    const [vehicles, setVehicles] = useState<Vehicle[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchHighlights = async () => {
            try {
                // Fetch latest vehicles
                const res = await fetch('/api/vehicles?limit=3');
                if (res.ok) {
                    const data = await res.json();
                    // If the API doesn't support limit, just slice the first 3
                    const recent = Array.isArray(data) ? data.slice(0, 3) : (data.vehicles || []).slice(0, 3);
                    setVehicles(recent);
                }
            } catch (error) {
                console.error('Erro ao buscar destaques', error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchHighlights();
    }, []);

    const formatPrice = (value: string | number) => {
        if (!value) return 'Sob consulta';
        if (typeof value === 'string' && value.includes('R$')) return value;
        const num = typeof value === 'string' ? parseFloat(value.replace(/\D/g, '')) / 100 : value;
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num || 0);
    };

    if (isLoading) {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Destaques</h3>
                </div>
                <div className={styles.loading}>Carregando...</div>
            </div>
        );
    }

    if (vehicles.length === 0) {
        return null; // Não exibe a barra se não tiver veículos
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h3 className={styles.title}>Destaques</h3>
                <span className={styles.seeAll}>Veja Todos →</span>
            </div>
            
            <div className={styles.list}>
                {vehicles.map((v) => (
                    <div key={v._id} className={styles.item}>
                        <div className={styles.imageWrapper}>
                            <img 
                                src={v.fotos && v.fotos.length > 0 ? v.fotos[0] : '/images/placeholder.png'} 
                                alt={v.modelo} 
                                className={styles.image}
                            />
                        </div>
                        <div className={styles.info}>
                            <span className={styles.brand}>{v.marca}</span>
                            <span className={styles.name}>{v.modelo}</span>
                            <span className={styles.price}>{formatPrice(v.preco)}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
