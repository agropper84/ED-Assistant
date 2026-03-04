import { NextRequest, NextResponse } from 'next/server';
import { parsePatientInfo, getRoundedTime } from '@/lib/parse-patient';

// POST /api/parse - Parse Meditech patient data
export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();
    
    if (!text) {
      return NextResponse.json(
        { error: 'No text provided' },
        { status: 400 }
      );
    }
    
    const parsed = parsePatientInfo(text);
    const timestamp = getRoundedTime();
    
    return NextResponse.json({
      ...parsed,
      timestamp,
    });
  } catch (error) {
    console.error('Error parsing patient data:', error);
    return NextResponse.json(
      { error: 'Failed to parse patient data' },
      { status: 500 }
    );
  }
}
