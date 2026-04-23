/**
 * Centralized configuration constants.
 * Avoids hardcoded model names, rate limits, and other magic values across the codebase.
 */

// --- AI Models ---

/** Known Claude model presets. Users can also enter custom model IDs via settings. */
export const MODEL_PRESETS = [
  { id: 'claude-sonnet-4-6-20250627', label: 'Claude Sonnet 4.6' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { id: 'claude-opus-4-6-20250527', label: 'Claude Opus 4.6' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Previous)' },
] as const;

export const MODELS = {
  /** Fast, cheap model for simple tasks (autocomplete, parsing, lookup) */
  fast: 'claude-haiku-4-5-20251001',
  /** Default model for clinical processing, note generation */
  default: 'claude-sonnet-4-20250514',
} as const;

export type ModelId = string;

// --- Admin ---

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
