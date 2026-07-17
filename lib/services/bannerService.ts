import Banner from '@/models/Banner';

export const BANNER_DURATION_MS = 24 * 60 * 60 * 1000;

/**
 * Inativa automaticamente banners cujo prazo (expiresAt) já venceu.
 * Chamado nas rotas de listagem para garantir que banner vencido nunca fique visível.
 */
export async function deactivateExpiredBanners() {
    await Banner.updateMany(
        { isActive: true, expiresAt: { $lte: new Date() } },
        { $set: { isActive: false, status: 'expired' } }
    );
}
