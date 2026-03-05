/**
 * One-time script to format the Template sheet in the spreadsheet
 * to match the old ED_Template formatting.
 *
 * Run with: npx ts-node --skip-project scripts/setup-template.ts
 */

const { google } = require('googleapis');

const COLORS = {
  orange: { red: 0.929, green: 0.490, blue: 0.192 },
  peach: { red: 0.988, green: 0.894, blue: 0.839 },
  blue: { red: 0.267, green: 0.447, blue: 0.769 },
  green: { red: 0.439, green: 0.678, blue: 0.278 },
  purple: { red: 0.439, green: 0.188, blue: 0.627 },
  altRow: { red: 0.839, green: 0.863, blue: 0.898 },
  white: { red: 1, green: 1, blue: 1 },
};

const COLUMN_WIDTHS = [
  27, 55, 174, 34, 34, 83, 83, 83,   // A-H
  174, 55, 69,                         // I-K
  153, 55, 55, 41, 69, 139,           // L-Q
  209, 279, 209, 209, 209, 279, 209, 279, 209, // R-Z
];

async function main() {
  const credsJson = process.env.GOOGLE_CREDENTIALS;
  if (!credsJson) {
    console.error('Set GOOGLE_CREDENTIALS env var');
    process.exit(1);
  }
  const credentials = JSON.parse(credsJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) {
    console.error('Set GOOGLE_SHEETS_ID env var');
    process.exit(1);
  }

  // Get the Template sheet ID
  const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
  const templateSheet = spreadsheet.data.sheets.find(
    (s: any) => s.properties.title === 'Template'
  );
  if (!templateSheet) {
    console.error('Template sheet not found');
    process.exit(1);
  }
  const sheetId = templateSheet.properties.sheetId;

  // Build batch update requests
  const requests: any[] = [];

  // --- Clear existing data in rows 1-7 ---
  requests.push({
    updateCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 7, startColumnIndex: 0, endColumnIndex: 26 },
      fields: 'userEnteredValue,userEnteredFormat',
    },
  });

  // --- Set column widths ---
  COLUMN_WIDTHS.forEach((width, i) => {
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
        properties: { pixelSize: width },
        fields: 'pixelSize',
      },
    });
  });

  // --- Freeze 7 header rows ---
  requests.push({
    updateSheetProperties: {
      properties: { sheetId, gridProperties: { frozenRowCount: 7 } },
      fields: 'gridProperties.frozenRowCount',
    },
  });

  // --- Row 1: TIME-BASED FEES header (merged A1:F1, orange bg) ---
  requests.push({
    mergeCells: {
      range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 6 },
      mergeType: 'MERGE_ALL',
    },
  });
  requests.push(
    formatCell(sheetId, 0, 0, 'TIME-BASED FEES', { bold: true, fontSize: 12, bg: COLORS.orange, fontColor: { red: 1, green: 1, blue: 1 } })
  );

  // --- Row 2: Time fee headers (peach bg) ---
  const row2Headers = ['Date', 'Start', 'End', 'Hours', 'Fee Type', 'Total'];
  row2Headers.forEach((header, i) => {
    requests.push(
      formatCell(sheetId, 1, i, header, { bold: true, fontSize: 11, bg: COLORS.peach })
    );
  });

  // --- Row 6: PATIENT ENCOUNTERS header (merged A6:T6, blue bg) ---
  requests.push({
    mergeCells: {
      range: { sheetId, startRowIndex: 5, endRowIndex: 6, startColumnIndex: 0, endColumnIndex: 20 },
      mergeType: 'MERGE_ALL',
    },
  });
  requests.push(
    formatCell(sheetId, 5, 0, 'PATIENT ENCOUNTERS', { bold: true, fontSize: 12, bg: COLORS.blue, fontColor: { red: 1, green: 1, blue: 1 } })
  );

  // --- Row 7: Column headers with color groups ---
  const headers = [
    { cols: ['#', 'Time', 'Name', 'Age', 'Sex', 'DOB', 'HCN', 'MRN'], bg: COLORS.blue, fontColor: { red: 1, green: 1, blue: 1 } },
    { cols: ['Diagnosis', 'ICD-9', 'ICD-10'], bg: COLORS.green, fontColor: { red: 1, green: 1, blue: 1 } },
    { cols: ['Visit/Procedure', 'Code', 'Fee', 'Unit', 'Total', 'Comments'], bg: COLORS.orange, fontColor: { red: 1, green: 1, blue: 1 } },
    { cols: ['Triage', 'Transcript', 'Additional', 'DDx', 'Investigations', 'HPI', 'Objective', 'A+P', 'Referral'], bg: COLORS.purple, fontColor: { red: 1, green: 1, blue: 1 } },
  ];

  let colIdx = 0;
  headers.forEach((group) => {
    group.cols.forEach((header) => {
      requests.push(
        formatCell(sheetId, 6, colIdx, header, { bold: true, fontSize: 11, bg: group.bg, fontColor: group.fontColor })
      );
      colIdx++;
    });
  });

  // --- Alternating row colors for data rows (rows 8-50) ---
  for (let row = 7; row < 50; row++) {
    const bg = row % 2 === 0 ? COLORS.white : COLORS.altRow;
    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: 0, endColumnIndex: 26 },
        cell: {
          userEnteredFormat: {
            backgroundColor: bg,
            textFormat: { fontSize: 11 },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat.fontSize)',
      },
    });
  }

  // Execute all formatting
  console.log(`Sending ${requests.length} formatting requests...`);
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests },
  });

  // --- Write header values via values API ---
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: [
        { range: 'Template!A1', values: [['TIME-BASED FEES']] },
        { range: 'Template!A2:F2', values: [['Date', 'Start', 'End', 'Hours', 'Fee Type', 'Total']] },
        { range: 'Template!A6', values: [['PATIENT ENCOUNTERS']] },
        {
          range: 'Template!A7:Z7',
          values: [['#', 'Time', 'Name', 'Age', 'Sex', 'DOB', 'HCN', 'MRN',
            'Diagnosis', 'ICD-9', 'ICD-10',
            'Visit/Procedure', 'Code', 'Fee', 'Unit', 'Total', 'Comments',
            'Triage', 'Transcript', 'Additional', 'DDx', 'Investigations', 'HPI', 'Objective', 'A+P', 'Referral']],
        },
      ],
    },
  });

  console.log('Template sheet formatted successfully!');
}

function formatCell(
  sheetId: number,
  row: number,
  col: number,
  value: string,
  opts: { bold?: boolean; fontSize?: number; bg?: any; fontColor?: any }
) {
  return {
    updateCells: {
      rows: [
        {
          values: [
            {
              userEnteredValue: { stringValue: value },
              userEnteredFormat: {
                backgroundColor: opts.bg,
                textFormat: {
                  bold: opts.bold || false,
                  fontSize: opts.fontSize || 11,
                  foregroundColor: opts.fontColor || { red: 0, green: 0, blue: 0 },
                },
              },
            },
          ],
        },
      ],
      range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex: col, endColumnIndex: col + 1 },
      fields: 'userEnteredValue,userEnteredFormat',
    },
  };
}

main().catch(console.error);
