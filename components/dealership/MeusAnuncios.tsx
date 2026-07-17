'use client';

import React, { useState, useEffect } from 'react';
import styles from '../admin/ConfiguracoesManagement.module.css'; // Reusing admin styles
import { BannerPaymentModal } from './BannerPaymentModal';

interface Banner {
    _id: string;
    title: string;
    imageUrl: string;
    linkUrl: string;
    isActive: boolean;
    status: string;
    expiresAt: string;
}

export function MeusAnuncios() {
    const [banners, setBanners] = useState<Banner[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

    const [bannerConfig, setBannerConfig] = useState({ price_cents: 5000, duration_days: 7 });

    const [newBanner, setNewBanner] = useState({
        title: '',
        linkUrl: '',
        imageBase64: ''
    });

    const [showModal, setShowModal] = useState(false);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        carregarBanners();
        carregarConfig();
    }, []);

    // Tick de 1 minuto para o timer regressivo dos banners ativos
    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    const renderVencimento = (banner: Banner) => {
        if (!banner.expiresAt) return '-';

        const expiresAt = new Date(banner.expiresAt).getTime();
        const remainingMs = expiresAt - now;

        if (banner.status === 'active' && remainingMs > 0) {
            const hours = Math.floor(remainingMs / (60 * 60 * 1000));
            const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
            return (
                <span style={{ color: hours < 3 ? '#d93025' : '#1e8e3e', fontWeight: 'bold' }}>
                    ⏱ Expira em {hours}h {minutes}min
                </span>
            );
        }

        if (banner.status === 'active' || banner.status === 'expired') {
            return <span style={{ color: '#d93025', fontWeight: 'bold' }}>Vencido</span>;
        }

        return new Date(banner.expiresAt).toLocaleDateString();
    };

    const carregarConfig = async () => {
        try {
            const res = await fetch('/api/config/banners');
            if (res.ok) {
                const data = await res.json();
                setBannerConfig(data);
            }
        } catch (error) {
            console.error('Erro config banners', error);
        }
    };

    const carregarBanners = async () => {
        try {
            setIsLoading(true);
            const res = await fetch('/api/dealership/banners');
            if (res.ok) {
                const data = await res.json();
                setBanners(data);
            }
        } catch (error) {
            console.error('Erro ao buscar banners:', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setFeedback({ type: 'error', msg: 'Apenas arquivos de imagem (JPEG, PNG, etc) são permitidos.' });
            return;
        }

        if (file.size > 2 * 1024 * 1024) { // 2MB limit
            setFeedback({ type: 'error', msg: 'A imagem deve ter no máximo 2MB.' });
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setNewBanner({ ...newBanner, imageBase64: reader.result as string });
        };
        reader.readAsDataURL(file);
    };

    const handleCreateBanner = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBanner.title || !newBanner.imageBase64) {
            setFeedback({ type: 'error', msg: 'Título e imagem são obrigatórios.' });
            return;
        }

        setFeedback(null);
        setShowModal(true);
    };

    const handleSuccess = () => {
        setShowModal(false);
        setNewBanner({ title: '', linkUrl: '', imageBase64: '' });
        carregarBanners();
        setFeedback({ type: 'success', msg: 'Pagamento recebido! Seu banner será analisado pela equipe.' });
    };

    if (isLoading) {
        return <div className={styles.loading}>Carregando anúncios...</div>;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Meus Anúncios (Banners)</h2>
                <p className={styles.subtitle}>
                    Anuncie seus veículos na tela inicial dos Clientes. O valor é de <strong>R$ {(bannerConfig.price_cents / 100).toFixed(2)}</strong> por um período de <strong>{bannerConfig.duration_days} dias</strong>.
                </p>
            </div>

            {feedback && (
                <div className={`${styles.feedback} ${feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError}`}>
                    {feedback.msg}
                </div>
            )}

            <form onSubmit={handleCreateBanner} className={styles.form}>
                <div className={styles.formGroupPanel}>
                    <h3 className={styles.groupTitle}>Criar Novo Anúncio</h3>
                    <div className={styles.grid2}>
                        <div className={styles.formGroup}>
                            <label>Título do Anúncio</label>
                            <input 
                                type="text"
                                placeholder="Ex: Creta 2024 Imperdível"
                                value={newBanner.title}
                                onChange={e => setNewBanner({...newBanner, title: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Link para o Veículo (Opcional)</label>
                            <input 
                                type="url"
                                placeholder="https://wa.me/..."
                                value={newBanner.linkUrl}
                                onChange={e => setNewBanner({...newBanner, linkUrl: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroupFull}>
                            <label>Imagem do Banner (Recomendado: 1200x300, máx 2MB)</label>
                            <input 
                                type="file"
                                accept="image/*"
                                onChange={handleImageUpload}
                                className={styles.input}
                                style={{ padding: '0.5rem' }}
                            />
                            {newBanner.imageBase64 && (
                                <div style={{ marginTop: '1rem' }}>
                                    <img src={newBanner.imageBase64} alt="Preview" style={{ maxWidth: '100%', maxHeight: '150px', borderRadius: '8px', border: '1px solid #ccc' }} />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className={styles.formActions}>
                    <button type="submit" disabled={isCreating} className={styles.btnSave}>
                        {isCreating ? 'Aguarde...' : 'Pagar e Publicar Anúncio'}
                    </button>
                </div>
            </form>

            <div className={styles.formGroupPanel} style={{ marginTop: '2rem' }}>
                <h3 className={styles.groupTitle}>Histórico de Anúncios</h3>
                
                {banners.length === 0 ? (
                    <p style={{ color: '#666' }}>Nenhum anúncio criado até o momento.</p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                                <th style={{ padding: '1rem' }}>Imagem</th>
                                <th style={{ padding: '1rem' }}>Título</th>
                                <th style={{ padding: '1rem' }}>Status</th>
                                <th style={{ padding: '1rem' }}>Vencimento</th>
                            </tr>
                        </thead>
                        <tbody>
                            {banners.map(banner => (
                                <tr key={banner._id} style={{ borderBottom: '1px solid #eee' }}>
                                    <td style={{ padding: '1rem', width: '200px' }}>
                                        <img src={banner.imageUrl} alt={banner.title} style={{ width: '150px', height: 'auto', borderRadius: '4px', border: '1px solid #ddd' }} />
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <strong>{banner.title}</strong>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        {banner.status === 'active' && <span style={{ color: '#1e8e3e', fontWeight: 'bold' }}>Ativo</span>}
                                        {banner.status === 'pending' && <span style={{ color: '#f29900', fontWeight: 'bold' }}>Aguardando Aprovação</span>}
                                        {banner.status === 'awaiting_payment' && <span style={{ color: '#d93025', fontWeight: 'bold' }}>Pagamento Pendente</span>}
                                        {banner.status === 'rejected' && <span style={{ color: '#d93025', fontWeight: 'bold' }}>Rejeitado</span>}
                                        {banner.status === 'expired' && <span style={{ color: '#80868b', fontWeight: 'bold' }}>Expirado</span>}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        {renderVencimento(banner)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {showModal && (
                <BannerPaymentModal 
                    bannerData={{
                        title: newBanner.title,
                        imageUrl: newBanner.imageBase64,
                        linkUrl: newBanner.linkUrl,
                        amount: bannerConfig.price_cents / 100
                    }}
                    onClose={() => setShowModal(false)} 
                    onSuccess={handleSuccess} 
                />
            )}
        </div>
    );
}
