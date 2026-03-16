/**
 * PHI De-identification / Re-identification Layer
 *
 * Strips identifying information from prompts before sending to AI,
 * then restores it in the response. Clinical data is preserved fully.
 *
 * Stripped: patient name, MRN, HCN, DOB, and occurrences within text.
 * Kept:    age, gender, all clinical content (labs, vitals, meds, diagnoses, etc.)
 */

export interface PHIMapping {
  patientName: string;
  mrn: string;
  hcn: string;
  dob: string;
  additionalNames: string[];
}

export function buildPHIMapping(patient: {
  name?: string; mrn?: string; hcn?: string; birthday?: string;
}): PHIMapping {
  const additionalNames: string[] = [];

  if (patient.name) {
    additionalNames.push(patient.name);
    // Add individual name parts (for matching within text)
    const parts = patient.name.split(/[\s,]+/).filter(p => p.length > 2);
    additionalNames.push(...parts);
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

  // Sort by length descending (replace longer strings first)
  replacements.sort((a, b) => b[0].length - a[0].length);

  for (const [original, placeholder] of replacements) {
    if (original.length < 2) continue;
    const escaped = original.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'gi'), placeholder);
  }

  // Also replace name parts found in document text
  for (const name of mapping.additionalNames) {
    if (name.length < 3) continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
