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
  isTimeBasedBilling,
  decodeTimeSegments,
  calculateSegmentHours,
  getSegmentRatePeriod,
} from '@/lib/billing';

export async function POST(req: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const body = await req.json();
    const { sheetName, cprpId, siteFacility, pracNumber, practitionerName } = body;

    if (!sheetName) {
      return NextResponse.json({ error: 'sheetName required' }, { status: 400 });
    }

    // Fetch all patients from the specified date sheet
    const patients = await getPatients(ctx, sheetName);

    // Parse the date from sheetName (e.g. "Mar 13, 2026")
    const sheetDate = new Date(sheetName);
    const dayOfWeek = sheetDate.getDay();
    const dateStr = `${sheetDate.getMonth() + 1}/${sheetDate.getDate()}/${sheetDate.getFullYear()}`;

    const rows: VchBillingRow[] = [];

    for (const patient of patients) {
      const items = parseBillingItems(
        patient.visitProcedure || '',
        patient.procCode || '',
        patient.fee || '',
        patient.unit || '',
      );

      if (isTimeBasedBilling(items)) {
        // New time-based billing: each segment becomes one or more rows
        const segments = decodeTimeSegments(items);

        for (const seg of segments) {
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
        // Legacy VCH category-based billing (VCH-DO/IO/IF)
        const vchItems = items.filter(i => i.code.startsWith('VCH-'));
        if (vchItems.length === 0) continue;

        const directMin = parseInt(vchItems.find(i => i.code === 'VCH-DO')?.unit || '0', 10) || 0;
        const indirectOnsiteMin = parseInt(vchItems.find(i => i.code === 'VCH-IO')?.unit || '0', 10) || 0;
        const indirectOffsiteMin = parseInt(vchItems.find(i => i.code === 'VCH-IF')?.unit || '0', 10) || 0;

        const ratePeriod = getVchRatePeriod(patient.timestamp || '', dayOfWeek);

        // Onsite row: Direct + Indirect Onsite
        const onsiteMin = directMin + indirectOnsiteMin;
        if (onsiteMin > 0) {
          const directHrs = (directMin / 60).toFixed(2);
          const indirectHrs = (indirectOnsiteMin / 60).toFixed(2);
          const totalHrs = (onsiteMin / 60).toFixed(2);
          rows.push({
            cprpId: cprpId || '',
            siteFacility: siteFacility || '',
            pracNumber: pracNumber || '',
            practitionerName: practitionerName || '',
            serviceDate: dateStr,
            ratePeriod,
            startTime: patient.timestamp || '',
            endTime: '',
            scheduled: 'Unscheduled',
            onsiteOffsite: 'Onsite',
            directIndirectHrs: totalHrs,
            directHrs,
            indirectHrs,
            other: '',
            total: totalHrs,
          });
        }

        // Offsite row: Indirect Offsite
        if (indirectOffsiteMin > 0) {
          const offsiteHrs = (indirectOffsiteMin / 60).toFixed(2);
          rows.push({
            cprpId: cprpId || '',
            siteFacility: siteFacility || '',
            pracNumber: pracNumber || '',
            practitionerName: practitionerName || '',
            serviceDate: dateStr,
            ratePeriod,
            startTime: '',
            endTime: '',
            scheduled: 'Unscheduled',
            onsiteOffsite: 'Offsite',
            directIndirectHrs: offsiteHrs,
            directHrs: '',
            indirectHrs: offsiteHrs,
            other: '',
            total: offsiteHrs,
          });
        }
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
