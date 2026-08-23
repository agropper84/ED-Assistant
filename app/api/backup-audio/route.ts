import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getSessionFromCookies } from '@/lib/session';

export const maxDuration = 120;

// POST /api/backup-audio — Upload audio to Vercel Blob
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const token = process.env.ed_audio_blob_public_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) {
      console.error('[backup-audio] No blob token configured');
      return NextResponse.json({ error: 'Blob storage not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio');
    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: 'No audio file in request' }, { status: 400 });
    }

    console.log(`[backup-audio] Uploading ${(audioFile.size / 1024).toFixed(0)}KB (${audioFile.type || 'unknown'})`);

    const contentType = audioFile.type || 'audio/webm';
    const blob = await put(
      `encounter-audio/${session.userId}/${audioFile.name}`,
      audioFile,
      { access: 'public', addRandomSuffix: true, token, contentType }
    );

    console.log(`[backup-audio] Stored: ${blob.url} (${(audioFile.size / 1024).toFixed(0)}KB)`);
    return NextResponse.json({ url: blob.url });
  } catch (error: any) {
    console.error('[backup-audio] FAILED:', error?.message, error?.stack);
    return NextResponse.json({ error: `Backup failed: ${error?.message || 'unknown'}` }, { status: 500 });
  }
}
