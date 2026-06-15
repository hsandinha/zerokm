import { test, expect } from '@playwright/test';

/**
 * E2E — Footer & WhatsApp Flutuante
 * 
 * Valida que os dados dinâmicos de contato estão visíveis
 * no rodapé e que o botão flutuante do WhatsApp funciona.
 */

test.describe('Footer — Contatos Dinâmicos', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        // Scroll até o footer
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);
    });

    test('deve exibir a seção "Contato" no footer', async ({ page }) => {
        const contatoTitle = page.locator('footer h4', { hasText: 'Contato' });
        await expect(contatoTitle).toBeVisible();
    });

    test('deve exibir um link de WhatsApp com número formatado', async ({ page }) => {
        const whatsappLink = page.locator('footer a[href*="wa.me"]');
        await expect(whatsappLink).toBeVisible();
        
        const href = await whatsappLink.getAttribute('href');
        expect(href).toMatch(/https:\/\/wa\.me\/\d+/);
    });

    test('deve exibir e-mail de contato no footer', async ({ page }) => {
        const emailLink = page.locator('footer a[href^="mailto:"]').first();
        await expect(emailLink).toBeVisible();
    });

    test('deve exibir CNPJ no footer', async ({ page }) => {
        const cnpj = page.locator('footer', { hasText: 'CNPJ:' });
        await expect(cnpj).toBeVisible();
    });

    test('deve exibir "Desenvolvido por Hebert Sandinha"', async ({ page }) => {
        const dev = page.locator('footer', { hasText: 'Hebert Sandinha' });
        await expect(dev).toBeVisible();
    });

    test('deve exibir links da plataforma (Criar conta, Entrar, Planos)', async ({ page }) => {
        const platformTitle = page.locator('footer h4', { hasText: 'Plataforma' });
        await expect(platformTitle).toBeVisible();
    });

    test('deve exibir links de suporte (FAQ, Suporte, Vendas)', async ({ page }) => {
        const supportTitle = page.locator('footer h4', { hasText: 'Suporte' });
        await expect(supportTitle).toBeVisible();
    });

    test('deve exibir copyright com ano atual', async ({ page }) => {
        const yearStr = new Date().getFullYear().toString();
        const copyright = page.locator('footer', { hasText: yearStr });
        await expect(copyright).toBeVisible();
    });
});

test.describe('Botão FlutGante do WhatsApp', () => {

    test('deve estar visível na Landing Page', async ({ page }) => {
        await page.goto('/');
        const whatsappBtn = page.locator('a[aria-label="Atendimento via WhatsApp"]');
        await expect(whatsappBtn).toBeVisible();
    });

    test('deve ter link correto para wa.me', async ({ page }) => {
        await page.goto('/');
        const whatsappBtn = page.locator('a[aria-label="Atendimento via WhatsApp"]');
        const href = await whatsappBtn.getAttribute('href');
        expect(href).toMatch(/^https:\/\/wa\.me\/\d+$/);
    });

    test('deve abrir em nova aba (target=_blank)', async ({ page }) => {
        await page.goto('/');
        const whatsappBtn = page.locator('a[aria-label="Atendimento via WhatsApp"]');
        await expect(whatsappBtn).toHaveAttribute('target', '_blank');
    });

    test('deve conter ícone SVG do WhatsApp', async ({ page }) => {
        await page.goto('/');
        const svg = page.locator('a[aria-label="Atendimento via WhatsApp"] svg');
        await expect(svg).toBeVisible();
    });
});
