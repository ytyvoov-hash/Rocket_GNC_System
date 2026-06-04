# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: mission.spec.ts >> Mission lock / unlock >> clicking Locked button unlocks the form
- Location: tests\playwright\mission.spec.ts:22:3

# Error details

```
Test timeout of 30000ms exceeded while running "beforeEach" hook.
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
  3  | test.describe('Mission lock / unlock', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     await page.goto('/');
> 6  |     await page.getByLabel(/Operator ID/i).fill('super_admin');
     |                                           ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  7  |     await page.getByLabel(/Password/i).fill('password');
  8  |     await page.getByRole('button', { name: /Authenticate/i }).click();
  9  |     await page.waitForURL('**/dashboard', { timeout: 5000 });
  10 |     await page.goto('/mission');
  11 |   });
  12 | 
  13 |   test('mission config page loads', async ({ page }) => {
  14 |     await expect(page.getByRole('heading', { name: /Mission Configuration/i })).toBeVisible();
  15 |   });
  16 | 
  17 |   test('Lock Mission button locks the form', async ({ page }) => {
  18 |     await page.getByRole('button', { name: /Lock Mission/i }).click();
  19 |     await expect(page.getByRole('button', { name: /Locked/i })).toBeVisible();
  20 |   });
  21 | 
  22 |   test('clicking Locked button unlocks the form', async ({ page }) => {
  23 |     await page.getByRole('button', { name: /Lock Mission/i }).click();
  24 |     await page.getByRole('button', { name: /Locked/i }).click();
  25 |     await expect(page.getByRole('button', { name: /Lock Mission/i })).toBeVisible();
  26 |   });
  27 | });
  28 | 
```