export interface BillingCode {
  code: string;
  description: string;
  fee: string;
}

export type BillingCategory = 'visitType' | 'acuteCare' | 'premium' | 'additional';

export interface BillingItem {
  code: string;
  description: string;
  fee: string;
  unit: string;
  category: BillingCategory;
}

// --- Region infrastructure ---

export interface BillingRegion {
  id: string;
  label: string;
}

export const BILLING_REGIONS: BillingRegion[] = [
  { id: 'yukon', label: 'Yukon' },
  { id: 'vch', label: 'VCH - Time Based' },
];

/** Check if the current region uses time-based billing */
export function isTimeBased(region?: string): boolean {
  const r = region || getRegion();
  return r === 'vch';
}

/** VCH time-based billing categories */
export const VCH_CATEGORIES = [
  { code: 'VCH-DO', label: 'Direct Onsite', description: 'Face-to-face with patient' },
  { code: 'VCH-IO', label: 'Indirect Onsite', description: 'Charting, orders, chart review at facility' },
  { code: 'VCH-IF', label: 'Indirect Offsite', description: 'Phone calls, results review off-site' },
] as const;

export type BillingGroup =
  | 'ED Visits'
  | 'GP Visits'
  | 'Premiums'
  | 'Communication'
  | 'Procedures'
  | 'Casts & Splints'
  | 'Counselling'
  | 'Hospital'
  | 'Telehealth'
  | 'Other';

export const BILLING_GROUPS: BillingGroup[] = [
  'ED Visits',
  'GP Visits',
  'Premiums',
  'Communication',
  'Procedures',
  'Casts & Splints',
  'Counselling',
  'Hospital',
  'Telehealth',
  'Other',
];

export interface BillingCodeEntry {
  description: string;
  fee: string;
  group: BillingGroup;
}

// --- Yukon 2024 Fee Guide codes ---

const YUKON_CODES: Record<string, BillingCodeEntry> = {
  // ED Visits
  '1100': { description: 'ED Visit', fee: '50.90', group: 'ED Visits' },
  '1101': { description: 'Complete examination', fee: '111.50', group: 'ED Visits' },
  '0081': { description: 'Prolonged ED care (0800-2259)', fee: '147.10', group: 'ED Visits' },
  '0080': { description: 'Prolonged ED care (2300-0800)', fee: '230.60', group: 'ED Visits' },
  '0082': { description: 'Acute Care Detention', fee: '118.50', group: 'ED Visits' },
  '0116': { description: 'ICU Admission', fee: '193.40', group: 'ED Visits' },

  // GP Visits
  '0100': { description: 'Visit', fee: '56.10', group: 'GP Visits' },
  '0101': { description: 'Complete Exam', fee: '111.50', group: 'GP Visits' },
  '0102': { description: 'Post Cancer Surveillance', fee: '148.30', group: 'GP Visits' },
  '0107': { description: 'Limited GP Consult', fee: '129.50', group: 'GP Visits' },
  '0110': { description: 'Second extensive exam', fee: '129.50', group: 'GP Visits' },
  '1102': { description: 'Acute care admission', fee: '115.40', group: 'GP Visits' },

  // Premiums
  '0150': { description: 'Daytime premium', fee: '51.70', group: 'Premiums' },
  '0151': { description: 'Evening premium', fee: '152.80', group: 'Premiums' },
  '0152': { description: 'Night premium', fee: '177.00', group: 'Premiums' },
  '0153': { description: 'WL/DC Evening premium', fee: '24.50', group: 'Premiums' },
  '0154': { description: 'WL/DC Night premium', fee: '107.40', group: 'Premiums' },
  '1153': { description: 'WGH Evening/Weekend premium', fee: '24.50', group: 'Premiums' },
  '1154': { description: 'WGH Night premium', fee: '107.40', group: 'Premiums' },

  // Communication
  '0044': { description: 'GP Specialty Phone Advice', fee: '86.20', group: 'Communication' },
  '0048': { description: 'Prescription Renewal', fee: '7.20', group: 'Communication' },
  '0049': { description: 'Community Nurse Calls', fee: '43.20', group: 'Communication' },
  '0050': { description: 'Allied HCW Communication', fee: '42.30', group: 'Communication' },
  '14015': { description: 'Conference fee', fee: '57.50', group: 'Communication' },
  '14016': { description: 'Conference fee', fee: '57.50', group: 'Communication' },
  '14017': { description: 'Conference fee', fee: '57.50', group: 'Communication' },
  '14018': { description: 'Conference fee', fee: '57.50', group: 'Communication' },
  '14019': { description: 'Conference fee', fee: '57.50', group: 'Communication' },

  // Procedures
  '7020': { description: 'Biopsy', fee: '59.60', group: 'Procedures' },
  '7021': { description: 'Biopsy skin/mucosa', fee: '89.40', group: 'Procedures' },
  '7026': { description: 'Superficial abscess', fee: '50.00', group: 'Procedures' },
  '7027': { description: 'Deep abscess (GA)', fee: '148.60', group: 'Procedures' },
  '7029': { description: 'Complex abscess', fee: '115.10', group: 'Procedures' },
  '7030': { description: 'Minor lac / FB', fee: '99.20', group: 'Procedures' },
  '7032': { description: 'Extensive/complex laceration', fee: '213.10', group: 'Procedures' },
  '0215': { description: 'Dermatological biopsy', fee: '47.50', group: 'Procedures' },
  '0750': { description: 'Lumbar Puncture', fee: '59.60', group: 'Procedures' },
  '0751': { description: 'Thoracentesis', fee: '59.60', group: 'Procedures' },
  '0752': { description: 'Paracentesis', fee: '59.60', group: 'Procedures' },
  '0753': { description: 'Joint aspiration', fee: '59.60', group: 'Procedures' },
  '0754': { description: 'Puncture - other', fee: '59.60', group: 'Procedures' },
  '0755': { description: 'Puncture - other', fee: '59.60', group: 'Procedures' },
  '0756': { description: 'Puncture - other', fee: '59.60', group: 'Procedures' },
  '0757': { description: 'Puncture - other', fee: '59.60', group: 'Procedures' },
  '0758': { description: 'Puncture - other', fee: '59.60', group: 'Procedures' },
  '0759': { description: 'Puncture - other', fee: '59.60', group: 'Procedures' },
  '0760': { description: 'Puncture - other', fee: '59.60', group: 'Procedures' },
  '0761': { description: 'Puncture - other', fee: '59.60', group: 'Procedures' },

  // Casts & Splints
  '5580': { description: 'Finger/toe cast', fee: '29.70', group: 'Casts & Splints' },
  '5581': { description: 'Short arm / thumb spica', fee: '45.20', group: 'Casts & Splints' },
  '5582': { description: 'Long arm cast', fee: '59.10', group: 'Casts & Splints' },
  '5583': { description: 'Shoulder spica', fee: '148.60', group: 'Casts & Splints' },
  '5584': { description: 'Ankle cast', fee: '59.10', group: 'Casts & Splints' },
  '5585': { description: 'Knee cast', fee: '59.10', group: 'Casts & Splints' },
  '5586': { description: 'Walking cast', fee: '59.10', group: 'Casts & Splints' },
  '5587': { description: 'Hip spica', fee: '148.60', group: 'Casts & Splints' },
  '5588': { description: 'Body cast', fee: '148.60', group: 'Casts & Splints' },
  '5589': { description: 'Cast - other', fee: '59.10', group: 'Casts & Splints' },
  '5590': { description: 'Cast - other', fee: '59.10', group: 'Casts & Splints' },
  '5591': { description: 'Cast - other', fee: '59.10', group: 'Casts & Splints' },
  '5592': { description: 'Cast - other', fee: '59.10', group: 'Casts & Splints' },

  // Counselling
  '0109': { description: 'Psychiatric counselling', fee: '111.40', group: 'Counselling' },
  '0120': { description: 'Prolonged counselling', fee: '111.40', group: 'Counselling' },
  '0121': { description: 'Psych 16+ min', fee: '119.60', group: 'Counselling' },
  '0122': { description: 'Psych 31-45 min', fee: '143.40', group: 'Counselling' },
  '0123': { description: 'Psych 45+ min', fee: '191.20', group: 'Counselling' },
  '0083': { description: 'Crisis Intervention', fee: '107.30', group: 'Counselling' },

  // Hospital
  '0108': { description: 'Subsequent hospital visit', fee: '65.30', group: 'Hospital' },
  '0128': { description: 'Supportive care', fee: '60.90', group: 'Hospital' },
  '0138': { description: 'ICU visit', fee: '72.60', group: 'Hospital' },
  '0119': { description: 'Newborn care', fee: '93.00', group: 'Hospital' },
  '0103': { description: 'Home visit first', fee: '158.00', group: 'Hospital' },
  '0104': { description: 'Home visit extra', fee: '57.20', group: 'Hospital' },
  '0124': { description: 'Nurse-referred GP Consult', fee: '164.70', group: 'Hospital' },

  // Telehealth
  '26100': { description: 'Phone/video assessment (single dx)', fee: '56.00', group: 'Telehealth' },
  '26109': { description: 'Phone/video assessment (multiple dx)', fee: '64.60', group: 'Telehealth' },

  // Other
  '0089': { description: 'POCUS', fee: '31.10', group: 'Other' },
  '0117': { description: 'ECG', fee: '6.50', group: 'Other' },
  '0046': { description: 'Major tray', fee: '43.70', group: 'Other' },
  '0047': { description: 'Minor tray', fee: '14.70', group: 'Other' },
  '0113': { description: 'Professional conference', fee: '60.40', group: 'Other' },
  '0115': { description: 'Complex lab/x-ray review', fee: '49.60', group: 'Other' },
  '0084': { description: 'In-territory medevac', fee: '915.40', group: 'Other' },
  '0900': { description: 'WCB 1st report', fee: '', group: 'Other' },
  'M0915': { description: 'WCB FAF', fee: '', group: 'Other' },
};

// Region codes registry
const REGION_CODES: Record<string, Record<string, BillingCodeEntry>> = {
  yukon: YUKON_CODES,
};

// Category definitions for UI grouping (patient billing page)
export const BILLING_CATEGORIES: Record<BillingCategory, { label: string; codes: string[] }> = {
  visitType: { label: 'Visit Type', codes: ['1100', '1101'] },
  acuteCare: { label: 'Acute Care', codes: ['0080', '0081', '0082', '0083'] },
  premium: { label: 'Time Premium', codes: ['1153', '1154'] },
  additional: { label: 'Additional', codes: [] }, // everything else
};

// --- localStorage keys ---
const STORAGE_KEY = 'ed-app-billing-codes';
const REGION_KEY = 'ed-app-billing-region';
const DELETED_KEY = 'ed-app-billing-deleted';

// --- Region persistence ---

export function getRegion(): string {
  if (typeof window === 'undefined') return 'yukon';
  return localStorage.getItem(REGION_KEY) || 'yukon';
}

export function saveRegion(region: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(REGION_KEY, region);
}

// --- Deleted codes tracking ---

function getDeletedCodes(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(DELETED_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveDeletedCodes(codes: string[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(DELETED_KEY, JSON.stringify(codes));
}

export function deleteBillingCode(code: string): void {
  const deleted = getDeletedCodes();
  if (!deleted.includes(code)) {
    deleted.push(code);
    saveDeletedCodes(deleted);
  }
}

export function isCodeDeleted(code: string): boolean {
  return getDeletedCodes().includes(code);
}

export function resetDeletedCodes(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(DELETED_KEY);
}

// --- Custom codes (overrides) ---

function getCustomCodes(): Record<string, { description: string; fee: string }> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

function saveCustomCodes(codes: Record<string, { description: string; fee: string }>): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
}

// --- Helpers to get default codes for a region ---

function getDefaultCodesFlat(region?: string): Record<string, { description: string; fee: string }> {
  const r = region || getRegion();
  const regionCodes = REGION_CODES[r] || REGION_CODES['yukon'];
  const flat: Record<string, { description: string; fee: string }> = {};
  for (const [code, entry] of Object.entries(regionCodes)) {
    flat[code] = { description: entry.description, fee: entry.fee };
  }
  return flat;
}

/** Get default codes for a specific region (with group info) */
export function getDefaultCodesForRegion(region?: string): (BillingCode & { group: BillingGroup })[] {
  const r = region || getRegion();
  const regionCodes = REGION_CODES[r] || REGION_CODES['yukon'];
  return Object.entries(regionCodes).map(([code, entry]) => ({
    code,
    description: entry.description,
    fee: entry.fee,
    group: entry.group,
  }));
}

/** Get billing groups for a region */
export function getBillingGroups(region?: string): BillingGroup[] {
  const r = region || getRegion();
  const regionCodes = REGION_CODES[r] || REGION_CODES['yukon'];
  const groups = new Set<BillingGroup>();
  for (const entry of Object.values(regionCodes)) {
    groups.add(entry.group);
  }
  // Return in canonical order
  return BILLING_GROUPS.filter(g => groups.has(g));
}

// --- Public API (same shapes as before) ---

/** Get all billing codes (defaults + custom, minus deleted) */
export function getAllBillingCodes(): BillingCode[] {
  const defaults = getDefaultCodesFlat();
  const custom = getCustomCodes();
  const deleted = getDeletedCodes();
  const merged = { ...defaults, ...custom };

  return Object.entries(merged)
    .filter(([code]) => !deleted.includes(code))
    .map(([code, info]) => ({ code, ...info }))
    .sort((a, b) => a.description.localeCompare(b.description));
}

/** Look up fee by procedure code */
export function lookupFee(procCode: string): { description: string; fee: string } | null {
  const code = procCode.trim();
  const custom = getCustomCodes();
  if (custom[code]) return custom[code];
  const defaults = getDefaultCodesFlat();
  return defaults[code] || null;
}

/** Add or update a custom billing code */
export function addBillingCode(code: string, description: string, fee: string): void {
  const custom = getCustomCodes();
  custom[code.trim()] = { description: description.trim(), fee: fee.trim() };
  saveCustomCodes(custom);
}

/** Remove a custom billing code override */
export function removeBillingCode(code: string): void {
  const custom = getCustomCodes();
  delete custom[code.trim()];
  saveCustomCodes(custom);
}

/** Reset all custom overrides and deletions */
export function resetBillingCodes(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(DELETED_KEY);
}

/** Determine billing category for a given code */
export function getCategoryForCode(code: string): BillingCategory {
  if (BILLING_CATEGORIES.visitType.codes.includes(code)) return 'visitType';
  if (BILLING_CATEGORIES.acuteCare.codes.includes(code)) return 'acuteCare';
  if (BILLING_CATEGORIES.premium.codes.includes(code)) return 'premium';
  return 'additional';
}

/** Get auto-billing items based on encounter time */
export function getAutoBilling(timestamp: string, isWeekend: boolean): BillingItem[] {
  // Parse HH:MM from timestamp (e.g. "14:30" or "2:30 PM")
  let hour = -1;
  const match24 = timestamp.match(/(\d{1,2}):(\d{2})/);
  if (match24) {
    hour = parseInt(match24[1], 10);
    // Handle 12-hour format with AM/PM
    const isPM = /pm/i.test(timestamp);
    const isAM = /am/i.test(timestamp);
    if (isPM && hour < 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
  }

  const items: BillingItem[] = [];

  // Time premium
  if (hour >= 0) {
    if ((hour >= 18 && hour < 23) || isWeekend) {
      items.push({ code: '1153', description: 'WGH Evening/Weekend premium', fee: '24.50', unit: '1', category: 'premium' });
    } else if (hour >= 23 || hour < 8) {
      items.push({ code: '1154', description: 'WGH Night premium', fee: '107.40', unit: '1', category: 'premium' });
    }
  }

  return items;
}

/** Serialize billing items into newline-separated sheet columns */
export function serializeBillingItems(items: BillingItem[]): {
  visitProcedure: string;
  procCode: string;
  fee: string;
  unit: string;
  total: string;
} {
  const descriptions = items.map(i => i.description);
  const codes = items.map(i => i.code);
  const fees = items.map(i => i.fee);
  const units = items.map(i => i.unit || '1');

  const grandTotal = items.reduce((sum, i) => {
    const f = parseFloat(i.fee);
    const u = parseInt(i.unit || '1', 10) || 1;
    return sum + (isNaN(f) ? 0 : f * u);
  }, 0);

  return {
    visitProcedure: descriptions.join('\n'),
    procCode: codes.join('\n'),
    fee: fees.join('\n'),
    unit: units.join('\n'),
    total: grandTotal > 0 ? grandTotal.toFixed(2) : '',
  };
}

/** Parse newline-separated sheet columns back into BillingItem[] */
export function parseBillingItems(
  visitProcedure: string,
  procCode: string,
  fee: string,
  unit: string
): BillingItem[] {
  if (!procCode?.trim()) return [];

  const codes = procCode.split('\n').map(s => s.trim());
  const descriptions = (visitProcedure || '').split('\n').map(s => s.trim());
  const fees = (fee || '').split('\n').map(s => s.trim());
  const units = (unit || '').split('\n').map(s => s.trim());

  const defaults = getDefaultCodesFlat();

  return codes.map((code, i) => {
    const lookup = defaults[code];
    return {
      code,
      description: descriptions[i] || lookup?.description || code,
      fee: fees[i] || lookup?.fee || '',
      unit: units[i] || '1',
      category: getCategoryForCode(code),
    };
  }).filter(item => item.code);
}

/** Calculate grand total from billing items */
export function calculateTotal(items: BillingItem[]): string {
  const total = items.reduce((sum, i) => {
    const f = parseFloat(i.fee);
    const u = parseInt(i.unit || '1', 10) || 1;
    return sum + (isNaN(f) ? 0 : f * u);
  }, 0);
  return total > 0 ? total.toFixed(2) : '';
}

/** Get additional codes (everything not in visitType/acuteCare/premium) from local defaults */
export function getAdditionalCodes(): BillingCode[] {
  const categoryCodes = new Set([
    ...BILLING_CATEGORIES.visitType.codes,
    ...BILLING_CATEGORIES.acuteCare.codes,
    ...BILLING_CATEGORIES.premium.codes,
  ]);
  return getAllBillingCodes().filter(c => !categoryCodes.has(c.code));
}

/** Filter additional codes from a provided list (e.g. fetched from Google Sheet) */
export function filterAdditionalCodes(codes: BillingCode[]): BillingCode[] {
  const categoryCodes = new Set([
    ...BILLING_CATEGORIES.visitType.codes,
    ...BILLING_CATEGORIES.acuteCare.codes,
    ...BILLING_CATEGORIES.premium.codes,
  ]);
  return codes.filter(c => !categoryCodes.has(c.code));
}

// --- Async API-backed functions (Google Sheet as source of truth) ---

/** Fetch billing codes from API. Auto-populates sheet if empty. */
export async function fetchBillingCodes(region?: string): Promise<(BillingCode & { group: BillingGroup })[]> {
  const r = region || 'yukon';
  const res = await fetch(`/api/billing-codes?region=${encodeURIComponent(r)}`);
  if (res.status === 401) {
    window.location.href = '/login';
    return [];
  }
  if (!res.ok) throw new Error('Failed to fetch billing codes');
  return res.json();
}

/** Add a billing code via API */
export async function addBillingCodeAsync(
  code: string,
  description: string,
  fee: string,
  group: string
): Promise<void> {
  const res = await fetch('/api/billing-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, description, fee, group }),
  });
  if (res.status === 401) {
    window.location.href = '/login';
    return;
  }
  if (!res.ok) throw new Error('Failed to add billing code');
}

/** Update a billing code via API */
export async function updateBillingCodeAsync(
  code: string,
  description: string,
  fee: string,
  group: string
): Promise<void> {
  const res = await fetch('/api/billing-codes', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, description, fee, group }),
  });
  if (res.status === 401) {
    window.location.href = '/login';
    return;
  }
  if (!res.ok) throw new Error('Failed to update billing code');
}

/** Delete a billing code via API */
export async function deleteBillingCodeAsync(code: string): Promise<void> {
  const res = await fetch('/api/billing-codes', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (res.status === 401) {
    window.location.href = '/login';
    return;
  }
  if (!res.ok) throw new Error('Failed to delete billing code');
}

/** Reset all billing codes to defaults for region via API */
export async function resetBillingCodesAsync(region?: string): Promise<(BillingCode & { group: BillingGroup })[]> {
  const res = await fetch('/api/billing-codes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'reset', region: region || 'yukon' }),
  });
  if (res.status === 401) {
    window.location.href = '/login';
    return [];
  }
  if (!res.ok) throw new Error('Failed to reset billing codes');
  return res.json();
}

/** Clear all localStorage billing data (sheet is now source of truth) */
export function clearLocalBillingData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(DELETED_KEY);
}
