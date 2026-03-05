import { google, type sheets_v4 } from 'googleapis';
import { NextRequest } from 'next/server';
import { BillingItem, BillingCode, calculateTotal } from '@/lib/billing';
import type { StyleGuide } from '@/lib/style-guide';
import { getSessionFromCookies } from '@/lib/session';
import { getOAuth2Client, refreshAccessToken } from '@/lib/oauth';
import { getUserSpreadsheetId, getUserStatus } from '@/lib/kv';

// --- SheetsContext: per-user authenticated Sheets client ---

export interface SheetsContext {
  sheets: sheets_v4.Sheets;
  spreadsheetId: string;
}

/**
 * Build a SheetsContext from the current user's session.
 * Reads OAuth tokens from the session, refreshes if expired,
 * and looks up the user's spreadsheetId from KV.
 */
export async function getSheetsContext(): Promise<SheetsContext> {
  const session = await getSessionFromCookies();

  if (!session.userId || !session.accessToken) {
    throw new Error('Not authenticated');
  }

  // Check approval status
  const status = await getUserStatus(session.userId);
  if (status !== 'approved') {
    throw new Error('Not approved');
  }

  // Refresh token if expired (with 5-min buffer)
  const BUFFER_MS = 5 * 60 * 1000;
  if (session.tokenExpiry && Date.now() > session.tokenExpiry - BUFFER_MS) {
    try {
      const newCreds = await refreshAccessToken(session.refreshToken);
      session.accessToken = newCreds.access_token || session.accessToken;
      if (newCreds.expiry_date) {
        session.tokenExpiry = newCreds.expiry_date;
      }
      await session.save();
    } catch (err) {
      console.error('Token refresh failed:', err);
      throw new Error('Token refresh failed - please re-login');
    }
  }

  // Create OAuth2 client with user's tokens
  const oauth2Client = getOAuth2Client();
  oauth2Client.setCredentials({
    access_token: session.accessToken,
    refresh_token: session.refreshToken,
  });

  const sheets = google.sheets({ version: 'v4', auth: oauth2Client });

  // Get user's spreadsheet ID from KV
  const spreadsheetId = await getUserSpreadsheetId(session.userId);
  if (!spreadsheetId) {
    throw new Error('No spreadsheet found for user - please re-login');
  }

  return { sheets, spreadsheetId };
}

// Column mappings matching the Apps Script CONFIG
export const COLUMNS = {
  PATIENT_NUM: 0,    // A
  TIMESTAMP: 1,      // B
  PATIENT_NAME: 2,   // C
  AGE: 3,            // D
  GENDER: 4,         // E
  BIRTHDAY: 5,       // F
  HCN: 6,            // G
  MRN: 7,            // H
  DIAGNOSIS: 8,      // I
  ICD9: 9,           // J
  ICD10: 10,         // K
  VISIT_PROCEDURE: 11, // L
  PROC_CODE: 12,     // M
  FEE: 13,           // N
  UNIT: 14,          // O
  TOTAL: 15,         // P
  COMMENTS: 16,      // Q
  TRIAGE_VITALS: 17, // R
  TRANSCRIPT: 18,    // S
  ADDITIONAL: 19,    // T
  DDX: 20,           // U
  INVESTIGATIONS: 21, // V
  HPI: 22,           // W
  OBJECTIVE: 23,     // X
  ASSESSMENT_PLAN: 24, // Y
  REFERRAL: 25,      // Z
  PAST_DOCS: 26,     // AA
};

export const DATA_START_ROW = 8; // Row 8 in spreadsheet (0-indexed: 7)

export interface Patient {
  rowIndex: number;
  sheetName: string;
  patientNum: string;
  timestamp: string;
  name: string;
  age: string;
  gender: string;
  birthday: string;
  hcn: string;
  mrn: string;
  diagnosis: string;
  icd9: string;
  icd10: string;
  visitProcedure: string;
  procCode: string;
  fee: string;
  unit: string;
  total: string;
  comments: string;
  triageVitals: string;
  transcript: string;
  additional: string;
  ddx: string;
  investigations: string;
  hpi: string;
  objective: string;
  assessmentPlan: string;
  referral: string;
  pastDocs: string;
  // Computed
  hasOutput: boolean;
  status: 'new' | 'pending' | 'processed';
}

// --- Timezone helper ---

/** The local timezone for all date operations (defaults to America/Toronto) */
const LOCAL_TZ = process.env.TIMEZONE || 'America/Toronto';

/** Get "now" in the local timezone as a pseudo-Date with correct local fields */
function localNow(): Date {
  const str = new Date().toLocaleString('en-US', { timeZone: LOCAL_TZ });
  return new Date(str);
}

// --- Date sheet helpers ---

/** Format a date as the sheet tab name, e.g. "Mar 03, 2026" */
export function dateToSheetName(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate().toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${month} ${day}, ${year}`;
}

/** Get today's sheet name using local timezone */
export function getTodaySheetName(): string {
  return dateToSheetName(localNow());
}

/** List all date sheets (excluding Template and other non-date sheets) */
export async function getDateSheets(ctx: SheetsContext): Promise<string[]> {
  const { sheets, spreadsheetId } = ctx;

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const allSheets = spreadsheet.data.sheets || [];

  // Date sheets match pattern like "Mar 03, 2026"
  const datePattern = /^[A-Z][a-z]{2} \d{2}, \d{4}$/;
  return allSheets
    .map((s: any) => s.properties.title as string)
    .filter((name: string) => datePattern.test(name))
    .sort()
    .reverse(); // Most recent first
}

/** Get or create a sheet for the given date by copying Template */
export async function getOrCreateDateSheet(ctx: SheetsContext, date?: Date): Promise<string> {
  const sheetName = date ? dateToSheetName(date) : getTodaySheetName();
  const { sheets, spreadsheetId } = ctx;

  // Check if sheet already exists
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const allSheets = spreadsheet.data.sheets || [];
  const exists = allSheets.some(
    (s: any) => s.properties.title === sheetName
  );

  if (exists) return sheetName;

  // Find the Template sheet ID
  const templateSheet = allSheets.find(
    (s: any) => s.properties.title === 'Template'
  );
  if (!templateSheet) {
    throw new Error('Template sheet not found');
  }
  const templateSheetId = templateSheet.properties!.sheetId!;

  // Duplicate the Template sheet
  const dupResponse = await sheets.spreadsheets.sheets.copyTo({
    spreadsheetId,
    sheetId: templateSheetId,
    requestBody: { destinationSpreadsheetId: spreadsheetId },
  } as any);

  const newSheetId = dupResponse.data.sheetId;

  // Rename the duplicated sheet and ensure it has enough columns (27 = AA)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: { sheetId: newSheetId, title: sheetName },
            fields: 'title',
          },
        },
        {
          updateSheetProperties: {
            properties: {
              sheetId: newSheetId,
              gridProperties: { columnCount: 27 },
            },
            fields: 'gridProperties.columnCount',
          },
        },
      ],
    },
  });

  // Write sheet header layout:
  // A1: Date
  // A3: "TIME BASED FEE" header
  // A4:F4: START, END, HOURS, FEE TYPE, CODE, TOTAL
  // A5:F5: values (auto-populated from shift times)
  const today = date || localNow();
  const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `'${sheetName}'!A1`, values: [[dateStr]] },
        { range: `'${sheetName}'!A3`, values: [['TIME BASED FEE']] },
        { range: `'${sheetName}'!A4:F4`, values: [['START', 'END', 'HOURS', 'FEE TYPE', 'CODE', 'TOTAL']] },
      ],
    },
  });

  return sheetName;
}

/** Ensure a sheet has at least the required number of columns */
async function ensureColumnCount(ctx: SheetsContext, sheetName: string, requiredColumns: number): Promise<void> {
  const { sheets, spreadsheetId } = ctx;

  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetMeta = spreadsheet.data.sheets?.find(
    (s: any) => s.properties.title === sheetName
  );
  if (!sheetMeta) return;

  const currentColumns = sheetMeta.properties?.gridProperties?.columnCount || 26;
  if (currentColumns >= requiredColumns) return;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          updateSheetProperties: {
            properties: {
              sheetId: sheetMeta.properties!.sheetId!,
              gridProperties: { columnCount: requiredColumns },
            },
            fields: 'gridProperties.columnCount',
          },
        },
      ],
    },
  });
}

// --- Shift time helpers (row 5: START, END, HOURS, FEE TYPE, CODE, TOTAL) ---

export interface ShiftTimes {
  start: string;
  end: string;
  hours: string;
  feeType: string;
  code: string;
  total: string;
}

/** Fee type definitions for time-based billing */
const SHIFT_FEE_TYPES = {
  day:   { name: 'Base Fee 0800-2300', code: '0145', rate: 81.80 },
  night: { name: 'Base Fee 2300-0800', code: '0146', rate: 119.60 },
} as const;

/** Determine fee type from shift start time */
function getShiftFeeType(start: string): typeof SHIFT_FEE_TYPES['day'] | typeof SHIFT_FEE_TYPES['night'] {
  if (!start) return SHIFT_FEE_TYPES.day;
  const hour = parseInt(start.split(':')[0], 10);
  return (hour >= 23 || hour < 8) ? SHIFT_FEE_TYPES.night : SHIFT_FEE_TYPES.day;
}

/** Compute shift hours from HH:MM start/end, handling overnight wraps */
function computeShiftHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  let diff = endMin - startMin;
  if (diff <= 0) diff += 24 * 60; // overnight
  return diff / 60;
}

/** Normalize a time value from Google Sheets into HH:MM format for dropdown matching */
function normalizeTime(val: string): string {
  if (!val) return '';
  // Already HH:MM
  const m24 = val.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return m24[1].padStart(2, '0') + ':' + m24[2];
  // Time serial number (e.g. 0.333 for 08:00)
  const num = parseFloat(val);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMin = Math.round(num * 24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0');
  }
  // AM/PM format like "8:00:00 AM"
  const mAP = val.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/i);
  if (mAP) {
    let h = parseInt(mAP[1], 10);
    if (mAP[3].toUpperCase() === 'PM' && h < 12) h += 12;
    if (mAP[3].toUpperCase() === 'AM' && h === 12) h = 0;
    return h.toString().padStart(2, '0') + ':' + mAP[2];
  }
  return val;
}

/** Get shift data from row 5 (A5:F5) */
export async function getShiftTimes(ctx: SheetsContext, sheetName?: string): Promise<ShiftTimes> {
  const sheet = sheetName || getTodaySheetName();
  const { sheets, spreadsheetId } = ctx;

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheet}'!A5:F5`,
      valueRenderOption: 'UNFORMATTED_VALUE',
    });
    const row = response.data.values?.[0] || [];
    return {
      start: normalizeTime(row[0]?.toString() || ''),
      end: normalizeTime(row[1]?.toString() || ''),
      hours: row[2]?.toString() || '',
      feeType: row[3]?.toString() || '',
      code: row[4]?.toString() || '',
      total: row[5]?.toString() || '',
    };
  } catch {
    return { start: '', end: '', hours: '', feeType: '', code: '', total: '' };
  }
}

/** Set shift times in row 5 and auto-populate fee type, code, and total */
export async function setShiftTimes(
  ctx: SheetsContext,
  sheetName: string,
  start: string,
  end: string,
): Promise<ShiftTimes> {
  const { sheets, spreadsheetId } = ctx;

  const feeInfo = getShiftFeeType(start);
  const hours = computeShiftHours(start, end);
  const hoursStr = hours > 0 ? hours.toString() : '';
  const totalStr = hours > 0 ? (hours * feeInfo.rate).toFixed(2) : '';
  const feeType = start ? feeInfo.name : '';
  const code = start ? feeInfo.code : '';

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A5:F5`,
    valueInputOption: 'RAW',
    requestBody: { values: [[start, end, hoursStr, feeType, code, totalStr]] },
  });

  return { start, end, hours: hoursStr, feeType, code, total: totalStr };
}

// --- Multi-row billing helpers ---

/** Get the numeric sheetId for a given sheet name (needed for insert/delete row operations) */
async function getSheetIdByName(ctx: SheetsContext, sheetName: string): Promise<number> {
  const { sheets, spreadsheetId } = ctx;
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetMeta = spreadsheet.data.sheets?.find(
    (s: any) => s.properties.title === sheetName
  );
  if (!sheetMeta) throw new Error(`Sheet "${sheetName}" not found`);
  return sheetMeta.properties!.sheetId!;
}

/** Count continuation rows below a patient row (rows with billing data but no name/transcript) */
async function countContinuationRows(ctx: SheetsContext, rowIndex: number, sheetName: string): Promise<number> {
  const { sheets, spreadsheetId } = ctx;
  const startRow = rowIndex + 1;

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheetName}'!A${startRow}:S${startRow + 20}`,
    });

    const rows = response.data.values || [];
    let count = 0;
    for (const row of rows) {
      const name = row[COLUMNS.PATIENT_NAME]?.toString() || '';
      const transcript = row[COLUMNS.TRANSCRIPT]?.toString() || '';
      const procCode = row[COLUMNS.PROC_CODE]?.toString() || '';
      if (!name && !transcript && procCode) {
        count++;
      } else {
        break;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

/** Save billing items as multi-row data (first item on patient row, rest on continuation rows below) */
export async function saveBillingRows(
  ctx: SheetsContext,
  rowIndex: number,
  items: BillingItem[],
  sheetName?: string
): Promise<void> {
  const sheet = sheetName || getTodaySheetName();
  const { sheets, spreadsheetId } = ctx;

  const existingCont = await countContinuationRows(ctx, rowIndex, sheet);
  const neededCont = Math.max(0, items.length - 1);

  // Insert or delete continuation rows to match
  if (neededCont > existingCont) {
    const toInsert = neededCont - existingCont;
    const sheetId = await getSheetIdByName(ctx, sheet);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          insertDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex, // 0-indexed = after patient row (rowIndex is 1-indexed)
              endIndex: rowIndex + toInsert,
            },
            inheritFromBefore: false,
          },
        }],
      },
    });
  } else if (neededCont < existingCont) {
    const toDelete = existingCont - neededCont;
    const sheetId = await getSheetIdByName(ctx, sheet);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex, // first continuation row (0-indexed)
              endIndex: rowIndex + toDelete,
            },
          },
        }],
      },
    });
  }

  // Build batch data for all billing rows
  const batchData: { range: string; values: string[][] }[] = [];

  if (items.length === 0) {
    // Clear billing columns on patient row
    batchData.push({
      range: `'${sheet}'!L${rowIndex}:P${rowIndex}`,
      values: [['', '', '', '', '']],
    });
  } else {
    for (let i = 0; i < items.length; i++) {
      const targetRow = rowIndex + i; // i=0 is patient row, i>0 are continuation rows
      const lineTotal = '';  // individual line totals left blank
      batchData.push({
        range: `'${sheet}'!L${targetRow}:P${targetRow}`,
        values: [[items[i].description, items[i].code, items[i].fee, items[i].unit || '1', lineTotal]],
      });
    }
    // Write grand total on patient row column P
    const grandTotal = calculateTotal(items);
    batchData.push({
      range: `'${sheet}'!P${rowIndex}`,
      values: [[grandTotal]],
    });
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: batchData,
    },
  });
}

/** Clear all data in a patient row and delete any continuation rows below */
export async function clearPatientRow(
  ctx: SheetsContext,
  rowIndex: number,
  sheetName?: string
): Promise<void> {
  const sheet = sheetName || getTodaySheetName();
  const { sheets, spreadsheetId } = ctx;

  // Delete continuation rows first
  const contCount = await countContinuationRows(ctx, rowIndex, sheet);
  if (contCount > 0) {
    const sheetId = await getSheetIdByName(ctx, sheet);
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: rowIndex, // 0-indexed = first continuation row
              endIndex: rowIndex + contCount,
            },
          },
        }],
      },
    });
  }

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${sheet}'!A${rowIndex}:Z${rowIndex}`,
  });
}

// --- Patient CRUD operations (now date-sheet aware) ---

/** Fetch all patients from a specific date sheet (merges continuation rows for multi-row billing) */
export async function getPatients(ctx: SheetsContext, sheetName?: string): Promise<Patient[]> {
  const sheet = sheetName || getTodaySheetName();
  const { sheets, spreadsheetId } = ctx;

  // Check if the sheet exists first
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = spreadsheet.data.sheets?.some(
    (s: any) => s.properties.title === sheet
  );
  if (!exists) return [];

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheet}'!A${DATA_START_ROW}:AA200`,
  });

  const rows = response.data.values || [];
  const patients: Patient[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = row[COLUMNS.PATIENT_NAME]?.toString() || '';
    const transcript = row[COLUMNS.TRANSCRIPT]?.toString() || '';
    const procCode = row[COLUMNS.PROC_CODE]?.toString() || '';

    if (name || transcript) {
      // Patient row
      patients.push(rowToPatient(row, i + DATA_START_ROW, sheet));
    } else if (procCode && patients.length > 0) {
      // Continuation row — merge billing into previous patient
      const prev = patients[patients.length - 1];
      const desc = row[COLUMNS.VISIT_PROCEDURE]?.toString() || '';
      const fee = row[COLUMNS.FEE]?.toString() || '';
      const unit = row[COLUMNS.UNIT]?.toString() || '';
      prev.visitProcedure = prev.visitProcedure ? `${prev.visitProcedure}\n${desc}` : desc;
      prev.procCode = prev.procCode ? `${prev.procCode}\n${procCode}` : procCode;
      prev.fee = prev.fee ? `${prev.fee}\n${fee}` : fee;
      prev.unit = prev.unit ? `${prev.unit}\n${unit}` : unit;
    }
  }

  return patients;
}

/** Get a single patient by row index and sheet name (includes continuation rows for billing) */
export async function getPatient(ctx: SheetsContext, rowIndex: number, sheetName?: string): Promise<Patient | null> {
  const sheet = sheetName || getTodaySheetName();
  const { sheets, spreadsheetId } = ctx;

  // Read patient row + up to 20 continuation rows below
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheet}'!A${rowIndex}:AA${rowIndex + 20}`,
  });

  const rows = response.data.values || [];
  if (rows.length === 0) return null;

  const patient = rowToPatient(rows[0], rowIndex, sheet);

  // Merge continuation rows
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const name = row[COLUMNS.PATIENT_NAME]?.toString() || '';
    const transcript = row[COLUMNS.TRANSCRIPT]?.toString() || '';
    const procCode = row[COLUMNS.PROC_CODE]?.toString() || '';

    if (!name && !transcript && procCode) {
      const desc = row[COLUMNS.VISIT_PROCEDURE]?.toString() || '';
      const fee = row[COLUMNS.FEE]?.toString() || '';
      const unit = row[COLUMNS.UNIT]?.toString() || '';
      patient.visitProcedure = patient.visitProcedure ? `${patient.visitProcedure}\n${desc}` : desc;
      patient.procCode = patient.procCode ? `${patient.procCode}\n${procCode}` : procCode;
      patient.fee = patient.fee ? `${patient.fee}\n${fee}` : fee;
      patient.unit = patient.unit ? `${patient.unit}\n${unit}` : unit;
    } else {
      break;
    }
  }

  return patient;
}

/** Update specific columns for a patient */
export async function updatePatientFields(
  ctx: SheetsContext,
  rowIndex: number,
  fields: Record<string, string>,
  sheetName?: string
): Promise<void> {
  const sheet = sheetName || getTodaySheetName();
  const { sheets, spreadsheetId } = ctx;

  const columnMap: Record<string, string> = {
    patientNum: 'A', name: 'C', age: 'D', gender: 'E', birthday: 'F',
    hcn: 'G', mrn: 'H', diagnosis: 'I', timestamp: 'B',
    icd9: 'J', icd10: 'K',
    visitProcedure: 'L', procCode: 'M', fee: 'N', unit: 'O', total: 'P', comments: 'Q',
    triageVitals: 'R', transcript: 'S', additional: 'T',
    ddx: 'U', investigations: 'V', hpi: 'W',
    objective: 'X', assessmentPlan: 'Y', referral: 'Z',
    pastDocs: 'AA',
  };

  const data = Object.entries(fields)
    .filter(([field]) => columnMap[field])
    .map(([field, value]) => ({
      range: `'${sheet}'!${columnMap[field]}${rowIndex}`,
      values: [[value]],
    }));

  if (data.length === 0) return;

  // If writing to columns beyond Z, ensure the sheet has enough columns
  const needsExpand = data.some(d => d.range.includes('!AA'));
  if (needsExpand) {
    await ensureColumnCount(ctx, sheet, 27);
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });
}

/** Find the next empty row in a sheet (skips continuation rows) */
export async function getNextEmptyRow(ctx: SheetsContext, sheetName?: string): Promise<number> {
  const sheet = sheetName || getTodaySheetName();
  const { sheets, spreadsheetId } = ctx;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheet}'!A${DATA_START_ROW}:S200`,
  });

  const rows = response.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    const name = rows[i]?.[COLUMNS.PATIENT_NAME]?.toString() || '';
    const transcript = rows[i]?.[COLUMNS.TRANSCRIPT]?.toString() || '';
    const procCode = rows[i]?.[COLUMNS.PROC_CODE]?.toString() || '';
    // A truly empty row has no name, no transcript, and no proc code
    if (!name && !transcript && !procCode) {
      return DATA_START_ROW + i;
    }
  }

  return DATA_START_ROW + rows.length;
}

/** Get the count of patients in a sheet (for auto-numbering) */
export async function getPatientCount(ctx: SheetsContext, sheetName?: string): Promise<number> {
  const sheet = sheetName || getTodaySheetName();
  const { sheets, spreadsheetId } = ctx;

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheet}'!C${DATA_START_ROW}:C100`,
  });

  const rows = response.data.values || [];
  return rows.filter(r => r && r[0]).length;
}

// Convert a row array to a Patient object
function rowToPatient(row: string[], rowIndex: number, sheetName: string): Patient {
  const getValue = (col: number) => row[col]?.toString() || '';

  const hpi = getValue(COLUMNS.HPI);
  const assessmentPlan = getValue(COLUMNS.ASSESSMENT_PLAN);
  const transcript = getValue(COLUMNS.TRANSCRIPT);

  let status: 'new' | 'pending' | 'processed' = 'new';
  if (hpi || assessmentPlan) {
    status = 'processed';
  } else if (transcript) {
    status = 'pending';
  }

  return {
    rowIndex,
    sheetName,
    patientNum: getValue(COLUMNS.PATIENT_NUM),
    timestamp: getValue(COLUMNS.TIMESTAMP),
    name: getValue(COLUMNS.PATIENT_NAME),
    age: getValue(COLUMNS.AGE),
    gender: getValue(COLUMNS.GENDER),
    birthday: getValue(COLUMNS.BIRTHDAY),
    hcn: getValue(COLUMNS.HCN),
    mrn: getValue(COLUMNS.MRN),
    diagnosis: getValue(COLUMNS.DIAGNOSIS),
    icd9: getValue(COLUMNS.ICD9),
    icd10: getValue(COLUMNS.ICD10),
    visitProcedure: getValue(COLUMNS.VISIT_PROCEDURE),
    procCode: getValue(COLUMNS.PROC_CODE),
    fee: getValue(COLUMNS.FEE),
    unit: getValue(COLUMNS.UNIT),
    total: getValue(COLUMNS.TOTAL),
    comments: getValue(COLUMNS.COMMENTS),
    triageVitals: getValue(COLUMNS.TRIAGE_VITALS),
    transcript: getValue(COLUMNS.TRANSCRIPT),
    additional: getValue(COLUMNS.ADDITIONAL),
    ddx: getValue(COLUMNS.DDX),
    investigations: getValue(COLUMNS.INVESTIGATIONS),
    hpi: getValue(COLUMNS.HPI),
    objective: getValue(COLUMNS.OBJECTIVE),
    assessmentPlan: getValue(COLUMNS.ASSESSMENT_PLAN),
    referral: getValue(COLUMNS.REFERRAL),
    pastDocs: getValue(COLUMNS.PAST_DOCS),
    hasOutput: !!(hpi || assessmentPlan),
    status,
  };
}

// --- Billing Codes Sheet ---

const BILLING_SHEET_NAME = 'Billing Codes';

/** Read billing codes from the "Billing Codes" sheet tab. Columns: A=Code, B=Description, C=Fee */
export async function getBillingCodes(ctx: SheetsContext): Promise<BillingCode[]> {
  const { sheets, spreadsheetId } = ctx;

  // Check if the sheet exists
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = spreadsheet.data.sheets?.some(
    (s: any) => s.properties.title === BILLING_SHEET_NAME
  );
  if (!exists) return [];

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${BILLING_SHEET_NAME}'!A2:C500`,
  });

  const rows = response.data.values || [];
  return rows
    .filter((row: any[]) => row[0]?.toString().trim())
    .map((row: any[]) => ({
      code: row[0]?.toString().trim() || '',
      description: row[1]?.toString().trim() || '',
      fee: row[2]?.toString().trim() || '',
    }))
    .sort((a: BillingCode, b: BillingCode) => a.description.localeCompare(b.description));
}

// --- Style Guide Sheet ---

const STYLE_GUIDE_SHEET = 'Style Guide';

const DEFAULT_STYLE_GUIDE: StyleGuide = {
  examples: { hpi: [], objective: [], assessmentPlan: [] },
  extractedFeatures: [],
  customGuidance: '',
};

/** Read the style guide JSON blob from the "Style Guide" tab B2. Returns default if missing. */
export async function getStyleGuideFromSheet(ctx: SheetsContext): Promise<StyleGuide> {
  const { sheets, spreadsheetId } = ctx;

  try {
    const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
    const exists = spreadsheet.data.sheets?.some(
      (s: any) => s.properties.title === STYLE_GUIDE_SHEET
    );
    if (!exists) return { ...DEFAULT_STYLE_GUIDE };

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${STYLE_GUIDE_SHEET}'!B2`,
    });
    const raw = response.data.values?.[0]?.[0]?.toString();
    if (!raw) return { ...DEFAULT_STYLE_GUIDE };

    const parsed = JSON.parse(raw);
    return {
      examples: parsed.examples || { hpi: [], objective: [], assessmentPlan: [] },
      extractedFeatures: parsed.extractedFeatures || [],
      customGuidance: parsed.customGuidance || '',
    };
  } catch {
    return { ...DEFAULT_STYLE_GUIDE };
  }
}

/** Save style guide as JSON blob to "Style Guide" tab B2. Auto-creates the tab if needed. */
export async function saveStyleGuideToSheet(ctx: SheetsContext, guide: StyleGuide): Promise<void> {
  const { sheets, spreadsheetId } = ctx;

  // Check if tab exists, create if not
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = spreadsheet.data.sheets?.some(
    (s: any) => s.properties.title === STYLE_GUIDE_SHEET
  );

  if (!exists) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{
          addSheet: {
            properties: { title: STYLE_GUIDE_SHEET },
          },
        }],
      },
    });

    // Write headers
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${STYLE_GUIDE_SHEET}'!A1:B1`,
      valueInputOption: 'RAW',
      requestBody: { values: [['key', 'value']] },
    });

    // Write key label
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `'${STYLE_GUIDE_SHEET}'!A2`,
      valueInputOption: 'RAW',
      requestBody: { values: [['styleGuide']] },
    });
  }

  // Write JSON blob
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${STYLE_GUIDE_SHEET}'!B2`,
    valueInputOption: 'RAW',
    requestBody: { values: [[JSON.stringify(guide)]] },
  });
}
