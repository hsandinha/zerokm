'use client';

import React, { useState, useEffect } from 'react';
import { Check, Eye, EyeOff, Images, Pencil, Plus, Trash2 } from 'lucide-react';
import { AdminModal, modalStyles } from '@/components/admin/AdminModal';
import {
    Button, EmptyState, IconAction, Page, PageHeader, Pagination, Panel, PanelFooter, PanelToolbar, PrimaryCell, RowActions,
    Segmented, SkeletonRows, StatusBadge, TwoLine, pageStyles, type BadgeTone,
} from '@/components/ui/Page';
import { InlineNotice, useFeedback } from '@/components/ui/Feedback';

type FiltroBanner = 'all' | 'active' | 'inactive' | 'pending' | 'awaiting_payment' | 'expired';

interface Banner {
    _id: string;
    title: string;
    imageUrl: string;
    linkUrl: string;
    isActive: boolean;
    order: number;
    dealershipId?: string;
    vehicleId?: string;
    status: string;
    expiresAt?: string;
    createdAt: string;
}

export function BannersManagement() {
    const [banners, setBanners] = useState<Banner[]>([]);
    const [dealerships, setDealerships] = useState<any[]>([]);
    const [vehicles, setVehicles] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const { confirm, notify, feedback } = useFeedback();
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [statusFilter, setStatusFilter] = useState<FiltroBanner>('all');

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
        ctaText: '',
        vehicleId: ''
    });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formOpen, setFormOpen] = useState(false);
    const [, setTick] = useState(0);

    // Live countdown tick every second
    useEffect(() => {
        const interval = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, []);

    const getTimeRemaining = (expiresAt?: string) => {
        if (!expiresAt) return null;
        const diff = new Date(expiresAt).getTime() - Date.now();
        if (diff <= 0) return { text: 'Expirado', expired: true };
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        return { text: `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`, expired: false };
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setNewBanner({ 
            title: '', linkUrl: '', imageBase64: '', 
            badge: '', price: '', priceSubtitle: '', vehicleModel: '', storeName: '', 
            year: '', color: '', fuel: '', delivery: '', statusCondition: '', ctaText: '', vehicleId: '' 
        });
    };

    const openNewBanner = () => {
        handleCancelEdit();
        setFormError(null);
        setFormOpen(true);
    };

    const closeForm = () => {
        if (isSaving) return;
        handleCancelEdit();
        setFormError(null);
        setFormOpen(false);
    };

    useEffect(() => {
        carregarBanners();
        carregarConcessionarias();
        carregarVeiculos();
    }, []);

    const carregarBanners = async (page = 1, status: FiltroBanner = statusFilter) => {
        try {
            setIsLoading(true);
            const res = await fetch(`/api/admin/banners?page=${page}&limit=10&status=${status}`);
            if (res.ok) {
                const data = await res.json();
                // Verifica se é a resposta paginada ou o formato antigo
                if (data.banners) {
                    setBanners(data.banners);
                    setCurrentPage(data.currentPage || 1);
                    setTotalPages(data.totalPages || 1);
                } else {
                    setBanners(Array.isArray(data) ? data : []);
                }
            } else {
                const errorBody = await res.text();
                console.error('[BannersManagement] Erro na resposta:', res.status, errorBody);
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

    const carregarVeiculos = async () => {
        try {
            const res = await fetch('/api/vehicles?limit=1000');
            if (res.ok) {
                const json = await res.json();
                setVehicles(json.data || []);
            }
        } catch (error) {
            console.error('Erro ao buscar veículos', error);
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setFormError('Envie um arquivo de imagem (JPEG, PNG ou WebP).');
            return;
        }

        if (file.size > 2 * 1024 * 1024) { // 2MB limit
            setFormError('A imagem passa de 2 MB. Reduza o tamanho e envie de novo.');
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
            setFormError('Informe o título e envie a imagem do banner.');
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
                    ctaText: newBanner.ctaText,
                    vehicleId: newBanner.vehicleId || null
                })
            });

            if (res.ok) {
                notify(editingId ? 'Banner atualizado.' : 'Banner criado.', 'positive');
                handleCancelEdit();
                setFormOpen(false);
                carregarBanners(currentPage, statusFilter);
            } else {
                setFormError('Não foi possível salvar o banner. Tente de novo.');
            }
        } catch (error) {
            setFormError('Falha de conexão ao salvar o banner.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleVehicleSelect = (vehicleId: string) => {
        const veiculo = vehicles.find(v => v.id === vehicleId || v._id === vehicleId);
        if (!veiculo) return;

        let formattedPrice = '';
        if (veiculo.preco) {
            formattedPrice = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(veiculo.preco);
        }

        let newImageBase64 = newBanner.imageBase64;
        if (veiculo.fotos && veiculo.fotos.length > 0) {
            newImageBase64 = veiculo.fotos[0];
        }

        setNewBanner(prev => ({
            ...prev,
            vehicleModel: veiculo.modelo || '',
            price: formattedPrice,
            year: veiculo.ano || '',
            color: veiculo.cor || '',
            fuel: veiculo.combustivel || '',
            delivery: veiculo.frete ? String(veiculo.frete) : '',
            statusCondition: veiculo.status || '',
            storeName: veiculo.concessionaria || prev.storeName,
            vehicleId: vehicleId,
            imageBase64: newImageBase64
        }));
    };

    const toggleBannerActive = async (id: string, currentStatus: boolean) => {
        try {
            const res = await fetch(`/api/admin/banners/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: !currentStatus })
            });

            if (res.ok) {
                notify(currentStatus ? 'Banner fora do ar.' : 'Banner no ar.', 'positive');
                carregarBanners(currentPage, statusFilter);
            } else {
                notify('Não foi possível alterar o banner.');
            }
        } catch (error) {
            console.error('Erro ao atualizar status', error);
            notify('Falha de conexão ao alterar o banner.');
        }
    };

    const handleApprove = async (id: string) => {
        const ok = await confirm({ title: 'Aprovar anúncio', description: 'O anúncio entra no ar na hora e aparece para todos os clientes.', confirmLabel: 'Aprovar e publicar' });
        if (!ok) return;
        try {
            const res = await fetch(`/api/admin/banners/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: true, status: 'active' })
            });

            if (res.ok) {
                carregarBanners(currentPage, statusFilter);
                notify('Anúncio aprovado e publicado.', 'positive');
            } else {
                notify('Não foi possível aprovar o anúncio.');
            }
        } catch (error) {
            console.error('Erro ao aprovar', error);
            notify('Falha de conexão ao aprovar o anúncio.');
        }
    };

    const handleReject = async (id: string) => {
        const ok = await confirm({ title: 'Rejeitar anúncio', description: 'O anúncio não vai ao ar. A concessionária vê a recusa no painel dela.', confirmLabel: 'Rejeitar anúncio', danger: true });
        if (!ok) return;
        try {
            const res = await fetch(`/api/admin/banners/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isActive: false, status: 'rejected' })
            });

            if (res.ok) {
                carregarBanners(currentPage, statusFilter);
                notify('Anúncio rejeitado.', 'positive');
            } else {
                notify('Não foi possível rejeitar o anúncio.');
            }
        } catch (error) {
            console.error('Erro ao rejeitar', error);
            notify('Falha de conexão ao rejeitar o anúncio.');
        }
    };

    const handleDelete = async (banner: Banner) => {
        const ok = await confirm({ title: 'Excluir banner', description: <>O banner <strong>{banner.title}</strong> sai do carrossel e não dá para recuperar.</>, confirmLabel: 'Excluir banner', danger: true });
        if (!ok) return;
        try {
            const res = await fetch(`/api/admin/banners/${banner._id}`, { method: 'DELETE' });
            if (res.ok) {
                carregarBanners(currentPage, statusFilter);
                notify('Banner excluído.', 'positive');
            } else {
                notify('Não foi possível excluir o banner.');
            }
        } catch (error) {
            console.error('Erro ao excluir', error);
            notify('Falha de conexão ao excluir o banner.');
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
            ctaText: banner.ctaText || '',
            vehicleId: banner.vehicleId || ''
        });
        setFormError(null);
        setFormOpen(true);
    };

    const statusDe = (banner: Banner): { label: string; tone: BadgeTone } => {
        if (banner.status === 'pending') return { label: 'Aguardando aprovação', tone: 'warning' };
        if (banner.status === 'awaiting_payment') return { label: 'Aguardando pagamento', tone: 'warning' };
        if (banner.status === 'rejected') return { label: 'Rejeitado', tone: 'negative' };
        if (banner.status === 'expired') return { label: 'Expirado', tone: 'neutral' };
        return banner.isActive ? { label: 'No ar', tone: 'positive' } : { label: 'Oculto', tone: 'neutral' };
    };

    const campoTexto = (label: string, chave: keyof typeof newBanner, placeholder: string) => (
        <label className={modalStyles.field}>
            {label}
            <input type="text" placeholder={placeholder} value={newBanner[chave]} onChange={e => setNewBanner({ ...newBanner, [chave]: e.target.value })} />
        </label>
    );

    const campoMoeda = (label: string, chave: 'price' | 'priceSubtitle', placeholder: string) => (
        <label className={modalStyles.field}>
            {label}
            <input
                type="text"
                inputMode="numeric"
                placeholder={placeholder}
                value={newBanner[chave]}
                onChange={(e) => {
                    const digitos = e.target.value.replace(/\D/g, '');
                    if (!digitos) { setNewBanner({ ...newBanner, [chave]: '' }); return; }
                    const valor = (parseInt(digitos, 10) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                    setNewBanner({ ...newBanner, [chave]: valor });
                }}
            />
        </label>
    );

    const carregando = isLoading && banners.length === 0;
    const pendentes = banners.filter(b => b.status === 'pending').length;

    return (
        <Page>
            <PageHeader
                title="Banners"
                count={carregando ? null : banners.length}
                description="Carrossel rotativo no topo da consulta dos clientes. Anúncios pagos das concessionárias chegam aqui para aprovação."
                actions={<Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={openNewBanner}>Novo banner</Button>}
            />

            <Panel>
                <PanelToolbar>
                    <Segmented<FiltroBanner>
                        label="Filtrar banners"
                        value={statusFilter}
                        onChange={(valor) => { setStatusFilter(valor); carregarBanners(1, valor); }}
                        options={[
                            { value: 'all', label: 'Todos' },
                            { value: 'active', label: 'No ar' },
                            { value: 'pending', label: 'Aprovação', ...(statusFilter === 'all' && pendentes ? { count: pendentes } : {}) },
                            { value: 'awaiting_payment', label: 'Aguardando pagamento' },
                            { value: 'inactive', label: 'Ocultos' },
                            { value: 'expired', label: 'Expirados' },
                        ]}
                    />
                </PanelToolbar>

                <div className={pageStyles.tableWrap}>
                    <table className={pageStyles.table}>
                        <thead>
                            <tr>
                                <th>Banner</th>
                                <th>Situação</th>
                                <th>Destino</th>
                                <th className={pageStyles.shrink}><span className={pageStyles.srOnly}>Ações</span></th>
                            </tr>
                        </thead>
                        <tbody>
                            {carregando && <SkeletonRows rows={4} columns={4} />}
                            {!carregando && banners.map(banner => {
                                const situacao = statusDe(banner);
                                const restante = banner.expiresAt && banner.isActive && banner.status === 'active' ? getTimeRemaining(banner.expiresAt) : null;
                                return (
                                    <tr key={banner._id} data-inactive={!banner.isActive && banner.status !== 'pending'}>
                                        <td className={pageStyles.colMain}>
                                            <PrimaryCell
                                                leading={<img src={banner.imageUrl} alt="" className={pageStyles.thumbWide} />}
                                                title={banner.title}
                                                subtitle={`Criado em ${new Date(banner.createdAt).toLocaleDateString('pt-BR')}`}
                                            />
                                        </td>
                                        <td>
                                            <TwoLine
                                                top={<StatusBadge tone={situacao.tone}>{situacao.label}</StatusBadge>}
                                                bottom={restante ? <span className={pageStyles.nowrap}>{restante.expired ? 'Expirou' : `Sai do ar em ${restante.text}`}</span> : undefined}
                                            />
                                        </td>
                                        <td>
                                            {banner.linkUrl
                                                ? <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className={pageStyles.link}>{banner.linkUrl.includes('wa.me') ? 'WhatsApp da loja' : 'Abrir link'}</a>
                                                : <span className={pageStyles.muted}>Sem link</span>}
                                        </td>
                                        <td>
                                            <RowActions>
                                                {banner.status === 'pending' ? (
                                                    <>
                                                        <Button onClick={() => handleApprove(banner._id)} icon={<Check size={15} aria-hidden="true" />}>Aprovar</Button>
                                                        <Button variant="danger" onClick={() => handleReject(banner._id)}>Rejeitar</Button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <IconAction label="Editar banner" onClick={() => handleEditClick(banner)}>
                                                            <Pencil size={17} aria-hidden="true" />
                                                        </IconAction>
                                                        <IconAction label={banner.isActive ? 'Tirar do ar' : 'Colocar no ar'} onClick={() => toggleBannerActive(banner._id, banner.isActive)}>
                                                            {banner.isActive ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                                                        </IconAction>
                                                        <IconAction label="Excluir banner" tone="danger" onClick={() => handleDelete(banner)}>
                                                            <Trash2 size={17} aria-hidden="true" />
                                                        </IconAction>
                                                    </>
                                                )}
                                            </RowActions>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {!carregando && banners.length === 0 && (
                    <EmptyState
                        icon={<Images size={20} />}
                        title={statusFilter === 'all' ? 'Nenhum banner cadastrado' : 'Nenhum banner nesta situação'}
                        description={statusFilter === 'all' ? 'Crie um banner para destacar uma oferta no topo da consulta dos clientes.' : 'Escolha outro filtro para ver os demais banners.'}
                        action={statusFilter === 'all' ? <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={openNewBanner}>Novo banner</Button> : undefined}
                    />
                )}

                {!carregando && banners.length > 0 && (
                    <PanelFooter aside={<Pagination page={currentPage} totalPages={totalPages} onChange={(p) => carregarBanners(p, statusFilter)} />}>
                        Mostrando <strong>{banners.length}</strong> {banners.length === 1 ? 'banner' : 'banners'}{totalPages > 1 ? ' nesta página' : ''}
                    </PanelFooter>
                )}
            </Panel>

            {formOpen && (
                <AdminModal
                    size="lg"
                    title={editingId ? 'Editar banner' : 'Novo banner'}
                    subtitle="Aparece no carrossel rotativo da tela principal dos clientes."
                    onClose={closeForm}
                    busy={isSaving}
                    onSubmit={handleCreateBanner}
                    footer={<>
                        <button type="button" className={modalStyles.secondary} onClick={closeForm} disabled={isSaving}>Cancelar</button>
                        <button type="submit" className={modalStyles.primary} disabled={isSaving}>
                            {isSaving ? 'Salvando...' : (editingId ? 'Salvar alterações' : 'Adicionar banner')}
                        </button>
                    </>}
                >
                    <div className={modalStyles.stack}>
                        {formError && <InlineNotice>{formError}</InlineNotice>}

                        <label className={modalStyles.field}>
                            Título (uso interno)
                            <input type="text" required placeholder="Ex.: Oferta de lançamento" value={newBanner.title} onChange={e => setNewBanner({ ...newBanner, title: e.target.value })} />
                        </label>

                        <div className={modalStyles.row}>
                            <label className={modalStyles.field}>
                                Preencher a partir de um veículo
                                <select value={newBanner.vehicleId || ''} onChange={(e) => handleVehicleSelect(e.target.value)}>
                                    <option value="">Escolha um veículo</option>
                                    {vehicles.map(v => (
                                        <option key={v.id || v._id} value={v.id || v._id}>
                                            {v.modelo} · {v.ano} ({v.concessionaria || 'sem concessionária'})
                                        </option>
                                    ))}
                                </select>
                                <span className={modalStyles.hint}>Preenche modelo, preço, ano, cor, combustível, situação e a primeira foto. O banner sai junto se o veículo for excluído.</span>
                            </label>
                            <label className={modalStyles.field}>
                                Preencher a partir de uma concessionária
                                <select
                                    defaultValue=""
                                    onChange={(e) => {
                                        const d = dealerships.find(x => x.id === e.target.value);
                                        if (!d) return;
                                        const phone = (d.celular || d.telefone || d.telefoneResponsavel || '').replace(/\D/g, '');
                                        setNewBanner(prev => ({ ...prev, storeName: d.nome || '', linkUrl: phone ? `https://wa.me/55${phone}` : '' }));
                                    }}
                                >
                                    <option value="">Escolha uma concessionária</option>
                                    {dealerships.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                                </select>
                                <span className={modalStyles.hint}>Preenche o nome da loja e o link com o WhatsApp dela.</span>
                            </label>
                        </div>

                        <div className={modalStyles.row}>
                            {campoTexto('Nome da loja', 'storeName', 'Ex.: Primos Veículos')}
                            <label className={modalStyles.field}>
                                Link de destino (opcional)
                                <input type="url" placeholder="https://" value={newBanner.linkUrl} onChange={e => setNewBanner({ ...newBanner, linkUrl: e.target.value })} />
                            </label>
                        </div>

                        <div className={modalStyles.row}>
                            {campoTexto('Modelo', 'vehicleModel', 'Ex.: TIGGO 5X PRO MAX')}
                            {campoMoeda('Preço', 'price', 'R$ 142.000,00')}
                            {campoMoeda('Preço riscado', 'priceSubtitle', 'R$ 150.000,00')}
                        </div>

                        <div className={modalStyles.row}>
                            {campoTexto('Ano (fab/mod)', 'year', '26/27')}
                            {campoTexto('Cor', 'color', 'Preto')}
                            {campoTexto('Combustível', 'fuel', 'Flex')}
                        </div>

                        <div className={modalStyles.row}>
                            {campoTexto('Prazo de entrega', 'delivery', 'Pronta entrega')}
                            {campoTexto('Situação', 'statusCondition', 'ATPV-E')}
                            {campoTexto('Selo de destaque', 'badge', 'Oportunidade')}
                        </div>

                        <label className={modalStyles.field}>
                            Imagem do banner
                            <input type="file" accept="image/*" onChange={handleImageUpload} />
                            <span className={modalStyles.hint}>Recomendado 1200 × 300 px, até 2 MB.</span>
                        </label>
                        {newBanner.imageBase64 && <img src={newBanner.imageBase64} alt="Prévia do banner" className={pageStyles.bannerPreview} />}
                    </div>
                </AdminModal>
            )}
            {feedback}
        </Page>
    );
}
