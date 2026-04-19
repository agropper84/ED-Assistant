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

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // Validate the upload is from an authenticated user
        return {
          maximumSizeInBytes: 100 * 1024 * 1024, // 100MB max
          allowedContentTypes: ['application/octet-stream', 'audio/webm', 'audio/mp4', 'audio/ogg'],
          tokenPayload: JSON.stringify({ userId: session.userId }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        // Could log upload completion if needed
        console.log(`[blob-upload] Completed: ${blob.url} (${blob.pathname})`);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error: any) {
    console.error('[blob-upload] Error:', error);
    return NextResponse.json({ error: error?.message || 'Upload failed' }, { status: 500 });
  }
}
