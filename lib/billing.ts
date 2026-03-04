export interface BillingCode {
  code: string;
  description: string;
  fee: string;
}

export type BillingCategory = 'base' | 'visitType' | 'premium' | 'additional';

export interface BillingItem {
  code: string;
  description: string;
  fee: string;
  category: BillingCategory;
}

// Category definitions for UI grouping
export const BILLING_CATEGORIES: Record<BillingCategory, { label: string; codes: string[] }> = {
  base: { label: 'Base Fee', codes: ['0145', '0146'] },
  visitType: { label: 'Visit Type', codes: ['1100', '1101', '0081'] },
  premium: { label: 'Time Premium', codes: ['1153', '1154'] },
  additional: { label: 'Additional', codes: [] }, // everything else
};

// Default billing codes
const DEFAULT_CODES: Record<string, { description: string; fee: string }> = {
  '1101': { description: 'Complete examination', fee: '111.50' },
  '0081': { description: 'Critical Care', fee: '147.10' },
  '0117': { description: 'ECG', fee: '6.50' },
  '1100': { description: 'ED Visit', fee: '50.90' },
  '1153': { description: 'Evening/Weekend premium', fee: '50.00' },
  '0044': { description: 'GP Urgent Telephone Conference with Specialist', fee: '57.50' },
  '0116': { description: 'ICU Admission', fee: '193.40' },
  '7030': { description: 'Laceration repair / Minor lac / FB', fee: '99.20' },
  '1154': { description: 'Night (2300-0759) premium', fee: '107.40' },
  '7026': { description: 'Opening superficial abscess', fee: '50.00' },
  '0083': { description: 'Personal or Family Crisis Intervention', fee: '107.30' },
  '14015': { description: 'Phone call f/u', fee: '57.50' },
  '0089': { description: 'POCUS', fee: '31.10' },
  '0049': { description: 'Telephone calls initiated by Community Nurse', fee: '43.20' },
  '5581': { description: 'Thumb spica cast', fee: '45.20' },
  '0900': { description: 'WCB 1st report / 1st visit', fee: '' },
  'M0915': { description: 'WCB FAF', fee: '' },
  '0146': { description: 'Base Fee 2300-0800', fee: '119.60' },
  '0145': { description: 'Base Fee 0800-2300', fee: '81.80' },
  '750': { description: 'Lumbar Puncture', fee: '60.00' },
  '215': { description: 'Punch Biopsy', fee: '47.50' },
};

const STORAGE_KEY = 'ed-app-billing-codes';

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

/** Get all billing codes (defaults + custom) */
export function getAllBillingCodes(): BillingCode[] {
  const custom = getCustomCodes();
  const merged = { ...DEFAULT_CODES, ...custom };
  return Object.entries(merged)
    .map(([code, info]) => ({ code, ...info }))
    .sort((a, b) => a.description.localeCompare(b.description));
}

/** Look up fee by procedure code */
export function lookupFee(procCode: string): { description: string; fee: string } | null {
  const code = procCode.trim();
  const custom = getCustomCodes();
  return custom[code] || DEFAULT_CODES[code] || null;
}

/** Add or update a custom billing code */
export function addBillingCode(code: string, description: string, fee: string): void {
  const custom = getCustomCodes();
  custom[code.trim()] = { description: description.trim(), fee: fee.trim() };
  saveCustomCodes(custom);
}

/** Remove a custom billing code (can't remove defaults, only overrides) */
export function removeBillingCode(code: string): void {
  const custom = getCustomCodes();
  delete custom[code.trim()];
  saveCustomCodes(custom);
}

/** Determine billing category for a given code */
export function getCategoryForCode(code: string): BillingCategory {
  if (BILLING_CATEGORIES.base.codes.includes(code)) return 'base';
  if (BILLING_CATEGORIES.visitType.codes.includes(code)) return 'visitType';
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

  // Base fee: 0800-2300 → 0145, 2300-0800 → 0146
  if (hour >= 0) {
    if (hour >= 8 && hour < 23) {
      items.push({ code: '0145', description: 'Base Fee 0800-2300', fee: '81.80', category: 'base' });
    } else {
      items.push({ code: '0146', description: 'Base Fee 2300-0800', fee: '119.60', category: 'base' });
    }
  } else {
    // Default to daytime if can't parse
    items.push({ code: '0145', description: 'Base Fee 0800-2300', fee: '81.80', category: 'base' });
  }

  // Time premium
  if (hour >= 0) {
    if ((hour >= 18 && hour < 23) || isWeekend) {
      items.push({ code: '1153', description: 'Evening/Weekend premium', fee: '50.00', category: 'premium' });
    } else if (hour >= 23 || hour < 8) {
      items.push({ code: '1154', description: 'Night (2300-0759) premium', fee: '107.40', category: 'premium' });
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
  const units = items.map(() => '1');

  const grandTotal = items.reduce((sum, i) => {
    const f = parseFloat(i.fee);
    return sum + (isNaN(f) ? 0 : f);
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

  return codes.map((code, i) => {
    // Look up description/fee from defaults if not provided
    const lookup = DEFAULT_CODES[code];
    return {
      code,
      description: descriptions[i] || lookup?.description || code,
      fee: fees[i] || lookup?.fee || '',
      category: getCategoryForCode(code),
    };
  }).filter(item => item.code); // filter out empty entries
}

/** Calculate grand total from billing items */
export function calculateTotal(items: BillingItem[]): string {
  const total = items.reduce((sum, i) => {
    const f = parseFloat(i.fee);
    return sum + (isNaN(f) ? 0 : f);
  }, 0);
  return total > 0 ? total.toFixed(2) : '';
}

/** Get additional codes (everything not in base/visitType/premium) */
export function getAdditionalCodes(): BillingCode[] {
  const categoryCodes = new Set([
    ...BILLING_CATEGORIES.base.codes,
    ...BILLING_CATEGORIES.visitType.codes,
    ...BILLING_CATEGORIES.premium.codes,
  ]);
  return getAllBillingCodes().filter(c => !categoryCodes.has(c.code));
}
