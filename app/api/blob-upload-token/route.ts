import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getSessionFromCookies } from '@/lib/session';

// Handle client-side Vercel Blob uploads (bypasses 4.5MB serverless limit)
// Uses BLOB_READ_WRITE_TOKEN env var automatically
export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        maximumSizeInBytes: 500 * 1024 * 1024,
        allowedContentTypes: ['application/octet-stream', 'audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg', 'video/webm'],
        tokenPayload: JSON.stringify({ userId: session.userId }),
        addRandomSuffix: true,
      }),
      onUploadCompleted: async () => {},
    });

    return NextResponse.json(jsonResponse);
  } catch (error: any) {
    console.error('[blob-upload] Error:', error);
    return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 500 });
  }
}
