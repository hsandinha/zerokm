import { test, expect } from '@playwright/test';

/**
 * E2E — Landing Page (LP)
 * 
 * Simula um visitante real acessando a página principal da ZeroKM.
 * Valida que todas as seções críticas estão visíveis e funcionais.
 */

test.describe('Landing Page — Navegação e Conteúdo', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    // ═══════════════════════════════════════
    // VISIBILIDADE DAS SEÇÕES
    // ═══════════════════════════════════════

    test('deve exibir a barra de navegação com logo e links', async ({ page }) => {
        // Logo
        const logo = page.locator('nav img[alt*="CNV"]');
        await expect(logo).toBeVisible();

        // Links de navegação — no mobile ficam escondidos no menu hambúrguer
        const viewport = page.viewportSize();
        if (viewport && viewport.width >= 768) {
            const nav = page.locator('nav');
            await expect(nav.getByRole('link', { name: 'Recursos' })).toBeVisible();
            await expect(nav.getByRole('link', { name: 'Como funciona' })).toBeVisible();
            await expect(nav.getByRole('link', { name: 'Planos' })).toBeVisible();
            await expect(nav.getByRole('link', { name: 'FAQ' })).toBeVisible();
        }
    });

    test('deve exibir botões de CTA (Entrar e Começar grátis)', async ({ page }) => {
        const viewport = page.viewportSize();
        // No mobile, o link "Entrar" fica escondido no menu
        if (viewport && viewport.width >= 768) {
            const nav = page.locator('nav');
            await expect(nav.getByRole('link', { name: 'Entrar' })).toBeVisible();
        }
        const ctaButton = page.getByRole('button', { name: /começar grátis/i });
        await expect(ctaButton.first()).toBeVisible();
    });

    test('deve exibir o vídeo de fundo no hero', async ({ page }) => {
        const video = page.locator('video[src="/video.mp4"]');
        await expect(video).toBeAttached();
    });

    test('deve exibir a seção de recursos/features', async ({ page }) => {
        const featuresSection = page.locator('#recursos');
        await expect(featuresSection).toBeAttached();
    });

    test('deve exibir a seção de planos', async ({ page }) => {
        const plansSection = page.locator('#planos');
        await expect(plansSection).toBeAttached();
    });

    test('deve exibir a seção FAQ', async ({ page }) => {
        const faqSection = page.locator('#faq');
        await expect(faqSection).toBeAttached();
    });

    // ═══════════════════════════════════════
    // NAVEGAÇÃO INTERNA (ÂNCORAS)
    // ═══════════════════════════════════════

    test('link "Planos" deve rolar até a seção de planos', async ({ page }) => {
        await page.getByRole('link', { name: 'Planos' }).first().click();
        await page.waitForTimeout(500);
        const url = page.url();
        expect(url).toContain('#planos');
    });

    test('link "FAQ" deve rolar até a seção de FAQ', async ({ page }) => {
        await page.getByRole('link', { name: 'FAQ' }).first().click();
        await page.waitForTimeout(500);
        const url = page.url();
        expect(url).toContain('#faq');
    });

    // ═══════════════════════════════════════
    // LINK "ENTRAR" NAVEGA PARA /login
    // ═══════════════════════════════════════

    test('botão "Entrar" deve navegar para /login', async ({ page }) => {
        await page.getByRole('link', { name: 'Entrar' }).first().click();
        await page.waitForURL('**/login');
        expect(page.url()).toContain('/login');
    });
});
