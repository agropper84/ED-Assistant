import { NextRequest, NextResponse } from 'next/server';
import { lookupICDCodes } from '@/lib/claude';

export const maxDuration = 15;

export async function POST(request: NextRequest) {
  try {
    const { diagnosis } = await request.json();

    if (!diagnosis?.trim()) {
      return NextResponse.json({ error: 'Missing diagnosis' }, { status: 400 });
    }

    const result = await lookupICDCodes(diagnosis.trim());
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('ICD lookup error:', error);
    return NextResponse.json(
      { error: 'Failed to lookup ICD codes', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
