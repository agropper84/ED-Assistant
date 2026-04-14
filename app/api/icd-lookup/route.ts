import { NextRequest, NextResponse } from 'next/server';
import { lookupICDCodes } from '@/lib/claude';
import { getDataContext, findDiagnosisCode, upsertDiagnosisCode } from '@/lib/data-layer';
import { withApiHandler, parseBody } from '@/lib/api-handler';
import { icdLookupSchema } from '@/lib/schemas';

export const maxDuration = 15;

export const POST = withApiHandler(
  { rateLimit: { limit: 30, window: 60 } },
  async (request: NextRequest) => {
    const { diagnosis } = await parseBody(request, icdLookupSchema);
    const trimmed = diagnosis.trim();

    // Check the Diagnosis Codes registry first
    try {
      const ctx = await getDataContext();
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
