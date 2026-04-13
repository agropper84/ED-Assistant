import { NextRequest, NextResponse } from 'next/server';
import { getDataContext, addSubmission } from '@/lib/data-layer';
import { generateId } from '@/lib/types-json';
import type { SubmissionEntry } from '@/lib/types-json';

// POST /api/patients/[rowIndex]/submit — Save a single section as a new submission
export async function POST(
  request: NextRequest,
  { params }: { params: { rowIndex: string } }
) {
  try {
    const ctx = await getDataContext();
    const rowIndex = parseInt(params.rowIndex);
    const { field, content, sheetName, title, date } = await request.json();

    if (!field || typeof content !== 'string') {
      return NextResponse.json({ error: 'field and content are required' }, { status: 400 });
    }

    const entry: SubmissionEntry = {
      id: generateId('sub'),
      field,
      content,
      submittedAt: new Date().toISOString(),
      ...(title ? { title } : {}),
      ...(date ? { date } : {}),
    };

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

// DELETE /api/patients/[rowIndex]/submit — Remove a submission by ID
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

    // For Drive-backed storage, remove from submissions array
    if (ctx.mode !== 'sheets' && ctx.drive) {
      const dj = await import('@/lib/drive-json');
      const dateSheet = await dj.getDateSheetFromDrive(ctx.drive, sheetName);
      if (dateSheet) {
        const patientIdx = dateSheet.patients.findIndex(p => p.rowIndex === rowIndex);
        if (patientIdx !== -1 && dateSheet.patients[patientIdx].submissions) {
          dateSheet.patients[patientIdx].submissions = dateSheet.patients[patientIdx].submissions!.filter(
            s => s.id !== submissionId
          );
          dateSheet.patients[patientIdx].lastModified = new Date().toISOString();
          await dj.saveDateSheetToDrive(ctx.drive, dateSheet);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete submission error:', error);
    return NextResponse.json({ error: error?.message || 'Delete failed' }, { status: 500 });
  }
}
