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
  getSegmentRatePeriod,
  type TimeSegment,
} from '@/lib/billing';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const body = await req.json();
    const { sheetName, cprpId, siteFacility, pracNumber, practitionerName, vchMode, shiftSegments } = body;

    if (!sheetName) {
      return NextResponse.json({ error: 'sheetName required' }, { status: 400 });
    }

    const sheetDate = new Date(sheetName);
    const dayOfWeek = sheetDate.getDay();
    const dateStr = `${sheetDate.getMonth() + 1}/${sheetDate.getDate()}/${sheetDate.getFullYear()}`;

    const rows: VchBillingRow[] = [];

    if (vchMode === 'time' && Array.isArray(shiftSegments) && shiftSegments.length > 0) {
      // Time-based mode: shift-level segments (not per-patient)
      for (const seg of shiftSegments as TimeSegment[]) {
        if (!seg.start || !seg.end) continue;
        const hrs = calculateSegmentHours(seg);
        const ratePeriod = getSegmentRatePeriod(seg.start, dayOfWeek);

        rows.push({
          cprpId: cprpId || '',
          siteFacility: siteFacility || '',
          pracNumber: pracNumber || '',
          practitionerName: practitionerName || '',
          serviceDate: dateStr,
          ratePeriod,
          startTime: seg.start,
          endTime: seg.end,
          scheduled: seg.scheduled ? 'Scheduled' : 'Unscheduled',
          onsiteOffsite: seg.onsite ? 'Onsite' : 'Offsite',
          directIndirectHrs: hrs.totalHrs.toFixed(2),
          directHrs: hrs.directHrs.toFixed(2),
          indirectHrs: hrs.indirectHrs.toFixed(2),
          other: '',
          total: hrs.totalHrs.toFixed(2),
        });
      }
    } else {
      // Patient-based mode: aggregate VCH-DO/IO per patient
      const patients = await getPatients(ctx, sheetName);

      for (const patient of patients) {
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
        const isScheduled = vchItems.some(i => i.code === 'VCH-SCHED');
        const isOffsite = vchItems.some(i => i.code === 'VCH-OFFSITE');

        const totalMin = directMin + indirectMin;
        if (totalMin <= 0) continue;

        const ratePeriod = getVchRatePeriod(patient.timestamp || '', dayOfWeek);

        rows.push({
          cprpId: cprpId || '',
          siteFacility: siteFacility || '',
          pracNumber: pracNumber || '',
          practitionerName: practitionerName || '',
          serviceDate: dateStr,
          ratePeriod,
          startTime: patient.timestamp || '',
          endTime: '',
          scheduled: isScheduled ? 'Scheduled' : 'Unscheduled',
          onsiteOffsite: isOffsite ? 'Offsite' : 'Onsite',
          directIndirectHrs: (totalMin / 60).toFixed(2),
          directHrs: (directMin / 60).toFixed(2),
          indirectHrs: (indirectMin / 60).toFixed(2),
          other: '',
          total: (totalMin / 60).toFixed(2),
        });
      }
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
