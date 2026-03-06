import { google, type Auth } from 'googleapis';

const HEADER_ROW = 7; // Row 7 has column headers (1-indexed)

const HEADERS = [
  '#',           // A
  'Time',        // B
  'Patient Name',// C
  'Age',         // D
  'Gender',      // E
  'DOB',         // F
  'HCN',         // G
  'MRN',         // H
  'Diagnosis',   // I
  'ICD-9',       // J
  'ICD-10',      // K
  'Procedure',   // L
  'Code',        // M
  'Fee',         // N
  'Unit',        // O
  'Total',       // P
  'Comments',    // Q
  'Triage/Vitals',// R
  'Transcript',  // S
  'Additional',  // T
  'DDx',         // U
  'Investigations',// V
  'HPI',         // W
  'Objective',   // X
  'Assessment & Plan', // Y
  'Referral',    // Z
  'Past Docs',   // AA
  'Synopsis',    // AB
  'Management',  // AC
  'Evidence',    // AD
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
              columnCount: 30, // A through AD
            },
          },
        },
      ],
    },
  });

  const spreadsheetId = response.data.spreadsheetId!;
  const sheetId = response.data.sheets![0].properties!.sheetId!;

  // Write header row at row 7
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `'Template'!A${HEADER_ROW}:AD${HEADER_ROW}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: [HEADERS],
    },
  });

  // Apply formatting: bold header row, freeze rows above data
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        // Bold the header row
        {
          repeatCell: {
            range: {
              sheetId,
              startRowIndex: HEADER_ROW - 1, // 0-indexed
              endRowIndex: HEADER_ROW,
              startColumnIndex: 0,
              endColumnIndex: 30,
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
        // Set column widths for key columns
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, // C: Patient Name
            properties: { pixelSize: 180 },
            fields: 'pixelSize',
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: 17, endIndex: 20 }, // R-T: Triage, Transcript, Additional
            properties: { pixelSize: 300 },
            fields: 'pixelSize',
          },
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: 'COLUMNS', startIndex: 22, endIndex: 25 }, // W-Y: HPI, Objective, Assessment
            properties: { pixelSize: 400 },
            fields: 'pixelSize',
          },
        },
      ],
    },
  });

  return spreadsheetId;
}
