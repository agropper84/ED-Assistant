/**
 * Auth fixture for Playwright tests.
 * Creates a valid iron-session cookie without going through OAuth.
 */

import { test as base, type Page } from '@playwright/test';
import { sealData } from 'iron-session';

const SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-must-be-at-least-32-characters-long';
const COOKIE_NAME = 'ed-assistant-session';

interface TestSessionData {
  userId: string;
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  approved: boolean;
}

const DEFAULT_SESSION: TestSessionData = {
  userId: 'test-user-123',
  email: 'test@example.com',
  name: 'Test Doctor',
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  tokenExpiry: Date.now() + 7 * 24 * 60 * 60 * 1000,
  approved: true,
};

/** Seal session data into an iron-session cookie value */
async function createSessionCookie(session: TestSessionData = DEFAULT_SESSION): Promise<string> {
  return sealData(session, { password: SESSION_SECRET });
}

/** Set the auth cookie on a page before navigating */
async function setAuthCookie(page: Page, session?: TestSessionData): Promise<void> {
  const sealed = await createSessionCookie(session);
  await page.context().addCookies([{
    name: COOKIE_NAME,
    value: sealed,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }]);
}

/**
 * Extended test fixture with authenticated page.
 * Usage: test('my test', async ({ authedPage }) => { ... })
 */
export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await setAuthCookie(page);
    await use(page);
  },
});

export { createSessionCookie, setAuthCookie, DEFAULT_SESSION };
export { expect } from '@playwright/test';
