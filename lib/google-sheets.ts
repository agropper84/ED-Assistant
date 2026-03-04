import { google } from 'googleapis';

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

// Initialize Google Sheets client
function getAuthClient() {
  if (process.env.GOOGLE_CREDENTIALS) {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    return new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getSheets() {
  const auth = getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

function getSpreadsheetId() {
  return process.env.GOOGLE_SHEETS_ID!;
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
export async function getDateSheets(): Promise<string[]> {
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();

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
export async function getOrCreateDateSheet(date?: Date): Promise<string> {
  const sheetName = date ? dateToSheetName(date) : getTodaySheetName();
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();

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
  // A4:E4: START, END, HOURS, FEE, TOTAL
  // A5:E5: values (start with formulas for HOURS and TOTAL)
  const today = date || localNow();
  const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: `'${sheetName}'!A1`, values: [[dateStr]] },
        { range: `'${sheetName}'!A3`, values: [['TIME BASED FEE']] },
        { range: `'${sheetName}'!A4:E4`, values: [['START', 'END', 'HOURS', 'FEE', 'TOTAL']] },
      ],
    },
  });

  return sheetName;
}

/** Ensure a sheet has at least the required number of columns */
async function ensureColumnCount(sheetName: string, requiredColumns: number): Promise<void> {
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();

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

// --- Shift time helpers (row 5: START, END, HOURS, FEE, TOTAL) ---

export interface ShiftTimes {
  start: string;
  end: string;
  hours: string;
  fee: string;
  total: string;
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

/** Get shift data from row 5 (A5:E5) */
export async function getShiftTimes(sheetName?: string): Promise<ShiftTimes> {
  const sheet = sheetName || getTodaySheetName();
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();

  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'${sheet}'!A5:E5`,
    });
    const row = response.data.values?.[0] || [];
    return {
      start: row[0]?.toString() || '',
      end: row[1]?.toString() || '',
      hours: row[2]?.toString() || '',
      fee: row[3]?.toString() || '',
      total: row[4]?.toString() || '',
    };
  } catch {
    return { start: '', end: '', hours: '', fee: '', total: '' };
  }
}

/** Set shift times in row 5 and compute hours + total */
export async function setShiftTimes(
  sheetName: string,
  start: string,
  end: string,
  fee?: string
): Promise<ShiftTimes> {
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();

  // If fee not provided, try to read existing fee from D5
  let currentFee = fee ?? '';
  if (fee === undefined) {
    try {
      const res = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!D5`,
      });
      currentFee = res.data.values?.[0]?.[0]?.toString() || '';
    } catch {}
  }

  const hours = computeShiftHours(start, end);
  const hoursStr = hours > 0 ? hours.toString() : '';
  const feeNum = parseFloat(currentFee);
  const totalStr = hours > 0 && !isNaN(feeNum) ? (hours * feeNum).toFixed(2) : '';

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'${sheetName}'!A5:E5`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [[start, end, hoursStr, currentFee, totalStr]] },
  });

  return { start, end, hours: hoursStr, fee: currentFee, total: totalStr };
}

/** Clear all data in a patient row (for deletion) */
export async function clearPatientRow(
  rowIndex: number,
  sheetName?: string
): Promise<void> {
  const sheet = sheetName || getTodaySheetName();
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();

  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `'${sheet}'!A${rowIndex}:Z${rowIndex}`,
  });
}

// --- Patient CRUD operations (now date-sheet aware) ---

/** Fetch all patients from a specific date sheet */
export async function getPatients(sheetName?: string): Promise<Patient[]> {
  const sheet = sheetName || getTodaySheetName();
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();

  // Check if the sheet exists first
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const exists = spreadsheet.data.sheets?.some(
    (s: any) => s.properties.title === sheet
  );
  if (!exists) return [];

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheet}'!A${DATA_START_ROW}:Z100`,
  });

  const rows = response.data.values || [];

  return rows
    .map((row, index) => rowToPatient(row, index + DATA_START_ROW, sheet))
    .filter(p => p.name || p.transcript);
}

/** Get a single patient by row index and sheet name */
export async function getPatient(rowIndex: number, sheetName?: string): Promise<Patient | null> {
  const sheet = sheetName || getTodaySheetName();
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheet}'!A${rowIndex}:Z${rowIndex}`,
  });

  const rows = response.data.values || [];
  if (rows.length === 0) return null;

  return rowToPatient(rows[0], rowIndex, sheet);
}

/** Update specific columns for a patient */
export async function updatePatientFields(
  rowIndex: number,
  fields: Record<string, string>,
  sheetName?: string
): Promise<void> {
  const sheet = sheetName || getTodaySheetName();
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();

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
    await ensureColumnCount(sheet, 27);
  }

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });
}

/** Find the next empty row in a sheet */
export async function getNextEmptyRow(sheetName?: string): Promise<number> {
  const sheet = sheetName || getTodaySheetName();
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `'${sheet}'!C${DATA_START_ROW}:C100`,
  });

  const rows = response.data.values || [];

  for (let i = 0; i < rows.length; i++) {
    if (!rows[i] || !rows[i][0]) {
      return DATA_START_ROW + i;
    }
  }

  return DATA_START_ROW + rows.length;
}

/** Get the count of patients in a sheet (for auto-numbering) */
export async function getPatientCount(sheetName?: string): Promise<number> {
  const sheet = sheetName || getTodaySheetName();
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();

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
