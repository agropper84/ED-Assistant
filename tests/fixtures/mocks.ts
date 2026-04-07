/**
 * API mock fixtures for Playwright tests.
 * Intercepts API calls to avoid hitting real services.
 */

import type { Page } from '@playwright/test';

const MOCK_PATIENTS = [
  {
    rowIndex: 8, sheetName: 'Apr 05, 2026', patientNum: '1',
    timestamp: '14:30', name: 'Test Patient', age: '65', gender: 'M',
    birthday: '1961-01-15', hcn: '', mrn: '123456',
    diagnosis: 'Chest pain', icd9: '786.50', icd10: 'R07.9',
    visitProcedure: '', procCode: '', fee: '', unit: '', total: '',
    comments: '', triageVitals: 'BP 140/90, HR 88, T 36.8',
    transcript: 'Patient presents with substernal chest pain',
    additional: '', ddx: '', investigations: '', hpi: '', objective: '',
    assessmentPlan: '', referral: '', pastDocs: '', synopsis: '',
    management: '', evidence: '', apNotes: '', clinicalQA: '',
    education: '', encounterNotes: '', admission: '', profile: '',
    hasOutput: false, status: 'pending',
  },
  {
    rowIndex: 9, sheetName: 'Apr 05, 2026', patientNum: '2',
    timestamp: '15:00', name: 'Jane Smith', age: '42', gender: 'F',
    birthday: '1984-03-22', hcn: '', mrn: '789012',
    diagnosis: 'Ankle sprain', icd9: '845.00', icd10: 'S93.401A',
    visitProcedure: '', procCode: '', fee: '', unit: '', total: '',
    comments: '', triageVitals: 'BP 120/78, HR 72, T 36.5',
    transcript: '', additional: '',
    ddx: 'Ankle fracture, ligament tear', investigations: 'X-ray ankle',
    hpi: 'Patient twisted ankle while jogging.', objective: 'Swelling over lateral malleolus.',
    assessmentPlan: 'Ankle sprain. RICE protocol. Follow-up in 1 week.',
    referral: '', pastDocs: '', synopsis: '', management: '', evidence: '',
    apNotes: '', clinicalQA: '', education: '', encounterNotes: '',
    admission: '', profile: '',
    hasOutput: true, status: 'processed',
  },
];

const MOCK_AUTH = {
  email: 'test@example.com',
  name: 'Test Doctor',
  termsAccepted: true,
};

const MOCK_PROCESS_RESULT = {
  success: true,
  result: {
    ddx: '1. Acute coronary syndrome\n2. Musculoskeletal chest pain\n3. GERD',
    investigations: 'ECG, Troponin x2, CXR',
    management: 'ASA 325mg, IV access, serial ECGs',
    evidence: 'ACC/AHA Guidelines 2024',
    hpi: 'A 65-year-old male presents with substernal chest pain onset 2 hours ago.',
    objective: 'Alert, NAD. AVSS. Chest: clear bilaterally. CVS: S1S2, no murmurs.',
    assessmentPlan: 'Chest pain — likely musculoskeletal. ECG normal, troponin negative x2.',
    diagnosis: 'Non-cardiac chest pain',
    icd9: '786.59',
    icd10: 'R07.89',
  },
};

const MOCK_BILLING_CONFIG = {
  billingRegion: 'BC',
  vchCprpId: '',
  vchSiteFacility: '',
  vchPracNumber: '',
  vchPractitionerName: '',
};

/** Set up API mocks on a Playwright page */
export async function setupMocks(page: Page) {
  // Patient list
  await page.route('**/api/patients?sheet=*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ patients: MOCK_PATIENTS }),
    });
  });

  // Sheets list
  await page.route('**/api/patients?listSheets=1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ sheets: ['Apr 05, 2026', 'Apr 04, 2026', 'Apr 03, 2026'] }),
    });
  });

  // Auth me
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_AUTH),
    });
  });

  // Billing config
  await page.route('**/api/billing-config', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_BILLING_CONFIG),
    });
  });

  // Process encounter (AI generation mock)
  await page.route('**/api/process', async (route) => {
    // Simulate delay for realistic testing
    await new Promise(r => setTimeout(r, 500));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_PROCESS_RESULT),
    });
  });

  // Analysis mock
  await page.route('**/api/analysis', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, ddx: 'Mock DDx', investigations: 'Mock investigations' }),
    });
  });

  // Synopsis mock
  await page.route('**/api/synopsis', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ synopsis: 'Mock synopsis of the patient encounter.' }),
    });
  });

  // VCH billing
  await page.route('**/api/vch-billing-sheet', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ shifts: [] }),
    });
  });

  // Catch-all for other API routes — return empty success
  await page.route('**/api/**', async (route) => {
    if (!route.request().url().includes('/api/auth/') &&
        !route.request().url().includes('/api/patients') &&
        !route.request().url().includes('/api/process') &&
        !route.request().url().includes('/api/billing')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      });
    } else {
      await route.continue();
    }
  });
}

export { MOCK_PATIENTS, MOCK_AUTH, MOCK_PROCESS_RESULT };
