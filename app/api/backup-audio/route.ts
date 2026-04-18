import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getSessionFromCookies } from '@/lib/session';

export const maxDuration = 30;

// POST /api/backup-audio — Backup encounter audio to Vercel Blob
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio');
    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: 'No audio' }, { status: 400 });
    }

    const blob = await put(
      `audio-backup/${session.userId}/${audioFile.name}`,
      audioFile,
      { access: 'public', addRandomSuffix: true }
    );

    return NextResponse.json({ url: blob.url });
  } catch (error: any) {
    console.error('Audio backup failed:', error?.message);
    return NextResponse.json({ error: 'Backup failed' }, { status: 500 });
  }
}
