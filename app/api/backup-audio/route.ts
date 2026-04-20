import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getSessionFromCookies } from '@/lib/session';

export const maxDuration = 60;

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

    console.log(`[backup-audio] Uploading ${(audioFile.size / 1024).toFixed(0)}KB (${audioFile.type || 'unknown type'})`);

    const blob = await put(
      `encounter-audio/${session.userId}/${audioFile.name}`,
      audioFile,
      { access: 'public', addRandomSuffix: true }
    );

    console.log(`[backup-audio] Stored: ${blob.url}`);
    return NextResponse.json({ url: blob.url });
  } catch (error: any) {
    console.error('Audio backup failed:', error?.message, error?.stack);
    return NextResponse.json({ error: `Backup failed: ${error?.message || 'unknown'}` }, { status: 500 });
  }
}
