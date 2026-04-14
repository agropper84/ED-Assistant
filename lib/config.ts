/**
 * Centralized configuration constants.
 * Avoids hardcoded model names, rate limits, and other magic values across the codebase.
 */

// --- AI Models ---

export const MODELS = {
  /** Fast, cheap model for simple tasks (autocomplete, parsing, lookup) */
  fast: 'claude-haiku-4-5-20251001',
  /** Default model for clinical processing, note generation */
  default: 'claude-sonnet-4-20250514',
} as const;

export type ModelId = typeof MODELS[keyof typeof MODELS];

// --- Admin ---

export const ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
