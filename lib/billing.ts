export interface BillingCode {
  code: string;
  description: string;
  fee: string;
}

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
