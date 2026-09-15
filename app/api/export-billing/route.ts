import { NextRequest, NextResponse } from 'next/server';
import { getDataContext, getPatients } from '@/lib/data-layer';
import type { DataContext } from '@/lib/types-json';
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
      const buffer = await exportYukonExcel(ctx, startDate, endDate, months);
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

/** Map ICD-10 prefix letter to a general ICD-9 chapter code */
function icd10ToGeneralIcd9(icd10: string): string {
  if (!icd10) return '';
  // Use first code if multiple are stored (e.g. "M54.9 / K29.2")
  const code = icd10.split(/[/,\n]/)[0].trim();
  if (!code) return '';
  const map: Record<string, string> = {
    A: '136.9', B: '136.9',   // infectious / parasitic
    C: '239.9', D: '239.9',   // neoplasms
    E: '259.9',                // endocrine / metabolic
    F: '300.9',                // mental / behavioral
    G: '349.9',                // nervous system
    H: '389.9',                // eye / ear
    I: '459.9',                // circulatory
    J: '519.9',                // respiratory
    K: '579.9',                // digestive
    L: '709.9',                // skin / subcutaneous
    M: '739.9',                // musculoskeletal
    N: '629.9',                // genitourinary
    O: '669.9',                // pregnancy / childbirth
    P: '779.9',                // perinatal
    Q: '759.9',                // congenital
    R: '799.9',                // symptoms / signs
    S: '959.9', T: '959.9',   // injury / poisoning
    V: 'E999',  W: 'E999', X: 'E999', Y: 'E999',  // external causes
    Z: 'V99',                  // factors influencing health
  };
  return map[code.charAt(0).toUpperCase()] || '';
}

/** Split a newline-separated billing field into individual values */
function splitField(val: string): string[] {
  return (val || '').split('\n').map(s => s.trim());
}

async function exportYukonExcel(
  ctx: DataContext, startDate: Date, endDate: Date, months: string[]
): Promise<Buffer> {
  const { sheets, spreadsheetId } = ctx.sheets as any;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ED Assistant';

  const d = new Date(startDate);
  while (d <= endDate) {
    const sheetName = `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

    try {
      // ── Patients from Drive (source of truth) ────────────────────────────
      const patients = await getPatients(ctx, sheetName);
      patients.sort((a, b) => (a.timestamp || '').localeCompare(b.timestamp || ''));

      // ── Time-based fees from Sheets header rows ───────────────────────────
      let shiftStart = '', shiftEnd = '', shiftHours = '', shiftFeeType = '', shiftCode = '', shiftFee = '', shiftTotal = '';
      let supLines: { start: string; end: string; code: string; hours: string; fee: string; total: string }[] = [];
      try {
        const headerRes = await sheets.spreadsheets.values.get({
          spreadsheetId, range: `'${sheetName}'!A1:H7`,
        });
        const headerRows: any[][] = headerRes.data.values || [];
        if (headerRows.length >= 5) {
          const sv = headerRows[4] || [];
          shiftStart = sv[0]?.toString() || '';
          shiftEnd = sv[1]?.toString() || '';
          shiftHours = sv[2]?.toString() || '';
          shiftFeeType = sv[3]?.toString() || '';
          shiftCode = sv[4]?.toString() || '';
          shiftFee = sv[5]?.toString() || '';
          shiftTotal = sv[6]?.toString() || '';
        }
        if (headerRows.length >= 6) {
          const supRaw = headerRows[5]?.[7]?.toString() || ''; // H6 JSON backup
          if (supRaw) try { supLines = JSON.parse(supRaw); } catch {}
        }
      } catch {}

      if (patients.length === 0 && !shiftStart) {
        d.setDate(d.getDate() + 1);
        continue;
      }

      // ── Create worksheet ──────────────────────────────────────────────────
      const ws = wb.addWorksheet(sheetName);
      const colDefs = [
        { header: 'Time', key: 'time', width: 7 },
        { header: 'Patient Name', key: 'name', width: 22 },
        { header: 'Age', key: 'age', width: 5 },
        { header: 'Gender', key: 'gender', width: 6 },
        { header: 'DOB', key: 'dob', width: 11 },
        { header: 'HCN', key: 'hcn', width: 13 },
        { header: 'MRN', key: 'mrn', width: 10 },
        { header: 'Diagnosis', key: 'diagnosis', width: 26 },
        { header: 'ICD-9', key: 'icd9', width: 8 },
        { header: 'Procedure', key: 'procedure', width: 24 },
        { header: 'Code', key: 'code', width: 7 },
        { header: 'Fee', key: 'fee', width: 9 },
        { header: 'Unit', key: 'unit', width: 5 },
        { header: 'Total', key: 'total', width: 10 },
        { header: 'Comments', key: 'comments', width: 26 },
      ];
      ws.columns = colDefs;

      let rowNum = 1;

      // ── Date title ────────────────────────────────────────────────────────
      ws.mergeCells(rowNum, 1, rowNum, colDefs.length);
      const titleRow = ws.getRow(rowNum);
      titleRow.getCell(1).value = sheetName;
      titleRow.getCell(1).font = FONT_TITLE;
      titleRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
      titleRow.height = 22;
      rowNum++;

      // ── Time-based fee section ────────────────────────────────────────────
      if (shiftStart) {
        ws.getRow(rowNum).getCell(1).value = 'TIME BASED FEE';
        ws.getRow(rowNum).getCell(1).font = { ...FONT_BOLD, size: 11 };
        rowNum++;

        const tfHdr = ws.getRow(rowNum);
        ['Start', 'End', 'Hours', 'Fee Type', 'Code', 'Rate', 'Total'].forEach((lbl, i) => {
          const c = tfHdr.getCell(i + 1);
          c.value = lbl; c.font = FONT_BOLD; c.fill = TIME_LABEL_FILL; c.border = BORDER_THIN;
        });
        rowNum++;

        const tfVal = ws.getRow(rowNum);
        [shiftStart, shiftEnd, shiftHours, shiftFeeType, shiftCode, shiftFee, shiftTotal].forEach((val, i) => {
          const c = tfVal.getCell(i + 1);
          if (i === 5 || i === 6) { const n = parseFloat(val); c.value = isNaN(n) ? val : n; c.numFmt = '$#,##0.00'; }
          else if (i === 2) { const n = parseFloat(val); c.value = isNaN(n) ? val : n; }
          else { c.value = val; }
          c.font = FONT; c.border = BORDER_THIN;
        });
        rowNum++;

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

        rowNum++; // blank spacer
      }

      // ── Patient data header ───────────────────────────────────────────────
      const hdrRowNum = rowNum;
      const hdrRow = ws.getRow(hdrRowNum);
      colDefs.forEach((col, i) => {
        const c = hdrRow.getCell(i + 1);
        c.value = col.header; c.font = HEADER_FONT; c.fill = HEADER_FILL;
        c.alignment = { horizontal: 'left', vertical: 'middle' }; c.border = BORDER_THIN;
      });
      hdrRow.height = 18;
      rowNum++;

      // ── Patient rows ──────────────────────────────────────────────────────
      let patientNum = 0;
      let grandTotal = 0;

      for (const patient of patients) {
        const isAlt = patientNum % 2 === 1;
        const icd9 = patient.icd9 || icd10ToGeneralIcd9(patient.icd10 || '');

        // Split billing into per-code rows
        const codes = splitField(patient.procCode).filter(Boolean);
        const procedures = splitField(patient.visitProcedure);
        const fees = splitField(patient.fee);
        const units = splitField(patient.unit);
        const patientTotal = parseFloat(patient.total || '') || 0;
        if (patientTotal > 0) grandTotal += patientTotal;

        const billingRowCount = Math.max(codes.length, 1);

        for (let i = 0; i < billingRowCount; i++) {
          const wsRow = ws.getRow(rowNum);

          // Patient demographics — only on first billing row
          if (i === 0) {
            wsRow.getCell(1).value = patient.timestamp || '';
            wsRow.getCell(2).value = patient.name || '';
            wsRow.getCell(3).value = patient.age || '';
            wsRow.getCell(4).value = patient.gender || '';
            wsRow.getCell(5).value = patient.birthday || '';
            wsRow.getCell(6).value = patient.hcn || '';
            wsRow.getCell(7).value = patient.mrn || '';
            wsRow.getCell(8).value = patient.diagnosis || '';
            wsRow.getCell(9).value = icd9;
            wsRow.getCell(15).value = patient.comments || '';
          }

          // Billing columns
          if (codes.length > 0) {
            wsRow.getCell(10).value = procedures[i] || '';
            wsRow.getCell(11).value = codes[i] || '';
            const feeNum = parseFloat(fees[i] || '');
            if (!isNaN(feeNum)) { wsRow.getCell(12).value = feeNum; wsRow.getCell(12).numFmt = '$#,##0.00'; }
            const unitNum = parseInt(units[i] || '');
            if (!isNaN(unitNum)) wsRow.getCell(13).value = unitNum;
            // Grand total on first billing row only
            if (i === 0 && patientTotal > 0) {
              wsRow.getCell(14).value = patientTotal;
              wsRow.getCell(14).numFmt = '$#,##0.00';
            }
          }

          for (let ci = 1; ci <= colDefs.length; ci++) {
            const c = wsRow.getCell(ci);
            c.font = FONT; c.border = BORDER_THIN;
            c.alignment = { vertical: 'top', wrapText: ci === 8 || ci === 10 || ci === 15 };
            if (isAlt) c.fill = ALT_ROW_FILL;
          }

          rowNum++;
        }
        patientNum++;
      }

      // ── Grand total row ───────────────────────────────────────────────────
      if (grandTotal > 0) {
        rowNum++;
        const totalRow = ws.getRow(rowNum);
        totalRow.getCell(13).value = 'TOTAL';
        totalRow.getCell(13).font = FONT_BOLD;
        totalRow.getCell(13).alignment = { horizontal: 'right' };
        totalRow.getCell(14).value = grandTotal;
        totalRow.getCell(14).numFmt = '$#,##0.00';
        totalRow.getCell(14).font = { ...FONT_BOLD, size: 11 };
        totalRow.getCell(14).border = { top: { style: 'double', color: { argb: 'FF1F3864' } }, bottom: { style: 'double', color: { argb: 'FF1F3864' } } };
      }

      ws.views = [{ state: 'frozen', ySplit: hdrRowNum }];
      ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

    } catch {
      // Date tab doesn't exist — skip
    }

    d.setDate(d.getDate() + 1);
  }

  if (wb.worksheets.length === 0) wb.addWorksheet('No Data');

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
