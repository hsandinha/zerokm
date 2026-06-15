'use client';

import React, { useState, useEffect } from 'react';
import styles from './ConfiguracoesManagement.module.css';

interface Banner {
    _id: string;
    title: string;
    imageUrl: string;
    linkUrl: string;
    isActive: boolean;
    order: number;
    dealershipId?: string;
    status: string;
    createdAt: string;
}

export function BannersManagement() {
    const [banners, setBanners] = useState<Banner[]>([]);
    const [dealerships, setDealerships] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

    const [newBanner, setNewBanner] = useState({
        title: '',
        linkUrl: '',
        imageBase64: '',
        badge: '',
        price: '',
        priceSubtitle: '',
        vehicleModel: '',
        storeName: '',
        year: '',
        color: '',
        fuel: '',
        delivery: '',
        statusCondition: '',
        ctaText: ''
    });
    const [editingId, setEditingId] = useState<string | null>(null);

    const handleCancelEdit = () => {
        setEditingId(null);
        setNewBanner({ 
            title: '', linkUrl: '', imageBase64: '', 
            badge: '', price: '', priceSubtitle: '', vehicleModel: '', storeName: '', 
            year: '', color: '', fuel: '', delivery: '', statusCondition: '', ctaText: '' 
        });
    };

    useEffect(() => {
        carregarBanners();
        carregarConcessionarias();
    }, []);

    const carregarBanners = async () => {
        try {
            setIsLoading(true);
            const res = await fetch('/api/admin/banners');
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

    const carregarConcessionarias = async () => {
        try {
            const res = await fetch('/api/concessionarias');
            if (res.ok) {
                const data = await res.json();
                setDealerships(data);
            }
        } catch (error) {
            console.error('Erro ao buscar concessionárias', error);
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

        try {
            setIsSaving(true);
            const url = editingId ? `/api/admin/banners/${editingId}` : '/api/admin/banners';
            const method = editingId ? 'PATCH' : 'POST';
            
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: newBanner.title,
                    imageUrl: newBanner.imageBase64,
                    linkUrl: newBanner.linkUrl,
                    badge: newBanner.badge,
                    price: newBanner.price,
                    priceSubtitle: newBanner.priceSubtitle,
                    vehicleModel: newBanner.vehicleModel,
                    storeName: newBanner.storeName,
                    year: newBanner.year,
                    color: newBanner.color,
                    fuel: newBanner.fuel,
                    delivery: newBanner.delivery,
                    statusCondition: newBanner.statusCondition,
                    ctaText: newBanner.ctaText
                })
            });

            if (res.ok) {
                setFeedback({ type: 'success', msg: editingId ? 'Banner atualizado com sucesso!' : 'Banner criado com sucesso!' });
                handleCancelEdit();
                carregarBanners();
                setTimeout(() => setFeedback(null), 3000);
            } else {
                setFeedback({ type: 'error', msg: 'Erro ao salvar banner.' });
            }
        } catch (error) {
            setFeedback({ type: 'error', msg: 'Erro de conexão ao salvar banner.' });
        } finally {
            setIsSaving(false);
        }
    };

    const toggleBannerActive = async (id: string, currentStatus: boolean) => {
        try {
            const res = await fetch(`/api/admin/banners/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !currentStatus })
            });

            if (res.ok) {
                carregarBanners();
            }
        } catch (error) {
            console.error('Erro ao atualizar status', error);
        }
    };

    const handleApprove = async (id: string) => {
        if (!confirm('Aprovar este anúncio? Ele ficará visível para todos os clientes.')) return;
        try {
            const res = await fetch(`/api/admin/banners/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: true, status: 'active' })
            });

            if (res.ok) {
                carregarBanners();
                setFeedback({ type: 'success', msg: 'Anúncio aprovado e publicado!' });
                setTimeout(() => setFeedback(null), 3000);
            }
        } catch (error) {
            console.error('Erro ao aprovar', error);
        }
    };

    const handleReject = async (id: string) => {
        if (!confirm('Tem certeza que deseja REJEITAR este anúncio?')) return;
        try {
            const res = await fetch(`/api/admin/banners/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: false, status: 'rejected' })
            });

            if (res.ok) {
                carregarBanners();
                setFeedback({ type: 'success', msg: 'Anúncio rejeitado.' });
                setTimeout(() => setFeedback(null), 3000);
            }
        } catch (error) {
            console.error('Erro ao rejeitar', error);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Tem certeza que deseja excluir este banner?')) return;
        try {
            const res = await fetch(`/api/admin/banners/${id}`, {
                method: 'DELETE'
            });

            if (res.ok) {
                carregarBanners();
                setFeedback({ type: 'success', msg: 'Banner excluído.' });
                setTimeout(() => setFeedback(null), 3000);
            }
        } catch (error) {
            console.error('Erro ao excluir', error);
        }
    };

    const handleEditClick = (banner: any) => {
        setEditingId(banner._id);
        setNewBanner({
            title: banner.title || '',
            linkUrl: banner.linkUrl || '',
            imageBase64: banner.imageUrl || '',
            badge: banner.badge || '',
            price: banner.price || '',
            priceSubtitle: banner.priceSubtitle || '',
            vehicleModel: banner.vehicleModel || '',
            storeName: banner.storeName || '',
            year: banner.year || '',
            color: banner.color || '',
            fuel: banner.fuel || '',
            delivery: banner.delivery || '',
            statusCondition: banner.statusCondition || '',
            ctaText: banner.ctaText || ''
        });
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    if (isLoading) {
        return <div className={styles.loading}>Carregando banners...</div>;
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h2 className={styles.title}>Gerenciador de Banners</h2>
                <p className={styles.subtitle}>
                    Adicione ou edite banners que aparecerão em um carrossel rotativo na tela principal dos Clientes.
                </p>
            </div>

            {feedback && (
                <div className={`${styles.feedback} ${feedback.type === 'success' ? styles.feedbackSuccess : styles.feedbackError}`}>
                    {feedback.msg}
                </div>
            )}

            <form onSubmit={handleCreateBanner} className={styles.form}>
                <div className={styles.formGroupPanel}>
                    <h3 className={styles.groupTitle}>{editingId ? 'Editar Banner' : 'Adicionar Novo Banner'}</h3>
                    <div className={styles.grid2}>
                        <div className={styles.formGroup}>
                            <label>Título (Uso Interno)</label>
                            <input 
                                type="text"
                                placeholder="Ex: Promoção de Natal"
                                value={newBanner.title}
                                onChange={e => setNewBanner({...newBanner, title: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup} style={{ gridColumn: '1 / -1' }}>
                            <label style={{ color: '#ff6b00' }}>Preencher dados a partir de uma Concessionária</label>
                            <select 
                                className={styles.input}
                                onChange={(e) => {
                                    const dId = e.target.value;
                                    const d = dealerships.find(x => x.id === dId);
                                    if (d) {
                                        const phone = d.celular || d.telefone || d.telefoneResponsavel || '';
                                        const cleanPhone = phone.replace(/\D/g, '');
                                        const waLink = cleanPhone ? `https://wa.me/55${cleanPhone}` : '';
                                        setNewBanner(prev => ({
                                            ...prev,
                                            storeName: d.nome || '',
                                            linkUrl: waLink
                                        }));
                                    }
                                }}
                            >
                                <option value="">-- Escolha uma concessionária para preencher Nome e Link --</option>
                                {dealerships.map(d => (
                                    <option key={d.id} value={d.id}>{d.nome}</option>
                                ))}
                            </select>
                            <span style={{ fontSize: '0.75rem', color: '#666' }}>Isto irá preencher automaticamente os campos "Nome da Loja" e "Link de Destino" abaixo.</span>
                        </div>
                        
                        <div className={styles.formGroup}>
                            <label>Nome da Loja</label>
                            <input 
                                type="text"
                                placeholder="Ex: CNV Veículos"
                                value={newBanner.storeName}
                                onChange={e => setNewBanner({...newBanner, storeName: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Link de Destino / WhatsApp (Opcional)</label>
                            <input 
                                type="url"
                                placeholder="https://..."
                                value={newBanner.linkUrl}
                                onChange={e => setNewBanner({...newBanner, linkUrl: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        
                        <div className={styles.formGroup}>
                            <label>Veículo (Modelo)</label>
                            <input 
                                type="text"
                                placeholder="Ex: TIGGO 5X PRO MAX"
                                value={newBanner.vehicleModel}
                                onChange={e => setNewBanner({...newBanner, vehicleModel: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Preço</label>
                            <input 
                                type="text"
                                placeholder="Ex: R$ 142.000,00"
                                value={newBanner.price}
                                onChange={e => setNewBanner({...newBanner, price: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Subtítulo do Preço</label>
                            <input 
                                type="text"
                                placeholder="Ex: PREÇO SEM O FRETE"
                                value={newBanner.priceSubtitle}
                                onChange={e => setNewBanner({...newBanner, priceSubtitle: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Nome da Loja</label>
                            <input 
                                type="text"
                                placeholder="Ex: LOJA ZEROKILOMETRO"
                                value={newBanner.storeName}
                                onChange={e => setNewBanner({...newBanner, storeName: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Ano (FAB/MOD)</label>
                            <input 
                                type="text"
                                placeholder="Ex: 26/27"
                                value={newBanner.year}
                                onChange={e => setNewBanner({...newBanner, year: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Cor</label>
                            <input 
                                type="text"
                                placeholder="Ex: PRETO"
                                value={newBanner.color}
                                onChange={e => setNewBanner({...newBanner, color: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Combustível</label>
                            <input 
                                type="text"
                                placeholder="Ex: FLEX"
                                value={newBanner.fuel}
                                onChange={e => setNewBanner({...newBanner, fuel: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Prazo de Entrega</label>
                            <input 
                                type="text"
                                placeholder="Ex: PRONTA ENTREGA"
                                value={newBanner.delivery}
                                onChange={e => setNewBanner({...newBanner, delivery: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Situação/Status</label>
                            <input 
                                type="text"
                                placeholder="Ex: ATPV-E"
                                value={newBanner.statusCondition}
                                onChange={e => setNewBanner({...newBanner, statusCondition: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Badge (Tag Laranja)</label>
                            <input 
                                type="text"
                                placeholder="Ex: OPORTUNIDADE"
                                value={newBanner.badge}
                                onChange={e => setNewBanner({...newBanner, badge: e.target.value})}
                                className={styles.input}
                            />
                        </div>
                        <div className={styles.formGroup}>
                            <label>Texto do Botão (CTA)</label>
                            <input 
                                type="text"
                                placeholder="Ex: Tenho Interesse"
                                value={newBanner.ctaText}
                                onChange={e => setNewBanner({...newBanner, ctaText: e.target.value})}
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

                <div className={styles.formActions} style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    <button type="submit" disabled={isSaving} className={styles.btnSave}>
                        {isSaving ? 'Salvando...' : (editingId ? 'Salvar Alterações' : 'Adicionar Banner')}
                    </button>
                    {editingId && (
                        <button type="button" onClick={handleCancelEdit} style={{ padding: '0.8rem 1.5rem', background: '#ccc', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                            Cancelar Edição
                        </button>
                    )}
                </div>
            </form>

            <div className={styles.formGroupPanel} style={{ marginTop: '2rem' }}>
                <h3 className={styles.groupTitle}>Banners Ativos e Inativos</h3>
                
                {banners.length === 0 ? (
                    <p style={{ color: '#666' }}>Nenhum banner cadastrado no momento.</p>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                                <th style={{ padding: '1rem' }}>Imagem</th>
                                <th style={{ padding: '1rem' }}>Título</th>
                                <th style={{ padding: '1rem' }}>Status</th>
                                <th style={{ padding: '1rem' }}>Ações</th>
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
                                        {banner.linkUrl && <div style={{ fontSize: '0.8rem', color: '#666' }}><a href={banner.linkUrl} target="_blank" rel="noreferrer">🔗 Link</a></div>}
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        <span style={{ 
                                            padding: '0.3rem 0.6rem', 
                                            borderRadius: '20px', 
                                            fontSize: '0.8rem',
                                            fontWeight: 'bold',
                                            backgroundColor: banner.status === 'pending' ? '#fef7e0' : (banner.isActive ? '#e6f4ea' : '#fce8e6'),
                                            color: banner.status === 'pending' ? '#b06000' : (banner.isActive ? '#1e8e3e' : '#d93025')
                                        }}>
                                            {banner.status === 'pending' ? 'Pendente (Aprovar)' : (banner.status === 'awaiting_payment' ? 'Aguardando Pagamento' : (banner.isActive ? 'Ativo' : 'Inativo'))}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        {banner.status === 'pending' ? (
                                            <>
                                                <button 
                                                    onClick={() => handleApprove(banner._id)}
                                                    style={{ marginRight: '0.5rem', padding: '0.5rem', borderRadius: '4px', border: '1px solid #1e8e3e', background: '#e6f4ea', color: '#1e8e3e', cursor: 'pointer' }}
                                                >
                                                    ✅ Aprovar
                                                </button>
                                                <button 
                                                    onClick={() => handleReject(banner._id)}
                                                    style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid #d93025', background: '#fce8e6', color: '#d93025', cursor: 'pointer' }}
                                                >
                                                    ❌ Rejeitar
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button 
                                                    onClick={() => handleEditClick(banner)}
                                                    style={{ marginRight: '0.5rem', padding: '0.5rem', borderRadius: '4px', border: '1px solid #0056b3', background: '#e6f0fa', color: '#0056b3', cursor: 'pointer' }}
                                                >
                                                    Editar
                                                </button>
                                                <button 
                                                    onClick={() => toggleBannerActive(banner._id, banner.isActive)}
                                                    style={{ marginRight: '0.5rem', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer' }}
                                                >
                                                    {banner.isActive ? 'Ocultar' : 'Exibir'}
                                                </button>
                                                <button 
                                                    onClick={() => handleDelete(banner._id)}
                                                    style={{ padding: '0.5rem', borderRadius: '4px', border: 'none', background: '#d93025', color: '#fff', cursor: 'pointer' }}
                                                >
                                                    Deletar
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
}
