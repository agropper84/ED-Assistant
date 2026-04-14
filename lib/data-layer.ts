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

  try {
    const dj = await import('./drive-json');
    const drivePatients = await dj.getPatientsFromDrive(ctx.drive, sheetName);
    if (drivePatients.length > 0) return drivePatients;
  } catch {}

  // Fallback to Sheets if Drive returns empty or fails
  const gs = await import('./google-sheets');
  return gs.getPatients(ctx.sheets, sheetName);
}

// ============================================================
// SINGLE PATIENT
// ============================================================

export async function getPatient(ctx: DataContext, rowIndex: number, sheetName: string): Promise<Patient | null> {
  if (ctx.mode === 'sheets' || !ctx.drive) {
    const gs = await import('./google-sheets');
    return gs.getPatient(ctx.sheets, rowIndex, sheetName);
  }

  try {
    const dj = await import('./drive-json');
    const drivePatient = await dj.getPatientFromDrive(ctx.drive, rowIndex, sheetName);
    if (drivePatient) return drivePatient;
  } catch {}

  // Fallback to Sheets if Drive returns null or fails
  {
    const gs = await import('./google-sheets');
    return gs.getPatient(ctx.sheets, rowIndex, sheetName);
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
  // Append to the flat field in Sheets (don't replace — accumulate submissions)
  const gs = await import('./google-sheets');
  const existingPatient = await gs.getPatient(ctx.sheets, rowIndex, sheetName);
  const existingContent = existingPatient ? (existingPatient as any)[entry.field] || '' : '';
  const combined = existingContent && entry.content
    ? `${existingContent}\n\n${entry.content}`
    : entry.content || existingContent;
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
  if (ctx.mode !== 'sheets' && ctx.drive) {
    try {
      const dj = await import('./drive-json');
      const dateSheet = await dj.getDateSheetFromDrive(ctx.drive, sheetName);
      if (dateSheet && dateSheet.patients.length > 0) {
        return Math.max(...dateSheet.patients.map(p => p.rowIndex)) + 1;
      }
    } catch {}
  }
  // Sheets fallback
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
