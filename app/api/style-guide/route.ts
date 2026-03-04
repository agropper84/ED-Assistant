import { NextRequest, NextResponse } from 'next/server';
import { getStyleGuideFromSheet, saveStyleGuideToSheet } from '@/lib/google-sheets';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const guide = await getStyleGuideFromSheet();
    return NextResponse.json(guide);
  } catch (error: any) {
    console.error('Error reading style guide:', error);
    return NextResponse.json(
      { error: 'Failed to read style guide', detail: error?.message },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const guide = await request.json();
    await saveStyleGuideToSheet(guide);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving style guide:', error);
    return NextResponse.json(
      { error: 'Failed to save style guide', detail: error?.message },
      { status: 500 }
    );
  }
}
