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
import type { DataContext, StorageMode, PatientFields } from './types-json';
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
    return dj.getPatientsFromDrive(ctx.drive, sheetName);
  } catch {
    // Fallback to Sheets
    const gs = await import('./google-sheets');
    return gs.getPatients(ctx.sheets, sheetName);
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

  try {
    const dj = await import('./drive-json');
    return dj.getPatientFromDrive(ctx.drive, rowIndex, sheetName);
  } catch {
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
    return dj.getDateSheetsFromDrive(ctx.drive);
  } catch {
    const gs = await import('./google-sheets');
    return gs.getDateSheets(ctx.sheets);
  }
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
