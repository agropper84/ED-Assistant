import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getSessionFromCookies } from '@/lib/session';

// Handle client-side Vercel Blob uploads (bypasses 4.5MB serverless limit)
export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Use the explicit token — handleUpload defaults to BLOB_READ_WRITE_TOKEN
    const token = process.env.BLOB_READ_WRITE_TOKEN || process.env.ed_audio_blob_public_READ_WRITE_TOKEN;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        return {
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB max
          allowedContentTypes: ['application/octet-stream', 'audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg', 'video/webm'],
          tokenPayload: JSON.stringify({ userId: session.userId }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.log(`[blob-upload] Completed: ${blob.url} (${blob.pathname})`);
      },
      token,
    });

    return NextResponse.json(jsonResponse);
  } catch (error: any) {
    console.error('[blob-upload] Error:', error);
    return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 500 });
  }
}
