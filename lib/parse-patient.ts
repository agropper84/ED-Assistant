// Parse patient data - supports configurable patterns for different EMR formats

import type { ParseRules } from '@/lib/settings';

export interface ParsedPatient {
  name: string;
  age: string;
  gender: string;
  birthday: string;
  hcn: string;
  mrn: string;
}

/**
 * Parse patient info using custom rules (regex-based extraction).
 * Extracts MRN, HCN, age/gender/DOB from the full text, then treats
 * the remainder (after stripping cleanup markers) as the patient name.
 */
function parseWithRules(text: string, rules: ParseRules): ParsedPatient {
  const result: ParsedPatient = { name: '', age: '', gender: '', birthday: '', hcn: '', mrn: '' };
  let remaining = text;

  // Extract MRN
  try {
    const mrnRe = new RegExp(rules.mrnPattern, 'i');
    const mrnMatch = remaining.match(mrnRe);
    if (mrnMatch && mrnMatch[1]) {
      result.mrn = mrnMatch[1];
      remaining = remaining.replace(mrnRe, '');
    }
  } catch { /* invalid regex — skip */ }

  // Extract HCN
  try {
    const hcnRe = new RegExp(rules.hcnPattern, 'i');
    const hcnMatch = remaining.match(hcnRe);
    if (hcnMatch && hcnMatch[1]) {
      result.hcn = hcnMatch[1];
      remaining = remaining.replace(hcnRe, '');
    }
  } catch { /* invalid regex — skip */ }

  // Extract age/gender/DOB
  try {
    const ageDobRe = new RegExp(rules.ageDobPattern, 'i');
    const ageDobMatch = remaining.match(ageDobRe);
    if (ageDobMatch) {
      result.age = ageDobMatch[1] || '';
      result.gender = (ageDobMatch[2] || '').toUpperCase();
      result.birthday = ageDobMatch[3] || '';
      remaining = remaining.replace(ageDobRe, '');
    }
  } catch { /* invalid regex — skip */ }

  // Strip cleanup markers
  if (rules.nameCleanup) {
    const markers = rules.nameCleanup.split(',').map(m => m.trim()).filter(Boolean);
    for (const marker of markers) {
      // Remove marker as standalone token or trailing/leading
      remaining = remaining.replace(new RegExp(`\\b${marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), '');
    }
  }

  // Clean up remaining text as name
  remaining = remaining.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (remaining) {
    result.name = remaining.replace(/,(\S)/, ', $1');
  }

  return result;
}

/**
 * Original Meditech-specific parsing logic (multi-line + single-line).
 */
function parseMeditech(patientInfoText: string): ParsedPatient {
  const result: ParsedPatient = { name: '', age: '', gender: '', birthday: '', hcn: '', mrn: '' };
  let text = patientInfoText.trim();
  const hasNewlines = text.includes('\n');

  if (hasNewlines) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);

    if (lines.length >= 1 && !lines[0].match(/^ED$/i)) {
      result.name = lines[0].replace(',', ', ').replace(/,\s+/g, ', ');
    }

    for (const line of lines) {
      const ageMatch = line.match(/^(\d+(?:y\s*\d+m)?),?\s*([MF])\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
      if (ageMatch) {
        result.age = ageMatch[1];
        result.gender = ageMatch[2].toUpperCase();
        result.birthday = ageMatch[3];
        break;
      }
    }

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/HCN#/i)) {
        const match = lines[i].match(/HCN#\s*(\d+)/i);
        if (match) {
          result.hcn = match[1];
        } else if (i + 1 < lines.length && lines[i + 1].match(/^\d+$/)) {
          result.hcn = lines[i + 1];
        }
      }
      if (lines[i].match(/MRN#/i)) {
        const match = lines[i].match(/MRN#\s*([A-Z0-9]+)/i);
        if (match) {
          result.mrn = match[1];
        } else if (i + 1 < lines.length && lines[i + 1].match(/^[A-Z0-9]+$/i)) {
          result.mrn = lines[i + 1];
        }
      }
    }
  } else {
    const mrnMatch = text.match(/MRN#\s*([A-Z0-9]+)/i);
    if (mrnMatch) {
      result.mrn = mrnMatch[1];
      text = text.replace(/MRN#\s*[A-Z0-9]+/i, '');
    }

    const hcnMatch = text.match(/HCN#\s*(\d+)/i);
    if (hcnMatch) {
      result.hcn = hcnMatch[1];
      text = text.replace(/HCN#\s*\d+/i, '');
    }

    const ageDobMatch = text.match(/(\d+(?:y\s*\d+m)?),?\s*([MF])\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (ageDobMatch) {
      result.age = ageDobMatch[1];
      result.gender = ageDobMatch[2].toUpperCase();
      result.birthday = ageDobMatch[3];
      text = text.replace(/\d+(?:y\s*\d+m)?,?\s*[MF]\s*\d{1,2}\/\d{1,2}\/\d{4}/i, '');
    }

    text = text.replace(/ED$/i, '').replace(/ED(?=\d)/i, '').trim();

    if (text) {
      result.name = text.replace(/,(\S)/, ', $1');
    }
  }

  return result;
}

export function parsePatientInfo(patientInfoText: string, rules?: ParseRules): ParsedPatient {
  const result: ParsedPatient = { name: '', age: '', gender: '', birthday: '', hcn: '', mrn: '' };

  if (!patientInfoText || !patientInfoText.trim()) {
    return result;
  }

  // If custom rules provided, use regex-based extraction
  if (rules) {
    return parseWithRules(patientInfoText.trim(), rules);
  }

  // Otherwise fall back to original Meditech logic
  return parseMeditech(patientInfoText);
}

// Get current time rounded to nearest 15 minutes (in local timezone)
export function getRoundedTime(): string {
  const LOCAL_TZ = process.env.TIMEZONE || 'America/Toronto';
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: LOCAL_TZ }));
  const minutes = Math.round(now.getMinutes() / 15) * 15;
  now.setMinutes(minutes);
  now.setSeconds(0);

  const hours = now.getHours().toString().padStart(2, '0');
  const mins = now.getMinutes().toString().padStart(2, '0');
  return `${hours}:${mins}`;
}
