import { test, expect } from '@playwright/test';

test.describe('Login flow', () => {
  test('form login with engineer credentials navigates to /dashboard', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/Operator ID/i).fill('alice_engineer');
    await page.getByLabel(/Password/i).fill('password');
    await page.getByRole('button', { name: /Authenticate/i }).click();
    await page.waitForURL('**/dashboard', { timeout: 5000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('form login with admin credentials navigates to /dashboard', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/Operator ID/i).fill('super_admin');
    await page.getByLabel(/Password/i).fill('password');
    await page.getByRole('button', { name: /Authenticate/i }).click();
    await page.waitForURL('**/dashboard', { timeout: 5000 });
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('empty credentials keep user on login page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Authenticate/i }).click();
    await expect(page).toHaveURL('/');
  });

  test('sidebar is visible after login', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/Operator ID/i).fill('alice_engineer');
    await page.getByLabel(/Password/i).fill('password');
    await page.getByRole('button', { name: /Authenticate/i }).click();
    await page.waitForURL('**/dashboard', { timeout: 5000 });
    await expect(page.locator('aside')).toBeVisible();
  });
});
