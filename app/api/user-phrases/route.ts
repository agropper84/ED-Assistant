import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getSheetsContext, getUserPhrases, saveUserPhrases } from '@/lib/google-sheets';

/** GET — Fetch user's saved phrases for autocomplete */
export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId || !session.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const ctx = await getSheetsContext();
    const phrases = await getUserPhrases(ctx);
    return NextResponse.json({ phrases });
  } catch (error: any) {
    console.error('Error fetching user phrases:', error);
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch phrases' }, { status: 500 });
  }
}

/** POST — Save new phrases extracted from user input */
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId || !session.accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { phrases } = await request.json();
    if (!Array.isArray(phrases)) {
      return NextResponse.json({ error: 'phrases must be an array' }, { status: 400 });
    }

    const ctx = await getSheetsContext();
    await saveUserPhrases(ctx, phrases);
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('Error saving user phrases:', error);
    if (error?.message?.includes('Not authenticated') || error?.message?.includes('re-login')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to save phrases' }, { status: 500 });
  }
}
