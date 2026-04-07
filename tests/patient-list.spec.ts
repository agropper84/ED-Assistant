import { test, expect } from './fixtures/auth';
import { setupMocks, MOCK_PATIENTS } from './fixtures/mocks';

test.describe('Patient List', () => {
  test.beforeEach(async ({ authedPage }) => {
    await setupMocks(authedPage);
  });

  test('renders patient cards on dashboard', async ({ authedPage }) => {
    await authedPage.goto('/');
    // Wait for patient cards to render (mock data has 2 patients)
    await authedPage.waitForSelector('[data-testid="patient-card"], .patient-card, [class*="patient"]', { timeout: 10000 }).catch(() => {});
    // Check that patient names appear on the page
    const content = await authedPage.textContent('body');
    expect(content).toContain('Test Patient');
    expect(content).toContain('Jane Smith');
  });

  test('shows patient status indicators', async ({ authedPage }) => {
    await authedPage.goto('/');
    await authedPage.waitForTimeout(2000);
    const content = await authedPage.textContent('body');
    // Second patient has processed output
    expect(content).toContain('Ankle sprain');
  });
});
