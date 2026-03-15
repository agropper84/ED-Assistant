import { NextRequest, NextResponse } from 'next/server';
import {
  getSheetsContext,
  getPatients,
  writeVchBillingSheet,
  getVchRatePeriod,
  type VchBillingRow,
} from '@/lib/google-sheets';
import {
  parseBillingItems,
  calculateSegmentHours,
  calculateSegmentMinutes,
  getSegmentRatePeriod,
  type TimeSegment,
} from '@/lib/billing';

interface PatientBillingData {
  timestamp: string; // e.g. "08:30"
  directMin: number;
  indirectMin: number;
  scheduled: boolean;
  onsite: boolean;
}

/** Parse patient timestamp to minutes since midnight */
function parseTimeToMinutes(timestamp: string): number {
  const match = timestamp.match(/(\d{1,2}):(\d{2})/);
  if (!match) return -1;
  let h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const isPM = /pm/i.test(timestamp);
  const isAM = /am/i.test(timestamp);
  if (isPM && h < 12) h += 12;
  if (isAM && h === 12) h = 0;
  return h * 60 + m;
}

/** Check if a patient timestamp falls within a time segment */
function patientInSegment(patientMin: number, seg: TimeSegment): boolean {
  const [sh, sm] = seg.start.split(':').map(Number);
  const [eh, em] = seg.end.split(':').map(Number);
  let segStart = sh * 60 + sm;
  let segEnd = eh * 60 + em;
  if (segEnd <= segStart) segEnd += 24 * 60; // overnight

  // Handle overnight patient times
  let pMin = patientMin;
  if (pMin < segStart && segEnd > 24 * 60) pMin += 24 * 60;

  return pMin >= segStart && pMin < segEnd;
}

/**
 * Merge time segments with patient data.
 *
 * Strategy: time segments define the row structure (Bella Coola format).
 * Patient data within each segment refines the direct/indirect split.
 * If patient data accounts for more direct time than the segment's
 * directPct would suggest, the patient data takes precedence.
 * Patients not covered by any time segment get their own rows.
 */
function mergeData(
  segments: TimeSegment[],
  patients: PatientBillingData[],
  dateStr: string,
  dayOfWeek: number,
  config: { cprpId: string; siteFacility: string; pracNumber: string; practitionerName: string },
): VchBillingRow[] {
  const rows: VchBillingRow[] = [];
  const assignedPatients = new Set<number>();

  for (const seg of segments) {
    if (!seg.start || !seg.end) continue;

    const segHrs = calculateSegmentHours(seg);
    const ratePeriod = getSegmentRatePeriod(seg.start, dayOfWeek);

    // Find patients within this segment
    const segPatients: PatientBillingData[] = [];
    patients.forEach((p, idx) => {
      const pMin = parseTimeToMinutes(p.timestamp);
      if (pMin >= 0 && patientInSegment(pMin, seg)) {
        segPatients.push(p);
        assignedPatients.add(idx);
      }
    });

    if (segPatients.length > 0) {
      // Patient data available — use it to refine direct/indirect
      const patientDirectMin = segPatients.reduce((sum, p) => sum + p.directMin, 0);
      const patientIndirectMin = segPatients.reduce((sum, p) => sum + p.indirectMin, 0);
      const patientTotalMin = patientDirectMin + patientIndirectMin;
      const segTotalMin = calculateSegmentMinutes(seg.start, seg.end);

      // Use the greater of: patient-reported direct time or segment-estimated direct time
      const segEstimatedDirectMin = segTotalMin * (seg.directPct / 100);
      const directMin = Math.max(patientDirectMin, segEstimatedDirectMin);
      const indirectMin = segTotalMin - directMin;

      rows.push({
        ...config,
        serviceDate: dateStr,
        ratePeriod,
        startTime: seg.start,
        endTime: seg.end,
        scheduled: seg.scheduled ? 'Scheduled' : 'Unscheduled',
        onsiteOffsite: seg.onsite ? 'Onsite' : 'Offsite',
        directIndirectHrs: (segTotalMin / 60).toFixed(2),
        directHrs: (directMin / 60).toFixed(2),
        indirectHrs: (indirectMin / 60).toFixed(2),
        other: '',
        total: (segTotalMin / 60).toFixed(2),
      });
    } else {
      // No patient data — use segment's directPct as-is
      rows.push({
        ...config,
        serviceDate: dateStr,
        ratePeriod,
        startTime: seg.start,
        endTime: seg.end,
        scheduled: seg.scheduled ? 'Scheduled' : 'Unscheduled',
        onsiteOffsite: seg.onsite ? 'Onsite' : 'Offsite',
        directIndirectHrs: segHrs.totalHrs.toFixed(2),
        directHrs: segHrs.directHrs.toFixed(2),
        indirectHrs: segHrs.indirectHrs.toFixed(2),
        other: '',
        total: segHrs.totalHrs.toFixed(2),
      });
    }
  }

  // Any patients not covered by time segments get their own rows
  patients.forEach((p, idx) => {
    if (assignedPatients.has(idx)) return;
    const totalMin = p.directMin + p.indirectMin;
    if (totalMin <= 0) return;

    const ratePeriod = getVchRatePeriod(p.timestamp, dayOfWeek);

    rows.push({
      ...config,
      serviceDate: dateStr,
      ratePeriod,
      startTime: p.timestamp,
      endTime: '',
      scheduled: p.scheduled ? 'Scheduled' : 'Unscheduled',
      onsiteOffsite: p.onsite ? 'Onsite' : 'Offsite',
      directIndirectHrs: (totalMin / 60).toFixed(2),
      directHrs: (p.directMin / 60).toFixed(2),
      indirectHrs: (p.indirectMin / 60).toFixed(2),
      other: '',
      total: (totalMin / 60).toFixed(2),
    });
  });

  return rows;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const body = await req.json();
    const { sheetName, cprpId, siteFacility, pracNumber, practitionerName, shiftSegments } = body;

    if (!sheetName) {
      return NextResponse.json({ error: 'sheetName required' }, { status: 400 });
    }

    const sheetDate = new Date(sheetName);
    const dayOfWeek = sheetDate.getDay();
    const dateStr = `${sheetDate.getMonth() + 1}/${sheetDate.getDate()}/${sheetDate.getFullYear()}`;

    const config = {
      cprpId: cprpId || '',
      siteFacility: siteFacility || '',
      pracNumber: pracNumber || '',
      practitionerName: practitionerName || '',
    };

    // Collect patient-level billing data
    const dbPatients = await getPatients(ctx, sheetName);
    const patientData: PatientBillingData[] = [];

    for (const patient of dbPatients) {
      const items = parseBillingItems(
        patient.visitProcedure || '',
        patient.procCode || '',
        patient.fee || '',
        patient.unit || '',
      );

      const vchItems = items.filter(i => i.code.startsWith('VCH-'));
      if (vchItems.length === 0) continue;

      const directMin = parseInt(vchItems.find(i => i.code === 'VCH-DO')?.unit || '0', 10) || 0;
      const indirectMin = parseInt(vchItems.find(i => i.code === 'VCH-IO')?.unit || '0', 10) || 0;
      if (directMin + indirectMin <= 0) continue;

      const isScheduled = vchItems.some(i => i.code === 'VCH-SCHED');
      const isOffsite = vchItems.some(i => i.code === 'VCH-OFFSITE');

      patientData.push({
        timestamp: patient.timestamp || '',
        directMin,
        indirectMin,
        scheduled: isScheduled,
        onsite: !isOffsite,
      });
    }

    const segments: TimeSegment[] = Array.isArray(shiftSegments) ? shiftSegments : [];

    let rows: VchBillingRow[];

    if (segments.length > 0) {
      // Merge time segments with patient data
      rows = mergeData(segments, patientData, dateStr, dayOfWeek, config);
    } else {
      // Patient-only mode: one row per patient
      rows = patientData.map(p => {
        const totalMin = p.directMin + p.indirectMin;
        const ratePeriod = getVchRatePeriod(p.timestamp, dayOfWeek);
        return {
          ...config,
          serviceDate: dateStr,
          ratePeriod,
          startTime: p.timestamp,
          endTime: '',
          scheduled: p.scheduled ? 'Scheduled' : 'Unscheduled',
          onsiteOffsite: p.onsite ? 'Onsite' : 'Offsite',
          directIndirectHrs: (totalMin / 60).toFixed(2),
          directHrs: (p.directMin / 60).toFixed(2),
          indirectHrs: (p.indirectMin / 60).toFixed(2),
          other: '',
          total: (totalMin / 60).toFixed(2),
        };
      });
    }

    await writeVchBillingSheet(ctx, rows);

    return NextResponse.json({ success: true, count: rows.length });
  } catch (err: any) {
    if (err.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (err.message === 'Not approved') {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    console.error('VCH billing sheet error:', err);
    return NextResponse.json({ error: 'Failed to generate VCH billing sheet' }, { status: 500 });
  }
}
