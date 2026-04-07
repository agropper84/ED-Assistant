import { test, expect } from '@playwright/test';
import { test as authedTest, expect as authedExpect } from './fixtures/auth';
import { setupMocks } from './fixtures/mocks';

test.describe('Authentication', () => {
  test('redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL('**/login');
    expect(page.url()).toContain('/login');
  });

  test('redirects unauthenticated API requests with 401', async ({ request }) => {
    const response = await request.get('/api/patients?sheet=test');
    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error).toBe('Not authenticated');
  });

  test('allows public paths without auth', async ({ page }) => {
    const response = await page.goto('/login');
    expect(response?.status()).toBe(200);
  });
});

authedTest.describe('Authenticated access', () => {
  authedTest('authenticated user sees dashboard', async ({ authedPage }) => {
    await setupMocks(authedPage);
    await authedPage.goto('/');
    // Should not redirect to login
    await authedPage.waitForTimeout(1000);
    expect(authedPage.url()).not.toContain('/login');
  });
});
