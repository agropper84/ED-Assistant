/**
 * Centralized configuration constants.
 * Avoids hardcoded model names, rate limits, and other magic values across the codebase.
 */

// --- AI Models ---

/** Known Claude model presets. Users can also enter custom model IDs via settings. */
export const MODEL_PRESETS = [
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { id: 'claude-opus-5', label: 'Claude Opus 5' },
  { id: 'claude-fable-5-1', label: 'Claude Fable 5.1' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Previous)' },
] as const;

export const MODELS = {
  /** Fast, cheap model for simple tasks (autocomplete, parsing, lookup) */
  fast: 'claude-haiku-4-5-20251001',
  /** Default model for clinical processing, note generation */
  default: 'claude-sonnet-5',
} as const;

export type ModelId = string;

// --- Admin ---

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
