import { test, expect } from '@playwright/test';

async function loginAs(page: import('@playwright/test').Page, username: string) {
  await page.goto('/');
  await page.getByLabel(/Operator ID/i).fill(username);
  await page.getByLabel(/Password/i).fill('password');
  await page.getByRole('button', { name: /Authenticate/i }).click();
  await page.waitForURL('**/dashboard', { timeout: 5000 });
}

test.describe('RBAC guards — ARM button', () => {
  test('ARM button is disabled for engineer role', async ({ page }) => {
    await loginAs(page, 'alice_engineer');
    await page.goto('/launch');
    await expect(page.getByRole('button', { name: /Confirm ARM/i })).toBeDisabled();
  });

  test('ARM button is disabled for viewer role', async ({ page }) => {
    await loginAs(page, 'viewer_user');
    await page.goto('/launch');
    await expect(page.getByRole('button', { name: /Confirm ARM/i })).toBeDisabled();
  });

  test('ARM button is enabled for operator role', async ({ page }) => {
    await loginAs(page, 'bob_operator');
    await page.goto('/launch');
    await expect(page.getByRole('button', { name: /Confirm ARM/i })).toBeEnabled();
  });

  test('ARM button is enabled for admin role', async ({ page }) => {
    await loginAs(page, 'super_admin');
    await page.goto('/launch');
    await expect(page.getByRole('button', { name: /Confirm ARM/i })).toBeEnabled();
  });
});
