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
};

export const DATA_START_ROW = 8; // Row 8 in spreadsheet (0-indexed: 7)

export interface Patient {
  rowIndex: number;
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
  // Computed
  hasOutput: boolean;
  status: 'new' | 'pending' | 'processed';
}

// Initialize Google Sheets client
function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

function getSheets() {
  const auth = getAuthClient();
  return google.sheets({ version: 'v4', auth });
}

// Fetch all patients from the sheet
export async function getPatients(): Promise<Patient[]> {
  const sheets = getSheets();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Template';

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A${DATA_START_ROW}:Z100`,
  });

  const rows = response.data.values || [];
  
  return rows
    .map((row, index) => rowToPatient(row, index + DATA_START_ROW))
    .filter(p => p.name || p.transcript); // Only return rows with data
}

// Get a single patient by row index
export async function getPatient(rowIndex: number): Promise<Patient | null> {
  const sheets = getSheets();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Template';

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A${rowIndex}:Z${rowIndex}`,
  });

  const rows = response.data.values || [];
  if (rows.length === 0) return null;
  
  return rowToPatient(rows[0], rowIndex);
}

// Update a patient row
export async function updatePatient(rowIndex: number, data: Partial<Patient>): Promise<void> {
  const sheets = getSheets();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Template';

  // Build the row array
  const values = [
    data.patientNum || '',
    data.timestamp || '',
    data.name || '',
    data.age || '',
    data.gender || '',
    data.birthday || '',
    data.hcn || '',
    data.mrn || '',
    data.diagnosis || '',
    data.icd9 || '',
    data.icd10 || '',
    data.visitProcedure || '',
    data.procCode || '',
    data.fee || '',
    data.unit || '',
    data.total || '',
    data.comments || '',
    data.triageVitals || '',
    data.transcript || '',
    data.additional || '',
    data.ddx || '',
    data.investigations || '',
    data.hpi || '',
    data.objective || '',
    data.assessmentPlan || '',
    data.referral || '',
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetName}!A${rowIndex}:Z${rowIndex}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [values] },
  });
}

// Update specific columns only
export async function updatePatientFields(
  rowIndex: number, 
  fields: Record<string, string>
): Promise<void> {
  const sheets = getSheets();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Template';

  // Get column letters for each field
  const columnMap: Record<string, string> = {
    name: 'C', age: 'D', gender: 'E', birthday: 'F',
    hcn: 'G', mrn: 'H', diagnosis: 'I', timestamp: 'B',
    triageVitals: 'R', transcript: 'S', additional: 'T',
    ddx: 'U', investigations: 'V', hpi: 'W',
    objective: 'X', assessmentPlan: 'Y', referral: 'Z',
  };

  // Batch update
  const data = Object.entries(fields).map(([field, value]) => ({
    range: `${sheetName}!${columnMap[field]}${rowIndex}`,
    values: [[value]],
  }));

  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data,
    },
  });
}

// Convert a row array to a Patient object
function rowToPatient(row: string[], rowIndex: number): Patient {
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
    hasOutput: !!(hpi || assessmentPlan),
    status,
  };
}

// Find the next empty row
export async function getNextEmptyRow(): Promise<number> {
  const sheets = getSheets();
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  const sheetName = process.env.GOOGLE_SHEET_NAME || 'Template';

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!C${DATA_START_ROW}:C100`,
  });

  const rows = response.data.values || [];
  
  // Find first empty row
  for (let i = 0; i < rows.length; i++) {
    if (!rows[i] || !rows[i][0]) {
      return DATA_START_ROW + i;
    }
  }
  
  return DATA_START_ROW + rows.length;
}
