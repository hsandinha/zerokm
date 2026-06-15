import { test, expect } from '@playwright/test';

/**
 * E2E — Responsividade Mobile
 * 
 * Valida que a Landing Page se adapta corretamente 
 * em viewports mobile (iPhone 13 via projeto "Mobile Safari").
 */

test.describe('Responsividade Mobile', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
    });

    test('deve exibir logo na versão mobile', async ({ page }) => {
        const logo = page.locator('nav img[alt*="CNV"]');
        await expect(logo).toBeVisible();
    });

    test('botão "Começar grátis" deve estar visível no mobile', async ({ page }) => {
        const cta = page.getByRole('button', { name: /começar grátis/i });
        await expect(cta.first()).toBeVisible();
    });

    test('botão WhatsApp flutuante deve estar visível no mobile', async ({ page }) => {
        const whatsappBtn = page.locator('a[aria-label="Atendimento via WhatsApp"]');
        await expect(whatsappBtn).toBeVisible();
    });

    test('footer deve renderizar no mobile', async ({ page }) => {
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);
        const footer = page.locator('footer');
        await expect(footer).toBeVisible();
    });

    test('seção hero deve estar visível no mobile', async ({ page }) => {
        const heroText = page.locator('h1').first();
        await expect(heroText).toBeVisible();
    });
});
