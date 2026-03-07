import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getShortcutTokenUser } from '@/lib/kv';
import { getSheetsContextForUser, updatePatientFields, getPatient } from '@/lib/google-sheets';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// POST /api/shortcuts/assign — Assign a transcript to a patient
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const hash = sha256(token);
    const userId = await getShortcutTokenUser(hash);

    if (!userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { rowIndex, sheetName, transcript, append } = await request.json();

    if (typeof rowIndex !== 'number' || !transcript) {
      return NextResponse.json({ error: 'rowIndex and transcript are required' }, { status: 400 });
    }

    const ctx = await getSheetsContextForUser(userId);

    let finalTranscript = transcript;
    if (append) {
      const existing = await getPatient(ctx, rowIndex, sheetName || undefined);
      if (existing?.transcript) {
        finalTranscript = existing.transcript + '\n\n---\n\n' + transcript;
      }
    }

    await updatePatientFields(ctx, rowIndex, { transcript: finalTranscript }, sheetName || undefined);

    return NextResponse.json({ success: true, rowIndex });
  } catch (error: any) {
    console.error('Shortcut assign error:', error);
    return NextResponse.json(
      { error: error?.message || 'Assignment failed' },
      { status: error?.message?.includes('Not approved') ? 403 : 500 }
    );
  }
}
