import { NextRequest, NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { getSessionFromCookies } from '@/lib/session';

export const maxDuration = 120;

// POST /api/backup-audio — Upload audio to Vercel Blob
// Supports both FormData (small files) and raw body streaming (large files)
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

    const ct = request.headers.get('content-type') || '';

    // If raw audio body (not FormData) — stream directly to Blob
    if (!ct.includes('multipart/form-data')) {
      const audioType = ct.split(';')[0].trim() || 'audio/webm';
      const ext = audioType.includes('mp4') ? 'mp4' : 'webm';
      const filename = `encounter-audio/${session.userId}/recording-${Date.now()}.${ext}`;

      console.log(`[backup-audio] Streaming upload (${audioType})`);
      const blob = await put(filename, request.body!, {
        access: 'public',
        addRandomSuffix: true,
        token,
        contentType: audioType,
      });

      console.log(`[backup-audio] Stored: ${blob.url}`);
      return NextResponse.json({ url: blob.url });
    }

    // FormData path (for smaller files / backward compat)
    const formData = await request.formData();
    const audioFile = formData.get('audio');
    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: 'No audio' }, { status: 400 });
    }

    console.log(`[backup-audio] FormData upload: ${(audioFile.size / 1024).toFixed(0)}KB (${audioFile.type || 'unknown type'})`);

    const contentType = audioFile.type || 'audio/webm';
    const blob = await put(
      `encounter-audio/${session.userId}/${audioFile.name}`,
      audioFile,
      { access: 'public', addRandomSuffix: true, token, contentType }
    );

    console.log(`[backup-audio] Stored: ${blob.url}`);
    return NextResponse.json({ url: blob.url });
  } catch (error: any) {
    console.error('Audio backup failed:', error?.message, error?.stack);
    return NextResponse.json({ error: `Backup failed: ${error?.message || 'unknown'}` }, { status: 500 });
  }
}
