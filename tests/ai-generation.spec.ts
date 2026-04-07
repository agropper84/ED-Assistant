import { test, expect } from './fixtures/auth';
import { setupMocks } from './fixtures/mocks';

test.describe('AI Generation', () => {
  test.beforeEach(async ({ authedPage }) => {
    await setupMocks(authedPage);
  });

  test('process endpoint returns mock AI result', async ({ authedPage }) => {
    // Test the API directly through a page context fetch
    const response = await authedPage.request.post('/api/process', {
      data: {
        rowIndex: 8,
        sheetName: 'Apr 05, 2026',
      },
    });
    // The route mock intercepts this
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.result.hpi).toContain('65-year-old male');
  });

  test('analysis endpoint returns mock result', async ({ authedPage }) => {
    const response = await authedPage.request.post('/api/analysis', {
      data: {
        rowIndex: 8,
        sheetName: 'Apr 05, 2026',
      },
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});
