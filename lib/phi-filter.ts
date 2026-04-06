/**
 * PHI De-identification / Re-identification Layer
 *
 * MANDATORY: All text sent to any AI service MUST pass through deidentifyText().
 * This is not optional — it runs regardless of user settings.
 *
 * Stripped: patient name (full + parts), MRN, HCN, DOB, and occurrences within text.
 * Kept:    age, gender, all clinical content (labs, vitals, meds, diagnoses, etc.)
 */

export interface PHIMapping {
  patientName: string;
  mrn: string;
  hcn: string;
  dob: string;
  additionalNames: string[];
}

/**
 * Returns true always — PHI protection is mandatory and cannot be disabled.
 */
export function isPHIProtectionEnabled(): boolean {
  return true;
}

export function buildPHIMapping(patient: {
  name?: string; mrn?: string; hcn?: string; birthday?: string;
}): PHIMapping {
  const additionalNames: string[] = [];

  if (patient.name) {
    additionalNames.push(patient.name);
    // Handle "LASTNAME, FIRSTNAME" format
    const commaParts = patient.name.split(',').map(s => s.trim());
    for (const part of commaParts) {
      const words = part.split(/\s+/).filter(p => p.length > 2);
      additionalNames.push(...words);
    }
    // Handle "FIRSTNAME LASTNAME" format
    const spaceParts = patient.name.split(/\s+/).filter(p => p.length > 2);
    additionalNames.push(...spaceParts);
  }

  return {
    patientName: patient.name || '',
    mrn: patient.mrn || '',
    hcn: patient.hcn || '',
    dob: patient.birthday || '',
    additionalNames: Array.from(new Set(additionalNames.filter(n => n.length > 2))),
  };
}

/** De-identify a prompt string by replacing PHI with placeholders */
export function deidentifyText(text: string, mapping: PHIMapping): string {
  let result = text;

  const replacements: [string, string][] = [];
  if (mapping.patientName) replacements.push([mapping.patientName, '[PATIENT]']);
  if (mapping.mrn) replacements.push([mapping.mrn, '[MRN]']);
  if (mapping.hcn) replacements.push([mapping.hcn, '[HCN]']);
  if (mapping.dob) replacements.push([mapping.dob, '[DOB]']);

  // Sort by length descending (replace longer strings first to avoid partial matches)
  replacements.sort((a, b) => b[0].length - a[0].length);

  for (const [original, placeholder] of replacements) {
    if (original.length < 2) continue;
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), placeholder);
  }

  // Also replace individual name parts found in document text
  // Sort by length descending to avoid "Li" matching before "Lisinopril"
  const sortedNames = [...mapping.additionalNames].sort((a, b) => b.length - a.length);
  for (const name of sortedNames) {
    if (name.length < 3) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Use word boundary to avoid matching within medical terms
    // e.g., "Li" should not match in "Lithium" or "Lisinopril"
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '[PATIENT]');
  }

  return result;
}

/** Re-identify AI response by replacing placeholders with actual PHI */
export function reidentifyText(text: string, mapping: PHIMapping): string {
  let result = text;
  if (mapping.patientName) result = result.replace(/\[PATIENT\]/g, mapping.patientName);
  if (mapping.mrn) result = result.replace(/\[MRN\]/g, mapping.mrn);
  if (mapping.hcn) result = result.replace(/\[HCN\]/g, mapping.hcn);
  if (mapping.dob) result = result.replace(/\[DOB\]/g, mapping.dob);
  return result;
}
