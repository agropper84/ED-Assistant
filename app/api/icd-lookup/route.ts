import { NextRequest, NextResponse } from 'next/server';
import { lookupICDCodes } from '@/lib/claude';
import { getSheetsContext, findDiagnosisCode, upsertDiagnosisCode } from '@/lib/google-sheets';

export const maxDuration = 15;

export async function POST(request: NextRequest) {
  try {
    const { diagnosis } = await request.json();

    if (!diagnosis?.trim()) {
      return NextResponse.json({ error: 'Missing diagnosis' }, { status: 400 });
    }

    const trimmed = diagnosis.trim();

    // Check the Diagnosis Codes registry first
    try {
      const ctx = await getSheetsContext();
      const cached = await findDiagnosisCode(ctx, trimmed);
      if (cached) {
        // Increment usage count
        await upsertDiagnosisCode(ctx, cached);
        return NextResponse.json(cached);
      }

      // Not in registry — fall back to Claude
      const result = await lookupICDCodes(trimmed);

      // Save to registry (fire-and-forget)
      upsertDiagnosisCode(ctx, result).catch(err =>
        console.error('Failed to save diagnosis code to registry:', err)
      );

      return NextResponse.json(result);
    } catch (authError: any) {
      // If auth fails, still allow Claude lookup without registry
      if (authError?.message?.includes('Not authenticated') || authError?.message?.includes('re-login')) {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      if (authError?.message?.includes('Not approved')) {
        return NextResponse.json({ error: 'Not approved' }, { status: 403 });
      }
      // For other Sheets errors, fall back to Claude-only
      console.error('Registry lookup failed, falling back to Claude:', authError);
      const result = await lookupICDCodes(trimmed);
      return NextResponse.json(result);
    }
  } catch (error: any) {
    console.error('ICD lookup error:', error);
    return NextResponse.json(
      { error: 'Failed to lookup ICD codes', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
