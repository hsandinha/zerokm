'use client';

import React, { useState, useEffect } from 'react';
import { Images, Plus } from 'lucide-react';
import { BannerPaymentModal } from './BannerPaymentModal';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import {
    Button, EmptyState, Page, PageHeader, Panel, PanelFooter, PrimaryCell, SkeletonRows, StatusBadge, pageStyles, type BadgeTone,
} from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';

interface Banner {
    _id: string;
    title: string;
    imageUrl: string;
    linkUrl: string;
    isActive: boolean;
    status: string;
    expiresAt: string;
}

const SITUACAO: Record<string, { label: string; tone: BadgeTone }> = {
    active: { label: 'No ar', tone: 'positive' },
    pending: { label: 'Em aprovação', tone: 'warning' },
    awaiting_payment: { label: 'Aguardando pagamento', tone: 'warning' },
    rejected: { label: 'Recusado', tone: 'negative' },
    expired: { label: 'Expirado', tone: 'neutral' },
};

export function MeusAnuncios() {
    const [banners, setBanners] = useState<Banner[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const { notify, feedback } = useFeedback();

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
        if (!banner.expiresAt) return <span className={pageStyles.muted}>Após a aprovação</span>;

        const remainingMs = new Date(banner.expiresAt).getTime() - now;

        if (banner.status === 'active' && remainingMs > 0) {
            const hours = Math.floor(remainingMs / (60 * 60 * 1000));
            const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));
            const tempo = hours >= 48 ? `${Math.floor(hours / 24)} dias` : `${hours}h ${minutes}min`;
            return <span className={`${pageStyles.nowrap} ${hours < 3 ? pageStyles.textNegative : ''}`}>Sai do ar em {tempo}</span>;
        }

        if (banner.status === 'active' || banner.status === 'expired') {
            return <span className={`${pageStyles.nowrap} ${pageStyles.textNegative}`}>Venceu em {new Date(banner.expiresAt).toLocaleDateString('pt-BR')}</span>;
        }

        return <span className={pageStyles.nowrap}>{new Date(banner.expiresAt).toLocaleDateString('pt-BR')}</span>;
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
            setFormError('Apenas arquivos de imagem (JPEG, PNG, etc) são permitidos.');
            return;
        }

        if (file.size > 2 * 1024 * 1024) { // 2MB limit
            setFormError('A imagem deve ter no máximo 2MB.');
            return;
        }

        setFormError(null);

        const reader = new FileReader();
        reader.onloadend = () => {
            setNewBanner(prev => ({ ...prev, imageBase64: reader.result as string }));
        };
        reader.readAsDataURL(file);
    };

    const handleCreateBanner = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newBanner.title || !newBanner.imageBase64) {
            setFormError('Título e imagem são obrigatórios.');
            return;
        }

        setFormError(null);
        // Um modal por vez: o cadastro fecha (mantendo os dados) e abre o pagamento.
        setIsCreating(false);
        setShowModal(true);
    };

    const openCreate = () => {
        setNewBanner({ title: '', linkUrl: '', imageBase64: '' });
        setFormError(null);
        setIsCreating(true);
    };

    const closeCreate = () => {
        setIsCreating(false);
        setNewBanner({ title: '', linkUrl: '', imageBase64: '' });
        setFormError(null);
    };

    // Fechar o pagamento sem concluir volta ao cadastro com os dados preenchidos.
    const handlePaymentClose = () => {
        setShowModal(false);
        setIsCreating(true);
    };

    const handleSuccess = () => {
        setShowModal(false);
        setIsCreating(false);
        setNewBanner({ title: '', linkUrl: '', imageBase64: '' });
        setFormError(null);
        carregarBanners();
        notify('Pagamento recebido. A equipe vai analisar o anúncio antes de colocá-lo no ar.', 'positive');
    };

    const preco = (bannerConfig.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    return (
        <Page>
            <PageHeader
                title="Meus anúncios"
                count={isLoading ? null : banners.length}
                description={<>Seu banner aparece no topo da consulta dos clientes. Cada anúncio custa <strong>{preco}</strong> e fica no ar por <strong>{bannerConfig.duration_days} dias</strong> depois de aprovado.</>}
                actions={<Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={openCreate}>Novo anúncio</Button>}
            />

            <Panel>
                <div className={pageStyles.tableWrap}>
                    <table className={pageStyles.table}>
                        <thead>
                            <tr>
                                <th>Anúncio</th>
                                <th>Situação</th>
                                <th>Vencimento</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading && <SkeletonRows rows={3} columns={3} />}
                            {!isLoading && banners.map(banner => {
                                const situacao = SITUACAO[banner.status] ?? { label: banner.status, tone: 'neutral' as BadgeTone };
                                return (
                                    <tr key={banner._id}>
                                        <td className={pageStyles.colMain}>
                                            <PrimaryCell
                                                leading={<img src={banner.imageUrl} alt="" className={pageStyles.thumbWide} />}
                                                title={banner.title}
                                                subtitle={banner.linkUrl ? (banner.linkUrl.includes('wa.me') ? 'Leva ao WhatsApp da loja' : 'Com link') : 'Sem link'}
                                            />
                                        </td>
                                        <td><StatusBadge tone={situacao.tone}>{situacao.label}</StatusBadge></td>
                                        <td>{renderVencimento(banner)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {!isLoading && banners.length === 0 && (
                    <EmptyState
                        icon={<Images size={20} />}
                        title="Nenhum anúncio ainda"
                        description="Destaque um veículo para todos os clientes da plataforma. O anúncio entra no ar depois do pagamento e da aprovação da equipe."
                        action={<Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={openCreate}>Novo anúncio</Button>}
                    />
                )}

                {!isLoading && banners.length > 0 && (
                    <PanelFooter>
                        Mostrando <strong>{banners.length}</strong> {banners.length === 1 ? 'anúncio' : 'anúncios'}
                    </PanelFooter>
                )}
            </Panel>

            {isCreating && (
                <AdminModal
                    title="Novo anúncio"
                    subtitle={<>{preco} por {bannerConfig.duration_days} dias. O pagamento é feito na próxima etapa.</>}
                    onClose={closeCreate}
                    size="md"
                    onSubmit={handleCreateBanner}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={closeCreate}>Cancelar</button>
                        <button type="submit" className={modalStyles.primary}>Continuar para o pagamento</button>
                    </>}
                >
                    <div className={modalStyles.grid2}>
                        <label className={modalStyles.field}>
                            Título do anúncio
                            <input
                                type="text"
                                placeholder="Ex.: Creta 2024 com taxa zero"
                                value={newBanner.title}
                                onChange={e => setNewBanner({ ...newBanner, title: e.target.value })}
                            />
                        </label>
                        <label className={modalStyles.field}>
                            Link do veículo (opcional)
                            <input
                                type="url"
                                placeholder="https://wa.me/..."
                                value={newBanner.linkUrl}
                                onChange={e => setNewBanner({ ...newBanner, linkUrl: e.target.value })}
                            />
                        </label>
                        <label className={`${modalStyles.field} ${modalStyles.span2}`}>
                            Imagem do banner
                            <input type="file" accept="image/*" onChange={handleImageUpload} />
                            <span className={modalStyles.hint}>Recomendado 1200 x 300 px, até 2 MB.</span>
                        </label>
                        {newBanner.imageBase64 && (
                            <div className={modalStyles.span2}>
                                <img src={newBanner.imageBase64} alt="Prévia do banner" className={pageStyles.bannerPreview} />
                            </div>
                        )}
                        {formError && <div className={modalStyles.span2}><InlineNotice>{formError}</InlineNotice></div>}
                    </div>
                </AdminModal>
            )}

            {showModal && (
                <BannerPaymentModal
                    bannerData={{
                        title: newBanner.title,
                        imageUrl: newBanner.imageBase64,
                        linkUrl: newBanner.linkUrl,
                        amount: bannerConfig.price_cents / 100
                    }}
                    onClose={handlePaymentClose}
                    onSuccess={handleSuccess}
                />
            )}
            {feedback}
        </Page>
    );
}
