import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { getSessionFromCookies } from '@/lib/session';

// Client upload handler for large audio files
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const session = await getSessionFromCookies();
    if (!session.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg', 'video/webm', 'application/octet-stream'],
        tokenPayload: JSON.stringify({ userId: session.userId }),
        maximumSizeInBytes: 500 * 1024 * 1024, // 500MB max
        addRandomSuffix: true, // PHI security: randomize blob path so URLs are not guessable
      }),
      onUploadCompleted: async () => {
        // Audio uploaded — transcription will be triggered separately
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
