import { NextRequest, NextResponse } from 'next/server';
import {
  getDataContext,
  getBillingCodes,
  saveBillingCodes,
  addBillingCode,
  updateBillingCode,
  deleteBillingCode,
} from '@/lib/data-layer';
import { getDefaultCodesForRegion } from '@/lib/billing';

export const dynamic = 'force-dynamic';

function authError(error: any) {
  if (error?.message?.includes('Not approved')) {
    return NextResponse.json({ error: 'Not approved' }, { status: 403 });
  }
  if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return null;
}

// GET /api/billing-codes?region=yukon - Fetch billing codes, auto-populate if empty
export async function GET(request: NextRequest) {
  try {
    const ctx = await getDataContext();
    let codes = await getBillingCodes(ctx);

    // Auto-populate if sheet is empty
    if (codes.length === 0) {
      const region = request.nextUrl.searchParams.get('region') || 'yukon';
      const defaults = getDefaultCodesForRegion(region);
      await saveBillingCodes(ctx, defaults);
      codes = await getBillingCodes(ctx);
    }

    return NextResponse.json(codes);
  } catch (error: any) {
    console.error('Error fetching billing codes:', error);
    const auth = authError(error);
    if (auth) return auth;
    return NextResponse.json(
      { error: 'Failed to fetch billing codes', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

// POST /api/billing-codes - Add a code or reset all to defaults
export async function POST(request: NextRequest) {
  try {
    const ctx = await getDataContext();
    const body = await request.json();

    if (body.action === 'reset') {
      const region = body.region || 'yukon';
      const defaults = getDefaultCodesForRegion(region);
      await saveBillingCodes(ctx, defaults);
      const codes = await getBillingCodes(ctx);
      return NextResponse.json(codes);
    }

    // Add single code
    const { code, description, fee, group } = body;
    if (!code || !description) {
      return NextResponse.json({ error: 'code and description are required' }, { status: 400 });
    }
    await addBillingCode(ctx, {
      code: code.trim(),
      description: description.trim(),
      fee: (fee || '').trim(),
      group: (group || 'Other').trim(),
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error adding billing code:', error);
    const auth = authError(error);
    if (auth) return auth;
    return NextResponse.json(
      { error: 'Failed to add billing code', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

// PUT /api/billing-codes - Update an existing code
export async function PUT(request: NextRequest) {
  try {
    const ctx = await getDataContext();
    const { code, description, fee, group } = await request.json();
    if (!code) {
      return NextResponse.json({ error: 'code is required' }, { status: 400 });
    }
    await updateBillingCode(ctx, code.trim(), {
      description: (description || '').trim(),
      fee: (fee || '').trim(),
      group: (group || 'Other').trim(),
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error updating billing code:', error);
    const auth = authError(error);
    if (auth) return auth;
    return NextResponse.json(
      { error: 'Failed to update billing code', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}

// DELETE /api/billing-codes - Remove a code
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getDataContext();
    const { code } = await request.json();
    if (!code) {
      return NextResponse.json({ error: 'code is required' }, { status: 400 });
    }
    await deleteBillingCode(ctx, code.trim());
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error deleting billing code:', error);
    const auth = authError(error);
    if (auth) return auth;
    return NextResponse.json(
      { error: 'Failed to delete billing code', detail: error?.message || String(error) },
      { status: 500 }
    );
  }
}
