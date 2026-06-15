import { test, expect } from '@playwright/test';

/**
 * E2E — Página de Login
 * 
 * Valida que a interface de login renderiza corretamente
 * e que os elementos de formulário estão presentes.
 */

test.describe('Página de Login', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto('/login');
    });

    test('deve exibir o formulário de login', async ({ page }) => {
        // Deve ter campos de email e senha
        const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="mail"]');
        const passwordInput = page.locator('input[type="password"]');
        
        await expect(emailInput.first()).toBeVisible();
        await expect(passwordInput.first()).toBeVisible();
    });

    test('deve ter um botão de submit/entrar', async ({ page }) => {
        const submitBtn = page.locator('button[type="submit"], button:has-text("Entrar"), button:has-text("Login")');
        await expect(submitBtn.first()).toBeVisible();
    });

    test('deve exibir o logo da empresa', async ({ page }) => {
        const logo = page.locator('img[alt*="CNV"], img[alt*="logo"], img[src*="logo"]');
        await expect(logo.first()).toBeVisible();
    });

    test('botão de submit deve estar desabilitado com campos vazios', async ({ page }) => {
        const submitBtn = page.locator('button[type="submit"]');
        await expect(submitBtn.first()).toBeDisabled();
        
        // A página deve continuar em /login
        expect(page.url()).toContain('/login');
    });
});
