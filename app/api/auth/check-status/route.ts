import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import { getSessionFromCookies } from '@/lib/session';
import { getUserStatus, getUserSpreadsheetId, setUserSpreadsheetId } from '@/lib/kv';
import { getOAuth2Client } from '@/lib/oauth';
import { createUserSpreadsheet } from '@/lib/setup-sheet';

export async function GET() {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const status = await getUserStatus(session.userId);

    // If approved, update session and ensure spreadsheet exists
    if (status === 'approved' && !session.approved) {
      session.approved = true;
      await session.save();

      // Create spreadsheet if it doesn't exist yet
      let spreadsheetId = await getUserSpreadsheetId(session.userId);
      if (!spreadsheetId && session.accessToken) {
        try {
          const oauth2Client = getOAuth2Client();
          oauth2Client.setCredentials({
            access_token: session.accessToken,
            refresh_token: session.refreshToken,
          });
          spreadsheetId = await createUserSpreadsheet(oauth2Client, session.email || '');
          await setUserSpreadsheetId(session.userId, spreadsheetId);
        } catch (err) {
          console.error('Failed to create spreadsheet on approval:', err);
        }
      }
    }

    return NextResponse.json({ status: status || 'unknown' });
  } catch {
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}
