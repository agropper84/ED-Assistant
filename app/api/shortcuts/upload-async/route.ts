import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'crypto';
import { put } from '@vercel/blob';
import { getShortcutTokenUser, addPendingAudio } from '@/lib/kv';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

// POST /api/shortcuts/upload-async — Queue audio for background processing
// Stores audio in Vercel Blob (up to 500MB), metadata in KV
// Returns immediately so the watch doesn't time out
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const hash = sha256(token);
    const userId = await getShortcutTokenUser(hash);

    if (!userId) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const formData = await request.formData();
    const audioFile = formData.get('audio');

    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // Read form fields
    const rowIndexStr = formData.get('rowIndex') as string | null;
    const sheetName = formData.get('sheetName') as string | null;
    const append = formData.get('append') === 'true';
    const mode = (formData.get('mode') as string) || 'transcribe';

    const id = randomBytes(16).toString('hex');
    const filename = audioFile.name || 'recording.m4a';

    // Upload audio to Vercel Blob (public store)
    const blobToken = process.env.ed_audio_blob_public_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
    const blob = await put(`pending-audio/${id}/${filename}`, audioFile, {
      access: 'public',
      addRandomSuffix: false,
      token: blobToken,
    });

    // Store metadata in KV (no audio data — just the blob URL)
    await addPendingAudio({
      id,
      userId,
      blobUrl: blob.url,
      filename,
      rowIndex: rowIndexStr ? parseInt(rowIndexStr, 10) : undefined,
      sheetName: sheetName || undefined,
      append,
      mode,
      createdAt: new Date().toISOString(),
    });

    return NextResponse.json({ queued: true, id });
  } catch (error: any) {
    console.error('Async upload error:', error);
    return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 500 });
  }
}
