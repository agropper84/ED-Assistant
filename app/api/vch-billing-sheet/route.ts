import { NextRequest, NextResponse } from 'next/server';
import {
  getSheetsContext,
  writeVchBillingSheet,
  readVchBillingSegments,
  type VchBillingRow,
} from '@/lib/google-sheets';
import {
  calculateSegmentHours,
  getSegmentRatePeriod,
  type TimeSegment,
} from '@/lib/billing';

// GET - read saved time segments from VCH Billing sheet for a specific date
export async function GET(req: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const { searchParams } = new URL(req.url);
    const sheetName = searchParams.get('sheet') || '';

    // Convert sheet name (e.g. "Mar 16, 2026") to date string (e.g. "3/16/2026")
    let dateStr = '';
    if (sheetName) {
      const d = new Date(sheetName);
      if (!isNaN(d.getTime())) {
        dateStr = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
      }
    }

    const segments = await readVchBillingSegments(ctx, dateStr || undefined);
    return NextResponse.json(segments);
  } catch (err: any) {
    if (err.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to read segments' }, { status: 500 });
  }
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

    const segments: TimeSegment[] = Array.isArray(shiftSegments) ? shiftSegments : [];
    const rows: VchBillingRow[] = [];

    for (const seg of segments) {
      if (!seg.start || !seg.end) continue;
      const hrs = calculateSegmentHours(seg);
      const ratePeriod = getSegmentRatePeriod(seg.start, dayOfWeek);

      rows.push({
        ...config,
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

    await writeVchBillingSheet(ctx, rows, dateStr);

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
