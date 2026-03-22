export interface StyleGuide {
  examples: {
    hpi: string[];
    objective: string[];
    assessmentPlan: string[];
    referral: string[];
    admission: string[];
  };
  extractedFeatures: string[];
  customGuidance: string;
}

const STORAGE_KEY = 'ed-app-style-guide';

function getDefault(): StyleGuide {
  return {
    examples: { hpi: [], objective: [], assessmentPlan: [], referral: [], admission: [] },
    extractedFeatures: [],
    customGuidance: '',
  };
}

// --- Sync helpers (kept for backward compat / migration) ---

export function getStyleGuide(): StyleGuide {
  if (typeof window === 'undefined') return getDefault();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return getDefault();
    const parsed = JSON.parse(stored);
    // Normalize legacy computedFeatures → extractedFeatures
    return {
      examples: parsed.examples || { hpi: [], objective: [], assessmentPlan: [], referral: [], admission: [] },
      extractedFeatures: parsed.extractedFeatures || [],
      customGuidance: parsed.customGuidance || '',
    };
  } catch {
    return getDefault();
  }
}

export function clearLocalStyleGuide(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}

// --- Async API-backed functions ---

export async function fetchStyleGuide(): Promise<StyleGuide> {
  const res = await fetch('/api/style-guide');
  if (!res.ok) throw new Error('Failed to fetch style guide');
  return res.json();
}

export async function persistStyleGuide(guide: StyleGuide): Promise<void> {
  const res = await fetch('/api/style-guide', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(guide),
  });
  if (!res.ok) throw new Error('Failed to save style guide');
}

export async function addExampleAsync(
  section: 'hpi' | 'objective' | 'assessmentPlan' | 'referral' | 'admission',
  example: string,
  current: StyleGuide
): Promise<StyleGuide> {
  if (current.examples[section].includes(example)) return current;
  const updated: StyleGuide = {
    ...current,
    examples: {
      ...current.examples,
      [section]: [...current.examples[section], example],
    },
  };
  await persistStyleGuide(updated);
  return updated;
}

export async function removeExampleAsync(
  section: 'hpi' | 'objective' | 'assessmentPlan' | 'referral' | 'admission',
  index: number,
  current: StyleGuide
): Promise<StyleGuide> {
  const updated: StyleGuide = {
    ...current,
    examples: {
      ...current.examples,
      [section]: current.examples[section].filter((_, i) => i !== index),
    },
  };
  await persistStyleGuide(updated);
  return updated;
}
