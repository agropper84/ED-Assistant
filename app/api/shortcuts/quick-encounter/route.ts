import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { getShortcutTokenUser } from '@/lib/kv';
import {
  getSheetsContextForUser,
  getOrCreateDateSheet,
  getNextEmptyRow,
  getPatientCount,
  updatePatientFields,
} from '@/lib/google-sheets';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// POST /api/shortcuts/quick-encounter — Create a new encounter row with transcript
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

    const { transcript } = await request.json();

    if (!transcript) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
    }

    const ctx = await getSheetsContextForUser(userId);

    // Ensure today's sheet exists
    const sheetName = await getOrCreateDateSheet(ctx);

    // Find next empty row and patient count for numbering
    const rowIndex = await getNextEmptyRow(ctx, sheetName);
    const patientCount = await getPatientCount(ctx, sheetName);
    const encounterNum = patientCount + 1;
    const encounterName = `New Encounter ${encounterNum}`;

    // Write the new encounter
    const now = new Date();
    const timestamp = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'America/Toronto',
    });

    await updatePatientFields(ctx, rowIndex, {
      patientNum: String(encounterNum),
      name: encounterName,
      timestamp,
      transcript,
    }, sheetName);

    return NextResponse.json({
      success: true,
      rowIndex,
      sheetName,
      name: encounterName,
    });
  } catch (error: any) {
    console.error('Quick encounter error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to create encounter' },
      { status: error?.message?.includes('Not approved') ? 403 : 500 }
    );
  }
}
