// Parse Meditech patient data - handles both single-line and multi-line formats

export interface ParsedPatient {
  name: string;
  age: string;
  gender: string;
  birthday: string;
  hcn: string;
  mrn: string;
}

export function parsePatientInfo(patientInfoText: string): ParsedPatient {
  const result: ParsedPatient = {
    name: '',
    age: '',
    gender: '',
    birthday: '',
    hcn: '',
    mrn: ''
  };

  if (!patientInfoText || !patientInfoText.trim()) {
    return result;
  }

  let text = patientInfoText.trim();
  const hasNewlines = text.includes('\n');

  if (hasNewlines) {
    // Multi-line format
    const lines = text.split('\n').map(l => l.trim()).filter(l => l);
    
    // First non-ED line is the name
    if (lines.length >= 1 && !lines[0].match(/^ED$/i)) {
      result.name = lines[0].replace(',', ', ').replace(/,\s+/g, ', ');
    }
    
    // Find age/gender/DOB line
    for (const line of lines) {
      const ageMatch = line.match(/^(\d+(?:y\s*\d+m)?),?\s*([MF])\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
      if (ageMatch) {
        result.age = ageMatch[1];
        result.gender = ageMatch[2].toUpperCase();
        result.birthday = ageMatch[3];
        break;
      }
    }
    
    // Find HCN and MRN
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
    // Single-line format (concatenated)
    // Example: "Gorobao-Smarch,DavidED2y 3m, M27/11/2023HCN#003157377MRN#M000151515"
    
    // Extract MRN# first (at the end)
    const mrnMatch = text.match(/MRN#\s*([A-Z0-9]+)/i);
    if (mrnMatch) {
      result.mrn = mrnMatch[1];
      text = text.replace(/MRN#\s*[A-Z0-9]+/i, '');
    }
    
    // Extract HCN#
    const hcnMatch = text.match(/HCN#\s*(\d+)/i);
    if (hcnMatch) {
      result.hcn = hcnMatch[1];
      text = text.replace(/HCN#\s*\d+/i, '');
    }
    
    // Extract age, gender, DOB
    const ageDobMatch = text.match(/(\d+(?:y\s*\d+m)?),?\s*([MF])\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);
    if (ageDobMatch) {
      result.age = ageDobMatch[1];
      result.gender = ageDobMatch[2].toUpperCase();
      result.birthday = ageDobMatch[3];
      text = text.replace(/\d+(?:y\s*\d+m)?,?\s*[MF]\s*\d{1,2}\/\d{1,2}\/\d{4}/i, '');
    }
    
    // Remove "ED" department marker
    text = text.replace(/ED$/i, '').replace(/ED(?=\d)/i, '').trim();
    
    // What's left is the name
    if (text) {
      result.name = text.replace(/,(\S)/, ', $1');
    }
  }

  return result;
}

// Get current time rounded to nearest 15 minutes
export function getRoundedTime(): string {
  const now = new Date();
  const minutes = Math.round(now.getMinutes() / 15) * 15;
  now.setMinutes(minutes);
  now.setSeconds(0);
  
  const hours = now.getHours().toString().padStart(2, '0');
  const mins = now.getMinutes().toString().padStart(2, '0');
  return `${hours}:${mins}`;
}
