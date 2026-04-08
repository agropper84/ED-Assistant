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
    const { field, content, sheetName } = await request.json();

    if (!field || typeof content !== 'string') {
      return NextResponse.json({ error: 'field and content are required' }, { status: 400 });
    }

    const entry: SubmissionEntry = {
      id: generateId('sub'),
      field,
      content,
      submittedAt: new Date().toISOString(),
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
