import { NextRequest, NextResponse } from 'next/server';
import { getDataContext } from '@/lib/data-layer';
import ExcelJS from 'exceljs';

// GET /api/export-billing?start=2026-03-01&end=2026-03-16&format=yukon|vch
export async function GET(req: NextRequest) {
  try {
    const ctx = await getDataContext();
    const { searchParams } = new URL(req.url);
    const startStr = searchParams.get('start') || '';
    const endStr = searchParams.get('end') || '';
    const format = searchParams.get('format') || 'yukon';

    if (!startStr || !endStr) {
      return NextResponse.json({ error: 'start and end dates required' }, { status: 400 });
    }

    const startDate = new Date(startStr);
    const endDate = new Date(endStr);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid dates' }, { status: 400 });
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (format === 'vch') {
      const buffer = await exportVchExcel(ctx.sheets, startDate, endDate);
      return new NextResponse(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="billing-vch-${startStr}-to-${endStr}.xlsx"`,
        },
      });
    } else {
      const buffer = await exportYukonExcel(ctx.sheets, startDate, endDate, months);
      return new NextResponse(buffer as unknown as BodyInit, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="billing-yukon-${startStr}-to-${endStr}.xlsx"`,
        },
      });
    }
  } catch (err: any) {
    if (err.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Export billing error:', err);
    return NextResponse.json({ error: 'Failed to export billing' }, { status: 500 });
  }
}

// --- VCH Excel export (Bella Coola format) ---

async function exportVchExcel(ctx: any, startDate: Date, endDate: Date): Promise<Buffer> {
  const { sheets, spreadsheetId } = ctx;

  // Read all VCH billing rows from the sheet
  let allRows: any[][] = [];
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `'VCH Billing'!A2:P500`,
    });
    allRows = res.data.values || [];
  } catch {}

  // Filter rows within the date range
  const filteredRows = allRows.filter((row: any[]) => {
    const dateStr = row[4]?.toString().trim();
    if (!dateStr) return false;
    const rowDate = new Date(dateStr);
    if (isNaN(rowDate.getTime())) return false;
    rowDate.setHours(0, 0, 0, 0);
    const start = new Date(startDate); start.setHours(0, 0, 0, 0);
    const end = new Date(endDate); end.setHours(0, 0, 0, 0);
    return rowDate >= start && rowDate <= end;
  });

  // Build Excel workbook matching Bella Coola format
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('VCH Billing');

  // Column headers (matching Bella Coola)
  const headers = [
    'CPRP ID', 'SITE/FACILITY NAME', 'PRAC #', 'PRACTITIONER NAME (Last, First)',
    'SERVICE START DATE (yyyy-mm-dd)', 'SERVICE END DATE (yyyy-mm-dd)', 'RATE PERIOD',
    'ACTUAL SERVICE START TIME', 'ACTUAL SERVICE END TIME',
    'SCHEDULED / UNSCHEDULED', 'ONSITE / OFFSITE',
    'DIRECT AND INDIRECT HOURS', 'DIRECT HOURS', 'INDIRECT HOURS',
    'OTHER HOURS', 'TOTAL HOURS IN THIS SERVICE PERIOD',
  ];

  // Column widths (matching Bella Coola)
  const colWidths = [13, 13, 13, 13, 12.5, 13, 13, 12.5, 13, 13, 13, 15.5, 9, 13, 13, 12.5];
  ws.columns = headers.map((h, i) => ({ header: h, key: `col${i}`, width: colWidths[i] || 13 }));

  // Style header row — bold, Calibri 11
  const headerRow = ws.getRow(1);
  headerRow.font = { name: 'Calibri', size: 11, bold: true };
  headerRow.alignment = { wrapText: true, vertical: 'bottom' };

  // Add data rows
  for (const row of filteredRows) {
    const dataRow = ws.addRow(
      headers.map((_, i) => {
        const val = row[i]?.toString() || '';
        // Columns L-P (indices 11-15): numeric hours
        if (i >= 11 && i <= 15) {
          const num = parseFloat(val);
          return isNaN(num) ? val : num;
        }
        return val;
      })
    );
    dataRow.font = { name: 'Calibri', size: 11 };
  }

  // Format date columns as dates, time columns as times
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    // Service dates (E, F) — columns 5, 6
    [5, 6].forEach(col => {
      const cell = row.getCell(col);
      const val = cell.value?.toString() || '';
      if (val) {
        const d = new Date(val);
        if (!isNaN(d.getTime())) {
          cell.value = d;
          cell.numFmt = 'yyyy-mm-dd';
        }
      }
    });
    // Time columns (H, I) — columns 8, 9
    [8, 9].forEach(col => {
      const cell = row.getCell(col);
      const val = cell.value?.toString() || '';
      if (val && val.includes(':')) {
        cell.numFmt = 'HH:MM';
      }
    });
    // Hours columns (L-P) — columns 12-16
    for (let col = 12; col <= 16; col++) {
      const cell = row.getCell(col);
      if (typeof cell.value === 'number') {
        cell.numFmt = '0.00';
      }
    }
  });

  // Freeze header row
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

// --- Yukon Excel export (each date on a separate sheet) ---

import { COLUMNS, DATA_START_ROW } from '@/lib/google-sheets';

// Styling constants
const FONT = { name: 'Calibri', size: 10 };
const FONT_BOLD = { ...FONT, bold: true };
const FONT_TITLE = { name: 'Calibri', size: 13, bold: true };
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3864' } };
const HEADER_FONT = { ...FONT, bold: true, color: { argb: 'FFFFFFFF' } };
const ALT_ROW_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F7FA' } };
const TIME_LABEL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
const SUP_FONT = { ...FONT, color: { argb: 'FF2E5CB8' } };
const BORDER_THIN: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: 'FFD0D5DD' } },
  bottom: { style: 'thin', color: { argb: 'FFD0D5DD' } },
  left: { style: 'thin', color: { argb: 'FFD0D5DD' } },
  right: { style: 'thin', color: { argb: 'FFD0D5DD' } },
};

async function exportYukonExcel(
  ctx: any, startDate: Date, endDate: Date, months: string[]
): Promise<Buffer> {
  const { sheets, spreadsheetId } = ctx;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ED Assistant';

  const d = new Date(startDate);
  while (d <= endDate) {
    const sheetName = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

    try {
      // Read header rows (1-7) for shift time data
      const headerRes = await sheets.spreadsheets.values.get({
        spreadsheetId, range: `'${sheetName}'!A1:Q7`,
      });
      const headerRows = headerRes.data.values || [];

      // Read all patient data rows
      const dataRes = await sheets.spreadsheets.values.get({
        spreadsheetId, range: `'${sheetName}'!A${DATA_START_ROW}:Q200`,
      });
      const rawRows = dataRes.data.values || [];

      if (rawRows.length === 0 && headerRows.length === 0) {
        d.setDate(d.getDate() + 1);
        continue;
      }

      // Group rows into patient blocks
      const patientBlocks: { timestamp: string; rows: any[][] }[] = [];
      let currentBlock: any[][] = [];
      for (const row of rawRows) {
        const name = row[COLUMNS.PATIENT_NAME]?.toString().trim() || '';
        const procCode = row[COLUMNS.PROC_CODE]?.toString().trim() || '';
        if (name) {
          if (currentBlock.length > 0) patientBlocks.push({ timestamp: currentBlock[0][COLUMNS.TIMESTAMP]?.toString() || '', rows: currentBlock });
          currentBlock = [row];
        } else if (procCode) {
          currentBlock.push(row);
        }
      }
      if (currentBlock.length > 0) patientBlocks.push({ timestamp: currentBlock[0][COLUMNS.TIMESTAMP]?.toString() || '', rows: currentBlock });
      patientBlocks.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      // Create worksheet
      const ws = wb.addWorksheet(sheetName);

      // Column definitions — matching requested layout
      const colDefs = [
        { header: 'Time', key: 'time', width: 7 },
        { header: 'Patient Name', key: 'name', width: 22 },
        { header: 'Age', key: 'age', width: 5 },
        { header: 'Gender', key: 'gender', width: 5 },
        { header: 'DOB', key: 'dob', width: 11 },
        { header: 'HCN', key: 'hcn', width: 13 },
        { header: 'MRN', key: 'mrn', width: 10 },
        { header: 'Diagnosis', key: 'diagnosis', width: 24 },
        { header: 'ICD-9', key: 'icd9', width: 8 },
        { header: 'Procedure', key: 'procedure', width: 22 },
        { header: 'Code', key: 'code', width: 7 },
        { header: 'Fee', key: 'fee', width: 9 },
        { header: 'Unit', key: 'unit', width: 5 },
        { header: 'Total', key: 'total', width: 10 },
        { header: 'Comments', key: 'comments', width: 24 },
      ];
      ws.columns = colDefs;

      // ===== ROW 1: Date title =====
      let rowNum = 1;
      const titleRow = ws.getRow(rowNum);
      ws.mergeCells(rowNum, 1, rowNum, colDefs.length);
      titleRow.getCell(1).value = sheetName;
      titleRow.getCell(1).font = FONT_TITLE;
      titleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
      titleRow.height = 22;
      rowNum++;

      // ===== ROW 2-4: Time-based fees =====
      if (headerRows.length >= 5) {
        const shiftVals = headerRows[4] || [];
        const shiftStart = shiftVals[0]?.toString() || '';
        const shiftEnd = shiftVals[1]?.toString() || '';
        const shiftHours = shiftVals[2]?.toString() || '';
        const shiftFeeType = shiftVals[3]?.toString() || '';
        const shiftCode = shiftVals[4]?.toString() || '';
        const shiftFee = shiftVals[5]?.toString() || '';
        const shiftTotal = shiftVals[6]?.toString() || '';

        if (shiftStart) {
          // Time-based fee label row
          const labelRow = ws.getRow(rowNum);
          labelRow.getCell(1).value = 'TIME BASED FEE';
          labelRow.getCell(1).font = { ...FONT_BOLD, size: 11 };
          rowNum++;

          // Header row for time fees
          const tfHeaderRow = ws.getRow(rowNum);
          ['Start', 'End', 'Hours', 'Fee Type', 'Code', 'Rate', 'Total'].forEach((lbl, i) => {
            const c = tfHeaderRow.getCell(i + 1);
            c.value = lbl;
            c.font = FONT_BOLD;
            c.fill = TIME_LABEL_FILL;
            c.border = BORDER_THIN;
          });
          rowNum++;

          // Values row
          const tfValRow = ws.getRow(rowNum);
          [shiftStart, shiftEnd, shiftHours, shiftFeeType, shiftCode, shiftFee, shiftTotal].forEach((val, i) => {
            const c = tfValRow.getCell(i + 1);
            if (i === 6) { const n = parseFloat(val); c.value = isNaN(n) ? val : n; c.numFmt = '$#,##0.00'; }
            else if (i === 5) { const n = parseFloat(val); c.value = isNaN(n) ? val : n; c.numFmt = '$#,##0.00'; }
            else if (i === 2) { const n = parseFloat(val); c.value = isNaN(n) ? val : n; }
            else { c.value = val; }
            c.font = FONT;
            c.border = BORDER_THIN;
          });
          rowNum++;

          // Supplemental lines
          const supRaw = headerRows[5]?.[0]?.toString() || '';
          if (supRaw) {
            try {
              const supLines = JSON.parse(supRaw) as { start: string; end: string; code: string; hours: string; fee: string; total: string }[];
              for (const sl of supLines) {
                const sr = ws.getRow(rowNum);
                sr.getCell(1).value = sl.start;
                sr.getCell(2).value = sl.end;
                sr.getCell(3).value = parseFloat(sl.hours) || 0;
                sr.getCell(4).value = 'Supplemental';
                sr.getCell(5).value = sl.code;
                sr.getCell(6).value = parseFloat(sl.fee) || 0; sr.getCell(6).numFmt = '$#,##0.00';
                sr.getCell(7).value = parseFloat(sl.total) || 0; sr.getCell(7).numFmt = '$#,##0.00';
                for (let ci = 1; ci <= 7; ci++) { sr.getCell(ci).font = SUP_FONT; sr.getCell(ci).border = BORDER_THIN; }
                rowNum++;
              }
            } catch {}
          }

          rowNum++; // blank spacer row
        }
      }

      // ===== PATIENT DATA HEADER =====
      const hdrRowNum = rowNum;
      const hdrRow = ws.getRow(hdrRowNum);
      colDefs.forEach((col, i) => {
        const c = hdrRow.getCell(i + 1);
        c.value = col.header;
        c.font = HEADER_FONT;
        c.fill = HEADER_FILL;
        c.alignment = { horizontal: 'left', vertical: 'middle' };
        c.border = BORDER_THIN;
      });
      hdrRow.height = 18;
      rowNum++;

      // ===== PATIENT DATA ROWS =====
      let patientNum = 0;
      let grandTotal = 0;

      for (const block of patientBlocks) {
        for (let i = 0; i < block.rows.length; i++) {
          const row = block.rows[i];
          const wsRow = ws.getRow(rowNum);
          const isAlt = patientNum % 2 === 1;

          // Map columns
          if (i === 0) {
            wsRow.getCell(1).value = row[COLUMNS.TIMESTAMP]?.toString() || '';        // Time
            wsRow.getCell(2).value = row[COLUMNS.PATIENT_NAME]?.toString() || '';      // Patient Name
            wsRow.getCell(3).value = row[3]?.toString() || '';                          // Age
            wsRow.getCell(4).value = row[4]?.toString() || '';                          // Gender
            wsRow.getCell(5).value = row[5]?.toString() || '';                          // DOB
            wsRow.getCell(6).value = row[6]?.toString() || '';                          // HCN
            wsRow.getCell(7).value = row[7]?.toString() || '';                          // MRN
            wsRow.getCell(8).value = row[COLUMNS.DIAGNOSIS]?.toString() || '';          // Diagnosis
            wsRow.getCell(9).value = row[COLUMNS.ICD9]?.toString() || '';               // ICD-9
            wsRow.getCell(15).value = row[COLUMNS.COMMENTS]?.toString() || '';          // Comments
          }

          // Billing columns (present on all rows including continuation)
          const procDesc = row[11]?.toString() || '';  // Visit/Procedure description
          const procCode = row[COLUMNS.PROC_CODE]?.toString() || '';
          const feeVal = row[COLUMNS.FEE]?.toString() || '';
          const unitVal = row[COLUMNS.UNIT]?.toString() || '';
          const totalVal = row[COLUMNS.TOTAL]?.toString() || '';

          wsRow.getCell(10).value = procDesc;                                           // Procedure
          wsRow.getCell(11).value = procCode;                                           // Code
          const feeNum = parseFloat(feeVal);
          wsRow.getCell(12).value = isNaN(feeNum) ? feeVal : feeNum;                   // Fee
          if (!isNaN(feeNum)) wsRow.getCell(12).numFmt = '$#,##0.00';
          const unitNum = parseInt(unitVal);
          wsRow.getCell(13).value = isNaN(unitNum) ? unitVal : unitNum;                 // Unit
          const totalNum = parseFloat(totalVal);
          wsRow.getCell(14).value = isNaN(totalNum) ? totalVal : totalNum;              // Total
          if (!isNaN(totalNum)) { wsRow.getCell(14).numFmt = '$#,##0.00'; grandTotal += totalNum; }

          // Apply styling
          for (let ci = 1; ci <= colDefs.length; ci++) {
            const c = wsRow.getCell(ci);
            c.font = FONT;
            c.border = BORDER_THIN;
            c.alignment = { vertical: 'top', wrapText: ci === 8 || ci === 10 || ci === 15 };
            if (isAlt) c.fill = ALT_ROW_FILL;
          }

          rowNum++;
        }
        patientNum++;
      }

      // ===== GRAND TOTAL ROW =====
      if (grandTotal > 0) {
        rowNum++; // blank spacer
        const totalRow = ws.getRow(rowNum);
        totalRow.getCell(13).value = 'TOTAL';
        totalRow.getCell(13).font = FONT_BOLD;
        totalRow.getCell(13).alignment = { horizontal: 'right' };
        totalRow.getCell(14).value = grandTotal;
        totalRow.getCell(14).numFmt = '$#,##0.00';
        totalRow.getCell(14).font = { ...FONT_BOLD, size: 11 };
        totalRow.getCell(14).border = { top: { style: 'double', color: { argb: 'FF1F3864' } }, bottom: { style: 'double', color: { argb: 'FF1F3864' } } };
      }

      // Freeze below headers
      ws.views = [{ state: 'frozen', ySplit: hdrRowNum }];

      // Print settings
      ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

    } catch {
      // Sheet doesn't exist for this date — skip
    }

    d.setDate(d.getDate() + 1);
  }

  if (wb.worksheets.length === 0) {
    wb.addWorksheet('No Data');
  }

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
