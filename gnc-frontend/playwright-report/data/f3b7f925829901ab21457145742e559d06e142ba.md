# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: rbac.spec.ts >> RBAC guards — ARM button >> ARM button is enabled for admin role
- Location: tests\playwright\rbac.spec.ts:30:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for getByLabel(/Operator ID/i)

```

# Page snapshot

```yaml
- generic [ref=e6]:
  - generic [ref=e7]:
    - generic [ref=e8]:
      - generic [ref=e9]:
        - img [ref=e10]
        - generic [ref=e12]: GNC Platform
      - heading "Secure Gateway" [level=1] [ref=e13]
      - paragraph [ref=e14]: Unified, rocket-agnostic, multi-stage Guidance, Navigation and Control system. Authenticate via local Identity Provider to access ground operations.
    - generic [ref=e15]:
      - generic [ref=e18]: mTLS Connection Verified
      - generic [ref=e21]: Keycloak Active (Local)
  - generic [ref=e22]:
    - heading "Operator Login" [level=2] [ref=e23]
    - generic [ref=e24]:
      - generic [ref=e25]:
        - generic [ref=e26]: Operator ID
        - generic [ref=e27]:
          - generic:
            - img
          - textbox "e.g. alice_eng" [ref=e28]
      - generic [ref=e29]:
        - generic [ref=e30]: Password / Token
        - generic [ref=e31]:
          - generic:
            - img
          - textbox "••••••••" [ref=e32]
      - generic [ref=e34]:
        - checkbox "Require physical key on launch" [ref=e35]
        - generic [ref=e36]:
          - img [ref=e37]
          - text: Require physical key on launch
      - button "Authenticate" [ref=e40]:
        - text: Authenticate
        - img [ref=e41]
    - generic [ref=e43]:
      - generic [ref=e44]: "Roles: Viewer, Engineer, Operator, Admin"
      - link "Request Access" [ref=e45] [cursor=pointer]:
        - /url: "#"
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | async function loginAs(page: import('@playwright/test').Page, username: string) {
  4  |   await page.goto('/');
> 5  |   await page.getByLabel(/Operator ID/i).fill(username);
     |                                         ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  6  |   await page.getByLabel(/Password/i).fill('password');
  7  |   await page.getByRole('button', { name: /Authenticate/i }).click();
  8  |   await page.waitForURL('**/dashboard', { timeout: 5000 });
  9  | }
  10 | 
  11 | test.describe('RBAC guards — ARM button', () => {
  12 |   test('ARM button is disabled for engineer role', async ({ page }) => {
  13 |     await loginAs(page, 'alice_engineer');
  14 |     await page.goto('/launch');
  15 |     await expect(page.getByRole('button', { name: /Confirm ARM/i })).toBeDisabled();
  16 |   });
  17 | 
  18 |   test('ARM button is disabled for viewer role', async ({ page }) => {
  19 |     await loginAs(page, 'viewer_user');
  20 |     await page.goto('/launch');
  21 |     await expect(page.getByRole('button', { name: /Confirm ARM/i })).toBeDisabled();
  22 |   });
  23 | 
  24 |   test('ARM button is enabled for operator role', async ({ page }) => {
  25 |     await loginAs(page, 'bob_operator');
  26 |     await page.goto('/launch');
  27 |     await expect(page.getByRole('button', { name: /Confirm ARM/i })).toBeEnabled();
  28 |   });
  29 | 
  30 |   test('ARM button is enabled for admin role', async ({ page }) => {
  31 |     await loginAs(page, 'super_admin');
  32 |     await page.goto('/launch');
  33 |     await expect(page.getByRole('button', { name: /Confirm ARM/i })).toBeEnabled();
  34 |   });
  35 | });
  36 | 
```