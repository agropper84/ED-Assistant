/**
 * Medical documentation suggestions — lazy-loaded from /public/medical-suggestions.json
 * to keep the JS bundle small. The JSON file is fetched once and cached in memory.
 */

let cached: string[] | null = null;
let fetching: Promise<string[]> | null = null;

/** Get suggestions (returns empty array on first call, populates async) */
export function getMedicalSuggestions(): string[] {
  if (cached) return cached;
  if (!fetching) {
    fetching = fetch('/medical-suggestions.json')
      .then(res => res.json())
      .then((data: string[]) => {
        cached = data;
        return data;
      })
      .catch(() => {
        cached = [];
        return [];
      });
  }
  return [];
}

/**
 * @deprecated Use getMedicalSuggestions() instead.
 * Kept for backward compatibility — returns empty array until JSON loads.
 */
export const MEDICAL_SUGGESTIONS: string[] = [];

// Trigger the fetch immediately on import so data is ready quickly
if (typeof window !== 'undefined') {
  getMedicalSuggestions();
}
