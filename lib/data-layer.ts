/**
 * Data Layer Abstraction
 *
 * Unified API for reading/writing patient data across storage backends.
 * Supports three modes:
 *   - 'sheets': Google Sheets only (legacy)
 *   - 'dual':   Drive primary, fire-and-forget Sheets mirror (default)
 *   - 'drive':  Drive only, Sheets mirror for dev visibility
 */

import { getSessionFromCookies } from './session';
import { getUserStorageMode } from './kv';
import type { DataContext, StorageMode, PatientFields, SubmissionEntry } from './types-json';
import type { SheetsContext, Patient } from './google-sheets';

// ============================================================
// CONTEXT INITIALIZATION
// ============================================================

export async function getDataContext(): Promise<DataContext> {
  const session = await getSessionFromCookies();
  if (!session.userId) throw new Error('Not authenticated');

  const mode: StorageMode = (await getUserStorageMode(session.userId)) || 'dual';

  // Always init Sheets (needed for mirror and legacy mode)
  const { getSheetsContext } = await import('./google-sheets');
  const sheets = await getSheetsContext();

  if (mode === 'sheets') {
    return { sheets, mode };
  }

  // Init Drive for dual/drive modes
  try {
    const { getDriveContext } = await import('./drive-json');
    const drive = await getDriveContext();
    return { drive, sheets, mode };
  } catch (e) {
    // Drive init failed — fall back to sheets
    console.warn('Drive init failed, falling back to sheets:', (e as Error).message);
    return { sheets, mode: 'sheets' };
  }
}

/**
 * Build a DataContext for a specific userId (for bearer-token / device-token auth).
 * Used by /api/shortcuts/* endpoints that authenticate via token, not session cookies.
 */
export async function getDataContextForUser(userId: string): Promise<DataContext> {
  const mode: StorageMode = (await getUserStorageMode(userId)) || 'dual';

  const { getSheetsContextForUser } = await import('./google-sheets');
  const sheets = await getSheetsContextForUser(userId);

  if (mode === 'sheets') {
    return { sheets, mode };
  }

  try {
    const { getDriveContextForUser } = await import('./drive-json');
    const drive = await getDriveContextForUser(userId);
    return { drive, sheets, mode };
  } catch (e) {
    console.warn('Drive init failed for user, falling back to sheets:', (e as Error).message);
    return { sheets, mode: 'sheets' };
  }
}

// ============================================================
// PATIENT LIST (all patients for a date sheet)
// ============================================================

export async function getPatients(ctx: DataContext, sheetName: string): Promise<Patient[]> {
  if (ctx.mode === 'sheets' || !ctx.drive) {
    const gs = await import('./google-sheets');
    return gs.getPatients(ctx.sheets, sheetName);
  }

  // Drive for clinical data, Sheets for billing (matched by name, not rowIndex,
  // because billing continuation rows shift Sheets row positions)
  try {
    const dj = await import('./drive-json');
    const patients = await dj.getPatientsFromDrive(ctx.drive, sheetName);

    // Overlay billing from Sheets (source of truth for billing)
    try {
      const gs = await import('./google-sheets');
      const sheetsPatients = await gs.getPatients(ctx.sheets, sheetName);
      // Match by patient name since rowIndex diverges when continuation rows exist
      const billingByName = new Map<string, typeof sheetsPatients[0]>();
      for (const sp of sheetsPatients) {
        if (sp.name) billingByName.set(sp.name, sp);
      }
      for (const patient of patients) {
        const sp = patient.name ? billingByName.get(patient.name) : null;
        if (sp) {
          patient.visitProcedure = sp.visitProcedure || '';
          patient.procCode = sp.procCode || '';
          patient.fee = sp.fee || '';
          patient.unit = sp.unit || '';
          patient.total = sp.total || '';
          // Update rowIndex to match Sheets (so billing writes go to the right row)
          patient.rowIndex = sp.rowIndex;
        }
      }
    } catch {}

    return patients;
  } catch {
    return [];
  }
}

// ============================================================
// SINGLE PATIENT
// ============================================================

export async function getPatient(ctx: DataContext, rowIndex: number, sheetName: string): Promise<Patient | null> {
  if (ctx.mode === 'sheets' || !ctx.drive) {
    const gs = await import('./google-sheets');
    return gs.getPatient(ctx.sheets, rowIndex, sheetName);
  }

  // Drive for clinical data, Sheets for billing
  try {
    const dj = await import('./drive-json');
    const patient = await dj.getPatientFromDrive(ctx.drive, rowIndex, sheetName);
    if (!patient) return null;

    // Overlay billing from Sheets — find by name since rowIndex may have shifted
    try {
      const gs = await import('./google-sheets');
      const sheetsPatients = await gs.getPatients(ctx.sheets, patient.sheetName);
      const sp = sheetsPatients.find(p => p.name === patient.name);
      if (sp) {
        patient.visitProcedure = sp.visitProcedure || '';
        patient.procCode = sp.procCode || '';
        patient.fee = sp.fee || '';
        patient.unit = sp.unit || '';
        patient.total = sp.total || '';
        patient.rowIndex = sp.rowIndex;
      }
    } catch {}

    return patient;
  } catch {
    return null;
  }
}

// ============================================================
// UPDATE PATIENT FIELDS
// ============================================================

export async function updatePatientFields(
  ctx: DataContext,
  rowIndex: number,
  fields: Record<string, string>,
  sheetName: string,
): Promise<void> {
  if (ctx.mode === 'sheets' || !ctx.drive) {
    const gs = await import('./google-sheets');
    return gs.updatePatientFields(ctx.sheets, rowIndex, fields, sheetName);
  }

  // Drive primary write
  const dj = await import('./drive-json');
  await dj.updatePatientInDrive(ctx.drive, sheetName, rowIndex, fields as Partial<PatientFields>);

  // Fire-and-forget Sheets mirror
  import('./google-sheets').then(gs =>
    gs.updatePatientFields(ctx.sheets, rowIndex, fields, sheetName)
  ).catch(e => console.warn('Sheets mirror failed:', (e as Error).message));
}

// ============================================================
// ADD SUBMISSION (per-section save)
// ============================================================

export async function addSubmission(
  ctx: DataContext,
  rowIndex: number,
  sheetName: string,
  entry: SubmissionEntry,
): Promise<SubmissionEntry[]> {
  // Build the content with title label (so AI knows what the content represents)
  const labeledContent = entry.title
    ? `[${entry.title.toUpperCase()}]\n${entry.content}`
    : entry.content;

  // Append to the flat field in Sheets (don't replace — accumulate submissions)
  const gs = await import('./google-sheets');
  const existingPatient = await gs.getPatient(ctx.sheets, rowIndex, sheetName);
  const existingContent = existingPatient ? (existingPatient as any)[entry.field] || '' : '';
  const combined = existingContent && labeledContent
    ? `${existingContent}\n\n${labeledContent}`
    : labeledContent || existingContent;
  gs.updatePatientFields(ctx.sheets, rowIndex, { [entry.field]: combined }, sheetName)
    .catch(e => console.warn('Sheets field update failed:', (e as Error).message));

  if (ctx.mode === 'sheets' || !ctx.drive) {
    return [entry]; // No Drive storage for submissions in sheets-only mode
  }

  // Drive: add to submissions array + update flat field
  const dj = await import('./drive-json');
  return dj.addSubmissionToDrive(ctx.drive, sheetName, rowIndex, entry);
}

// ============================================================
// ADD PATIENT
// ============================================================

export async function addPatient(
  ctx: DataContext,
  patient: Patient,
  sheetName: string,
): Promise<void> {
  if (ctx.mode === 'sheets' || !ctx.drive) {
    // For sheets-only, patient is added via google-sheets directly by caller
    return;
  }

  const dj = await import('./drive-json');
  await dj.addPatientToDrive(ctx.drive, sheetName, patient);
}

// ============================================================
// DELETE PATIENT
// ============================================================

export async function deletePatient(
  ctx: DataContext,
  rowIndex: number,
  sheetName: string,
): Promise<void> {
  if (ctx.mode !== 'sheets' && ctx.drive) {
    const dj = await import('./drive-json');
    await dj.deletePatientFromDrive(ctx.drive, sheetName, rowIndex);
  }

  // Note: Sheets-level row deletion is handled by the caller if needed
  // (ED-Assistant uses row-based data, not separate sheet-per-patient)
}

// ============================================================
// DATE SHEETS LIST
// ============================================================

export async function getDateSheets(ctx: DataContext): Promise<string[]> {
  if (ctx.mode === 'sheets' || !ctx.drive) {
    const gs = await import('./google-sheets');
    return gs.getDateSheets(ctx.sheets);
  }

  try {
    const dj = await import('./drive-json');
    const driveSheets = await dj.getDateSheetsFromDrive(ctx.drive);
    // If Drive returns empty, fall back to Sheets (Drive may not be populated yet)
    if (driveSheets.length > 0) return driveSheets;
  } catch {}

  const gs = await import('./google-sheets');
  return gs.getDateSheets(ctx.sheets);
}

// ============================================================
// GET OR CREATE DATE SHEET
// ============================================================

export async function getOrCreateDateSheet(
  ctx: DataContext,
  sheetName: string,
): Promise<string> {
  // Always create in Sheets (for mirror/legacy)
  const gs = await import('./google-sheets');
  const name = await gs.getOrCreateDateSheet(ctx.sheets, sheetName);

  // Also create in Drive
  if (ctx.mode !== 'sheets' && ctx.drive) {
    const dj = await import('./drive-json');
    await dj.getOrCreateDateSheetInDrive(ctx.drive, name);
  }

  return name;
}

// ============================================================
// GET SUBMISSIONS (for tag display)
// ============================================================

export async function getSubmissions(ctx: DataContext, rowIndex: number, sheetName: string): Promise<SubmissionEntry[]> {
  if (ctx.mode !== 'sheets' && ctx.drive) {
    try {
      const dj = await import('./drive-json');
      const dateSheet = await dj.getDateSheetFromDrive(ctx.drive, sheetName);
      if (dateSheet) {
        const patient = dateSheet.patients.find(p => p.rowIndex === rowIndex);
        if (patient?.submissions) return patient.submissions;
      }
    } catch {}
  }
  return [];
}

// ============================================================
// DELETE SUBMISSION
// ============================================================

export async function deleteSubmission(ctx: DataContext, rowIndex: number, sheetName: string, submissionId: string): Promise<void> {
  if (ctx.mode !== 'sheets' && ctx.drive) {
    const dj = await import('./drive-json');
    const dateSheet = await dj.getDateSheetFromDrive(ctx.drive, sheetName);
    if (dateSheet) {
      const patientIdx = dateSheet.patients.findIndex(p => p.rowIndex === rowIndex);
      if (patientIdx !== -1 && dateSheet.patients[patientIdx].submissions) {
        dateSheet.patients[patientIdx].submissions = dateSheet.patients[patientIdx].submissions!.filter(
          s => s.id !== submissionId
        );
        dateSheet.patients[patientIdx].lastModified = new Date().toISOString();
        await dj.saveDateSheetToDrive(ctx.drive, dateSheet);
      }
    }
  }
}

// ============================================================
// SHIFT TIMES
// ============================================================

export async function getShiftTimes(ctx: DataContext, sheetName: string) {
  // Drive primary
  if (ctx.mode !== 'sheets' && ctx.drive) {
    try {
      const dj = await import('./drive-json');
      const times = await dj.getShiftTimesFromDrive(ctx.drive, sheetName);
      if (times) return times;
    } catch {}
  }
  // Sheets fallback
  const gs = await import('./google-sheets');
  return gs.getShiftTimes(ctx.sheets, sheetName);
}

export async function setShiftTimes(ctx: DataContext, sheetName: string, start: string, end: string) {
  // Sheets computes fee logic, then we store the result in Drive
  const gs = await import('./google-sheets');
  const result = await gs.setShiftTimes(ctx.sheets, sheetName, start, end);

  // Mirror to Drive
  if (ctx.mode !== 'sheets' && ctx.drive) {
    import('./drive-json').then(dj =>
      dj.setShiftTimesInDrive(ctx.drive!, sheetName, result)
    ).catch(e => console.warn('Drive shift time mirror failed:', (e as Error).message));
  }

  return result;
}

// ============================================================
// ROW INDEX & PATIENT COUNT (for new patient creation)
// ============================================================

export async function getNextRowIndex(ctx: DataContext, sheetName: string): Promise<number> {
  // Always use Sheets for row index — Sheets is the source of truth for row layout
  // because billing continuation rows shift row positions and Drive doesn't track those
  const gs = await import('./google-sheets');
  return gs.getNextEmptyRow(ctx.sheets, sheetName);
}

export async function getPatientCount(ctx: DataContext, sheetName: string): Promise<number> {
  if (ctx.mode !== 'sheets' && ctx.drive) {
    try {
      const dj = await import('./drive-json');
      const dateSheet = await dj.getDateSheetFromDrive(ctx.drive, sheetName);
      if (dateSheet) return dateSheet.patients.length;
    } catch {}
  }
  const gs = await import('./google-sheets');
  return gs.getPatientCount(ctx.sheets, sheetName);
}

// ============================================================
// SEARCH PATIENTS (across multiple date sheets)
// ============================================================

export async function searchPatients(ctx: DataContext, sheetNames: string[], query: string): Promise<Patient[]> {
  if (ctx.mode !== 'sheets' && ctx.drive) {
    try {
      const dj = await import('./drive-json');
      const needle = query.toLowerCase().trim();
      const results: Patient[] = [];
      for (const name of sheetNames.slice(0, 30)) {
        const dateSheet = await dj.getDateSheetFromDrive(ctx.drive, name);
        if (!dateSheet) continue;
        for (const pf of dateSheet.patients) {
          const p = dj.fieldsToPatient(pf);
          if (
            p.name?.toLowerCase().includes(needle) ||
            p.diagnosis?.toLowerCase().includes(needle) ||
            p.triageVitals?.toLowerCase().includes(needle)
          ) {
            results.push(p);
          }
        }
      }
      if (results.length > 0) return results;
    } catch {}
  }
  // Sheets fallback
  const gs = await import('./google-sheets');
  return gs.searchPatientsAcrossSheets(ctx.sheets, sheetNames, query);
}

// ============================================================
// CLEAR PATIENT (delete from Drive + clear Sheets row)
// ============================================================

export async function clearPatient(ctx: DataContext, rowIndex: number, sheetName: string): Promise<void> {
  // Drive delete
  if (ctx.mode !== 'sheets' && ctx.drive) {
    const dj = await import('./drive-json');
    await dj.deletePatientFromDrive(ctx.drive, sheetName, rowIndex);
  }
  // Sheets clear
  const gs = await import('./google-sheets');
  await gs.clearPatientRow(ctx.sheets, rowIndex, sheetName);
}

// ============================================================
// STYLE GUIDE (Drive primary, Sheets mirror)
// ============================================================

export async function getStyleGuide(ctx: DataContext) {
  if (ctx.mode !== 'sheets' && ctx.drive) {
    try {
      const dj = await import('./drive-json');
      const guide = await dj.getStyleGuideFromDrive(ctx.drive);
      if (guide) return guide;
    } catch {}
  }
  const gs = await import('./google-sheets');
  return gs.getStyleGuideFromSheet(ctx.sheets);
}

export async function saveStyleGuide(ctx: DataContext, guide: any) {
  // Drive primary
  if (ctx.mode !== 'sheets' && ctx.drive) {
    const dj = await import('./drive-json');
    await dj.saveStyleGuideToDrive(ctx.drive, { version: 1, lastModified: new Date().toISOString(), ...guide });
  }
  // Sheets mirror (fire-and-forget)
  import('./google-sheets').then(gs =>
    gs.saveStyleGuideToSheet(ctx.sheets, guide)
  ).catch(e => console.warn('Style guide Sheets mirror failed:', (e as Error).message));
}

// ============================================================
// BILLING CODES (Drive primary, Sheets mirror)
// ============================================================

export async function getBillingCodes(ctx: DataContext) {
  if (ctx.mode !== 'sheets' && ctx.drive) {
    try {
      const dj = await import('./drive-json');
      const codes = await dj.getBillingCodesFromDrive(ctx.drive);
      if (codes.length > 0) return codes;
    } catch {}
  }
  const gs = await import('./google-sheets');
  return gs.getBillingCodes(ctx.sheets);
}

export async function saveBillingCodes(ctx: DataContext, codes: any[]) {
  if (ctx.mode !== 'sheets' && ctx.drive) {
    const dj = await import('./drive-json');
    await dj.saveBillingCodesToDrive(ctx.drive, codes);
  }
  import('./google-sheets').then(gs =>
    gs.saveBillingCodesToSheet(ctx.sheets, codes)
  ).catch(e => console.warn('Billing codes Sheets mirror failed:', (e as Error).message));
}

export async function addBillingCode(ctx: DataContext, code: any) {
  // Read existing, add, save
  const existing = await getBillingCodes(ctx);
  existing.push(code);
  await saveBillingCodes(ctx, existing);
}

export async function updateBillingCode(ctx: DataContext, codeId: string, update: any) {
  const existing = await getBillingCodes(ctx);
  const idx = existing.findIndex((c: any) => c.code === codeId);
  if (idx !== -1) {
    existing[idx] = { ...existing[idx], ...update };
    await saveBillingCodes(ctx, existing);
  }
}

export async function deleteBillingCode(ctx: DataContext, codeId: string) {
  const existing = await getBillingCodes(ctx);
  const filtered = existing.filter((c: any) => c.code !== codeId);
  await saveBillingCodes(ctx, filtered);
}

// ============================================================
// DIAGNOSIS CODES (Drive primary, Sheets mirror)
// ============================================================

export async function getDiagnosisCodes(ctx: DataContext) {
  if (ctx.mode !== 'sheets' && ctx.drive) {
    try {
      const dj = await import('./drive-json');
      const codes = await dj.getDiagnosisCodesFromDrive(ctx.drive);
      if (codes.length > 0) return codes;
    } catch {}
  }
  const gs = await import('./google-sheets');
  return gs.getDiagnosisCodes(ctx.sheets);
}

export async function findDiagnosisCode(ctx: DataContext, diagnosis: string) {
  const codes = await getDiagnosisCodes(ctx);
  const needle = diagnosis.toLowerCase().trim();
  const match = codes.find((c: any) => c.diagnosis?.toLowerCase().trim() === needle);
  return match ? { diagnosis: match.diagnosis, icd9: match.icd9, icd10: match.icd10 } : null;
}

export async function upsertDiagnosisCode(ctx: DataContext, entry: { diagnosis: string; icd9: string; icd10: string }) {
  const codes = await getDiagnosisCodes(ctx);
  const needle = entry.diagnosis.toLowerCase().trim();
  const idx = codes.findIndex((c: any) => c.diagnosis?.toLowerCase().trim() === needle);
  if (idx !== -1) {
    codes[idx] = { ...codes[idx], ...entry, count: (codes[idx].count || 0) + 1 };
  } else {
    codes.push({ ...entry, count: 1 });
  }
  // Drive primary
  if (ctx.mode !== 'sheets' && ctx.drive) {
    const dj = await import('./drive-json');
    await dj.saveDiagnosisCodesToDrive(ctx.drive, codes);
  }
  // Sheets mirror
  import('./google-sheets').then(gs =>
    gs.upsertDiagnosisCode(ctx.sheets, entry)
  ).catch(e => console.warn('Diagnosis code Sheets mirror failed:', (e as Error).message));
}

// ============================================================
// PARSE FORMATS (Drive primary, Sheets mirror)
// ============================================================

export async function getParseFormats(ctx: DataContext) {
  if (ctx.mode !== 'sheets' && ctx.drive) {
    try {
      const dj = await import('./drive-json');
      const formats = await dj.getParseFormatsFromDrive(ctx.drive);
      if (formats.length > 0) return formats;
    } catch {}
  }
  const gs = await import('./google-sheets');
  return gs.getParseFormats(ctx.sheets);
}

export async function saveParseFormat(ctx: DataContext, format: any) {
  const existing = await getParseFormats(ctx);
  const idx = existing.findIndex((f: any) => f.name === format.name);
  if (idx !== -1) existing[idx] = format;
  else existing.push(format);

  if (ctx.mode !== 'sheets' && ctx.drive) {
    const dj = await import('./drive-json');
    await dj.saveParseFormatsToDrive(ctx.drive, existing);
  }
  import('./google-sheets').then(gs =>
    gs.saveParseFormat(ctx.sheets, format)
  ).catch(e => console.warn('Parse format Sheets mirror failed:', (e as Error).message));
}

export async function deleteParseFormat(ctx: DataContext, name: string) {
  const existing = await getParseFormats(ctx);
  const filtered = existing.filter((f: any) => f.name !== name);

  if (ctx.mode !== 'sheets' && ctx.drive) {
    const dj = await import('./drive-json');
    await dj.saveParseFormatsToDrive(ctx.drive, filtered);
  }
  import('./google-sheets').then(gs =>
    gs.deleteParseFormat(ctx.sheets, name)
  ).catch(e => console.warn('Parse format Sheets mirror failed:', (e as Error).message));
}

// ============================================================
// USER PHRASES (Drive primary, Sheets mirror)
// ============================================================

export async function getUserPhrases(ctx: DataContext): Promise<string[]> {
  if (ctx.mode !== 'sheets' && ctx.drive) {
    try {
      const dj = await import('./drive-json');
      const phrases = await dj.getUserPhrasesFromDrive(ctx.drive);
      if (phrases.length > 0) return phrases.sort((a, b) => b.count - a.count).map(p => p.phrase);
    } catch {}
  }
  const gs = await import('./google-sheets');
  return gs.getUserPhrases(ctx.sheets);
}

export async function saveUserPhrases(ctx: DataContext, newPhrases: string[]) {
  // Merge with existing (increment counts)
  let existing: Array<{ phrase: string; count: number }> = [];
  if (ctx.mode !== 'sheets' && ctx.drive) {
    try {
      const dj = await import('./drive-json');
      existing = await dj.getUserPhrasesFromDrive(ctx.drive);
    } catch {}
  }

  const map = new Map<string, number>();
  for (const e of existing) map.set(e.phrase.toLowerCase(), e.count);
  for (const p of newPhrases) {
    if (p.trim().length < 5) continue;
    const key = p.trim().toLowerCase();
    map.set(key, (map.get(key) || 0) + 1);
  }

  const merged = Array.from(map.entries())
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 2000);

  if (ctx.mode !== 'sheets' && ctx.drive) {
    const dj = await import('./drive-json');
    await dj.saveUserPhrasesToDrive(ctx.drive, merged);
  }
  // Sheets mirror
  import('./google-sheets').then(gs =>
    gs.saveUserPhrases(ctx.sheets, newPhrases)
  ).catch(e => console.warn('User phrases Sheets mirror failed:', (e as Error).message));
}
