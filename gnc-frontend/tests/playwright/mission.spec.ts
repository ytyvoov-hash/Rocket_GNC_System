import { test, expect } from '@playwright/test';

test.describe('Mission lock / unlock', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/Operator ID/i).fill('super_admin');
    await page.getByLabel(/Password/i).fill('password');
    await page.getByRole('button', { name: /Authenticate/i }).click();
    await page.waitForURL('**/dashboard', { timeout: 5000 });
    await page.goto('/mission');
  });

  test('mission config page loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Mission Configuration/i })).toBeVisible();
  });

  test('Lock Mission button locks the form', async ({ page }) => {
    await page.getByRole('button', { name: /Lock Mission/i }).click();
    await expect(page.getByRole('button', { name: /Locked/i })).toBeVisible();
  });

  test('clicking Locked button unlocks the form', async ({ page }) => {
    await page.getByRole('button', { name: /Lock Mission/i }).click();
    await page.getByRole('button', { name: /Locked/i }).click();
    await expect(page.getByRole('button', { name: /Lock Mission/i })).toBeVisible();
  });
});
