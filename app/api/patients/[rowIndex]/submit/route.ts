import { NextRequest, NextResponse } from 'next/server';
import { getDataContext, getPatient, addSubmission, getSubmissions, deleteSubmission } from '@/lib/data-layer';
import { generateId } from '@/lib/types-json';
import type { SubmissionEntry } from '@/lib/types-json';

// GET /api/patients/[rowIndex]/submit?sheet=... — Fetch submissions from encrypted Drive JSON
export async function GET(
  request: NextRequest,
  { params }: { params: { rowIndex: string } }
) {
  try {
    const ctx = await getDataContext();
    const rowIndex = parseInt(params.rowIndex);
    const sheetName = request.nextUrl.searchParams.get('sheet');
    if (!sheetName) {
      return NextResponse.json({ error: 'sheet param required' }, { status: 400 });
    }

    const submissions = await getSubmissions(ctx, rowIndex, sheetName);
    return NextResponse.json({ submissions });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed' }, { status: 500 });
  }
}

// POST /api/patients/[rowIndex]/submit — Save submission to encrypted Drive JSON + append to Sheets flat field
export async function POST(
  request: NextRequest,
  { params }: { params: { rowIndex: string } }
) {
  try {
    const ctx = await getDataContext();
    const rowIndex = parseInt(params.rowIndex);
    const { field, content, sheetName, title, date, patientName } = await request.json();

    if (!field || typeof content !== 'string') {
      return NextResponse.json({ error: 'field and content are required' }, { status: 400 });
    }
    if (!sheetName) {
      return NextResponse.json({ error: 'sheetName is required' }, { status: 400 });
    }

    // Verify the patient exists at this rowIndex
    const patient = await getPatient(ctx, rowIndex, sheetName);
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found at this row' }, { status: 404 });
    }

    // Identity verification
    if (patientName && patient.name && patient.name !== patientName) {
      console.error(`Patient identity mismatch! Expected "${patientName}" at row ${rowIndex}, found "${patient.name}"`);
      return NextResponse.json(
        { error: 'Patient identity mismatch — the patient at this row has changed. Please close and reopen the chart.' },
        { status: 409 }
      );
    }

    const entry: SubmissionEntry = {
      id: generateId('sub'),
      field,
      content,
      submittedAt: new Date().toISOString(),
      ...(title ? { title } : {}),
      ...(date ? { date } : {}),
    };

    // addSubmission writes to:
    // 1. Drive JSON patient.submissions[] (encrypted, for tag persistence)
    // 2. Drive JSON patient.data flat field (encrypted, appended for note generation)
    // 3. Sheets flat field (async mirror, appended for dev visibility)
    const submissions = await addSubmission(ctx, rowIndex, sheetName, entry);

    // Auto-update medical profile in background
    fetch(new URL('/api/profile', request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: request.headers.get('cookie') || '',
      },
      body: JSON.stringify({ rowIndex, sheetName }),
    }).catch(() => {});

    return NextResponse.json({ success: true, entry, submissions });
  } catch (error: any) {
    console.error('Submit error:', error);
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ error: error?.message || 'Submit failed' }, { status: 500 });
  }
}

// DELETE /api/patients/[rowIndex]/submit — Remove submission from encrypted Drive JSON
export async function DELETE(
  request: NextRequest,
  { params }: { params: { rowIndex: string } }
) {
  try {
    const ctx = await getDataContext();
    const rowIndex = parseInt(params.rowIndex);
    const { submissionId, sheetName } = await request.json();

    if (!submissionId || !sheetName) {
      return NextResponse.json({ error: 'submissionId and sheetName are required' }, { status: 400 });
    }

    await deleteSubmission(ctx, rowIndex, sheetName, submissionId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete submission error:', error);
    return NextResponse.json({ error: error?.message || 'Delete failed' }, { status: 500 });
  }
}
