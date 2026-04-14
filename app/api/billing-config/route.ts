import { NextRequest, NextResponse } from 'next/server';
import { getDataContext } from '@/lib/data-layer';
import { getBillingConfig, saveBillingConfig } from '@/lib/google-sheets';

// GET — read billing config from Google Sheet
export async function GET() {
  try {
    const ctx = await getDataContext();
    const config = await getBillingConfig(ctx.sheets);
    return NextResponse.json(config);
  } catch (err: any) {
    if (err.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Error reading billing config:', err);
    return NextResponse.json({ error: 'Failed to read config' }, { status: 500 });
  }
}

// PUT — save billing config to Google Sheet
export async function PUT(req: NextRequest) {
  try {
    const ctx = await getDataContext();
    const config = await req.json();
    await saveBillingConfig(ctx.sheets, {
      billingRegion: config.billingRegion || 'yukon',
      vchCprpId: config.vchCprpId || '',
      vchSiteFacility: config.vchSiteFacility || '',
      vchPracNumber: config.vchPracNumber || '',
      vchPractitionerName: config.vchPractitionerName || '',
    });
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Error saving billing config:', err);
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 });
  }
}
