import { NextRequest, NextResponse } from 'next/server';
import { getDataContext, getParseFormats, saveParseFormat, deleteParseFormat } from '@/lib/data-layer';

// GET - list all saved parse formats
export async function GET() {
  try {
    const ctx = await getDataContext();
    const formats = await getParseFormats(ctx);
    return NextResponse.json(formats);
  } catch (err: any) {
    if (err.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Error fetching parse formats:', err);
    return NextResponse.json({ error: 'Failed to fetch formats' }, { status: 500 });
  }
}

// POST - save a parse format
export async function POST(req: NextRequest) {
  try {
    const ctx = await getDataContext();
    const format = await req.json();
    if (!format.name?.trim()) {
      return NextResponse.json({ error: 'Format name is required' }, { status: 400 });
    }
    await saveParseFormat(ctx, format);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Error saving parse format:', err);
    return NextResponse.json({ error: 'Failed to save format' }, { status: 500 });
  }
}

// DELETE - delete a parse format by name
export async function DELETE(req: NextRequest) {
  try {
    const ctx = await getDataContext();
    const { name } = await req.json();
    if (!name?.trim()) {
      return NextResponse.json({ error: 'Format name is required' }, { status: 400 });
    }
    await deleteParseFormat(ctx, name);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    if (err.message === 'Not authenticated') {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    console.error('Error deleting parse format:', err);
    return NextResponse.json({ error: 'Failed to delete format' }, { status: 500 });
  }
}
