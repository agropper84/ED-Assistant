/**
 * Sanitize error messages to prevent PHI leakage in logs and API responses.
 */

/** Strip potential PHI patterns from error messages */
export function sanitizeErrorMessage(error: any): string {
  const msg = String(error?.message || error || 'Unknown error');
  return msg
    // Strip "LASTNAME, FIRSTNAME" patterns
    .replace(/[A-Z]{2,}(?:,\s*[A-Z][a-z]+)/g, '[REDACTED]')
    // Strip MRN-like numbers (6+ digits)
    .replace(/\b\d{6,}\b/g, '[ID]')
    // Strip HCN patterns (10-digit with possible spaces)
    .replace(/\b\d{4}\s?\d{3}\s?\d{3}\b/g, '[HCN]')
    // Strip email addresses
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]')
    // Strip potential sheet names with patient info (Name_MRN pattern)
    .replace(/[A-Z][a-z]+(?:\s[A-Z][a-z]+)*_\d{5,}/g, '[PATIENT_REF]')
    // Strip date-of-birth-like patterns (YYYY-MM-DD or MM/DD/YYYY)
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '[DATE]')
    .replace(/\b\d{2}\/\d{2}\/\d{4}\b/g, '[DATE]');
}

/** Log an error with PHI stripped */
export function safeErrorLog(label: string, error: any): void {
  console.error(label, sanitizeErrorMessage(error));
}

/** Return a safe error message for API responses */
export function safeApiError(error: any): string {
  return sanitizeErrorMessage(error);
}
