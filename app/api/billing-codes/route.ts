import { NextResponse } from 'next/server';
import { getSheetsContext, getBillingCodes } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

// GET /api/billing-codes - Fetch billing codes from Google Sheet
export async function GET() {
  try {
    const ctx = await getSheetsContext();
    const codes = await getBillingCodes(ctx);
    return NextResponse.json(codes);
  } catch (error: any) {
    console.error('Error fetching billing codes:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to fetch billing codes', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
