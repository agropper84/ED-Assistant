import { NextResponse } from 'next/server';
import { getBillingCodes } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

// GET /api/billing-codes - Fetch billing codes from Google Sheet
export async function GET() {
  try {
    const codes = await getBillingCodes();
    return NextResponse.json(codes);
  } catch (error: any) {
    console.error('Error fetching billing codes:', error);
    return NextResponse.json(
      { error: 'Failed to fetch billing codes', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
