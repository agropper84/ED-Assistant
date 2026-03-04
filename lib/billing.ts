// Common ED procedure codes and their fees
// These can be customized per practice
const PROCEDURE_FEES: Record<string, { description: string; fee: string }> = {
  // General assessment codes (Ontario OHIP examples)
  'A901': { description: 'ED Consultation - Minor', fee: '68.15' },
  'A902': { description: 'ED Consultation - Intermediate', fee: '100.00' },
  'A903': { description: 'ED Consultation - Major', fee: '153.15' },
  'A904': { description: 'ED Consultation - Comprehensive', fee: '203.65' },
  'K998': { description: 'ED Equivalent - After Hours Premium', fee: '25.00' },
  'K999': { description: 'ED Equivalent - Weekend/Holiday', fee: '35.00' },
  'E400': { description: 'Pronouncement of Death', fee: '56.10' },
  // Procedures
  'Z511': { description: 'Laceration Repair - Simple', fee: '51.50' },
  'Z512': { description: 'Laceration Repair - Intermediate', fee: '78.75' },
  'Z513': { description: 'Laceration Repair - Complex', fee: '130.00' },
  'G372': { description: 'I&D Abscess - Simple', fee: '42.20' },
  'Z542': { description: 'Fracture Reduction - Closed', fee: '89.75' },
  'G381': { description: 'Conscious Sedation', fee: '56.10' },
};

export function lookupFee(procCode: string): { description: string; fee: string } | null {
  const code = procCode.toUpperCase().trim();
  return PROCEDURE_FEES[code] || null;
}

export function getAllProcedureCodes(): { code: string; description: string; fee: string }[] {
  return Object.entries(PROCEDURE_FEES).map(([code, info]) => ({
    code,
    ...info,
  }));
}
