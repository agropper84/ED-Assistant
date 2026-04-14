import { google, type Auth } from 'googleapis';

const HEADER_ROW = 7; // Row 7 has column headers (1-indexed)

// Billing sheet headers (columns A-Q)
const BILLING_HEADERS = [
  '#',             // A - Patient number
  'Time',          // B - Encounter time
  'Patient Name',  // C
  'Age',           // D
  'Gender',        // E
  'DOB',           // F - Date of birth
  'HCN',           // G - Health card number
  'MRN',           // H - Medical record number
  'Diagnosis',     // I
  'ICD-9',         // J
  'ICD-10',        // K
  'Procedure',     // L - Visit procedure description
  'Code',          // M - Billing code
  'Fee',           // N - Fee amount
  'Unit',          // O - Number of units
  'Total',         // P - Total fee
  'Comments',      // Q - Billing comments
];

// Legacy: full headers for backward compat (A-AJ in single sheet)
const LEGACY_HEADERS = [
  ...BILLING_HEADERS,
  'Triage/Vitals',     // R
  'Transcript',        // S
  'Additional',        // T
  'DDx',               // U
  'Investigations',    // V
  'HPI',               // W
  'Objective',         // X
  'Assessment & Plan', // Y
  'Referral',          // Z
  'Past Docs',         // AA
  'Synopsis',          // AB
  'Management',        // AC
  'Evidence',          // AD
  'A&P Notes',         // AE
  'Clinical Q&A',      // AF
  'Education',         // AG
  'Encounter Notes',   // AH
  'Admission',         // AI
  'Profile',           // AJ
];

export async function createUserSpreadsheet(
  auth: Auth.OAuth2Client,
  userEmail: string
): Promise<string> {
  const sheets = google.sheets({ version: 'v4', auth });

  // Create spreadsheet with a Template sheet
  const response = await sheets.spreadsheets.create({
    requestBody: {
      properties: {
        title: `ED Assistant - ${userEmail}`,
      },
      sheets: [
        {
          properties: {
            title: 'Template',
            gridProperties: {
              rowCount: 200,
              columnCount: 36, // A through AJ
            },
          },
        },
      ],
    },
  });

  const spreadsheetId = response.data.spreadsheetId!;
  const sheetId = response.data.sheets![0].properties!.sheetId!;

  // Write full legacy header row at row 7
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'Template'!A${HEADER_ROW}:AJ${HEADER_ROW}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [LEGACY_HEADERS],
    },
  });

  // Apply formatting
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Bold the header row
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: HEADER_ROW - 1,
              endRowIndex: HEADER_ROW,
              startColumnIndex: 0,
              endColumnIndex: 36,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
                backgroundColor: { red: 0.9, green: 0.9, blue: 0.95 },
              },
            },
            fields: 'userEnteredFormat(textFormat,backgroundColor)',
          },
        },
        // Freeze header rows
        {
          updateSheetProperties: {
            properties: {
              sheetId,
              gridProperties: { frozenRowCount: HEADER_ROW },
            },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        // Column widths
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
            properties: { pixelSize: 180 },
            fields: 'pixelSize',
          },
        },
      ],
    },
  });

  return spreadsheetId;
}
