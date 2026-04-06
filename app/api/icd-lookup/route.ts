import { NextRequest, NextResponse } from 'next/server';
import { lookupICDCodes } from '@/lib/claude';
import { getSheetsContext, findDiagnosisCode, upsertDiagnosisCode } from '@/lib/google-sheets';
import { withApiHandler } from '@/lib/api-handler';

export const maxDuration = 15;

export const POST = withApiHandler(
  { rateLimit: { limit: 30, window: 60 } },
  async (request: NextRequest) => {
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
        await upsertDiagnosisCode(ctx, cached);
        return NextResponse.json(cached);
      }

      // Not in registry — fall back to Claude (PHI protection in lookupICDCodes)
      const result = await lookupICDCodes(trimmed);

      // Save to registry (fire-and-forget)
      upsertDiagnosisCode(ctx, result).catch(() => {});

      return NextResponse.json(result);
    } catch (authError: any) {
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
  }
);
