import { NextRequest, NextResponse } from 'next/server';
import { getSheetsContext, getStyleGuideFromSheet, saveStyleGuideToSheet } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const ctx = await getSheetsContext();
    const guide = await getStyleGuideFromSheet(ctx);
    return NextResponse.json(guide);
  } catch (error: any) {
    console.error('Error reading style guide:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to read style guide', detail: error?.message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ctx = await getSheetsContext();
    const guide = await request.json();
    await saveStyleGuideToSheet(ctx, guide);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving style guide:', error);
    if (error?.message?.includes('Not approved')) {
      return NextResponse.json({ error: 'Not approved' }, { status: 403 });
    }
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json(
      { error: 'Failed to save style guide', detail: error?.message },
      { status: 500 }
    );
  }
}
