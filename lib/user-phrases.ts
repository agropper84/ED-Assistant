/**
 * Extract meaningful phrases from user-typed encounter notes / additional findings.
 * Splits on sentence boundaries and filters for reasonable phrase length.
 */
export function extractPhrases(text: string): string[] {
  if (!text?.trim()) return [];

  return text
    .split(/[.\n]+/)
    .map(s => s.trim().toLowerCase())
    .filter(s => s.length >= 5 && s.length <= 200);
}

/** Save extracted phrases to the user's Google Sheet in the background (fire-and-forget). */
export function savePhrasesInBackground(encounterNotes: string, additional: string): void {
  const phrases = [
    ...extractPhrases(encounterNotes),
    ...extractPhrases(additional),
  ];
  if (!phrases.length) return;

  fetch('/api/user-phrases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phrases }),
  }).catch(() => {
    // Silent failure — phrase saving is non-critical
  });
}
