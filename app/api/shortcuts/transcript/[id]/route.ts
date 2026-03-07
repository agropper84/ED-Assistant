import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getShortcutTranscript, deleteShortcutTranscript } from '@/lib/kv';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionFromCookies();
  if (!session.userId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const data = await getShortcutTranscript(id);

  if (!data) {
    return NextResponse.json({ error: 'Transcript not found or expired' }, { status: 404 });
  }

  if (data.userId !== session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // One-time use — delete after reading
  await deleteShortcutTranscript(id);

  return NextResponse.json({ transcript: data.transcript });
}
