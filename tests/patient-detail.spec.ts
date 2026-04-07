import { test, expect } from './fixtures/auth';
import { setupMocks, MOCK_PATIENTS } from './fixtures/mocks';

test.describe('Patient Detail Page', () => {
  test.beforeEach(async ({ authedPage }) => {
    await setupMocks(authedPage);
    // Mock the individual patient fetch
    await authedPage.route('**/api/patients/8*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ patient: MOCK_PATIENTS[0] }),
      });
    });
    await authedPage.route('**/api/patients/9*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ patient: MOCK_PATIENTS[1] }),
      });
    });
  });

  test('renders patient detail for processed patient', async ({ authedPage }) => {
    await authedPage.goto('/patient/9?sheet=Apr+05%2C+2026');
    await authedPage.waitForTimeout(2000);
    const content = await authedPage.textContent('body');
    expect(content).toContain('Jane Smith');
  });

  test('renders patient detail for pending patient', async ({ authedPage }) => {
    await authedPage.goto('/patient/8?sheet=Apr+05%2C+2026');
    await authedPage.waitForTimeout(2000);
    const content = await authedPage.textContent('body');
    expect(content).toContain('Test Patient');
  });
});
