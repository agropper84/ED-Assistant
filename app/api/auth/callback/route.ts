import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { google } from 'googleapis';
import { exchangeCode, getOAuth2Client } from '@/lib/oauth';
import { getSessionFromCookies } from '@/lib/session';
import { getUserSpreadsheetId, setUserSpreadsheetId, getUserStatus, setUserStatus, setUserInfo, getUserSettings } from '@/lib/kv';
import { createUserSpreadsheet } from '@/lib/setup-sheet';
import { generateApproveUrl, sendApprovalEmail } from '@/lib/email';

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(new URL('/login?error=access_denied', url.origin));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/login?error=missing_params', url.origin));
  }

  // Validate CSRF state
  const cookieStore = await cookies();
  const savedState = cookieStore.get('oauth_state')?.value;
  cookieStore.delete('oauth_state');

  if (!savedState || savedState !== state) {
    return NextResponse.redirect(new URL('/login?error=invalid_state', url.origin));
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCode(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      return NextResponse.redirect(new URL('/login?error=no_tokens', url.origin));
    }

    // Get user profile
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const { id: userId, email, name } = userInfo.data;

    if (!userId || !email) {
      return NextResponse.redirect(new URL('/login?error=no_user_info', url.origin));
    }

    const adminEmail = process.env.ADMIN_EMAIL || '';
    const status = await getUserStatus(userId);

    // Create session (shared across all branches)
    const session = await getSessionFromCookies();
    session.userId = userId;
    session.email = email;
    session.name = name || email;
    session.accessToken = tokens.access_token;
    session.refreshToken = tokens.refresh_token;
    session.tokenExpiry = tokens.expiry_date || Date.now() + 3600 * 1000;

    if (status === 'approved') {
      // Already approved — ensure spreadsheet exists
      let spreadsheetId = await getUserSpreadsheetId(userId);
      if (!spreadsheetId) {
        spreadsheetId = await createUserSpreadsheet(oauth2Client, email);
        await setUserSpreadsheetId(userId, spreadsheetId);
      }
      session.approved = true;
      await session.save();

      // Check if terms accepted (skip for admin)
      if (email.toLowerCase() !== adminEmail.toLowerCase()) {
        const settings = await getUserSettings(userId) || {};
        if (!settings.termsAccepted) {
          return NextResponse.redirect(new URL('/terms', url.origin));
        }
      }

      return NextResponse.redirect(new URL('/', url.origin));
    }

    if (status === 'pending') {
      // Still pending — redirect to waiting page
      session.approved = false;
      await session.save();
      return NextResponse.redirect(new URL('/pending', url.origin));
    }

    // First login (status === null)
    if (email.toLowerCase() === adminEmail.toLowerCase()) {
      // Admin auto-approved
      await setUserStatus(userId, 'approved');
      await setUserInfo(userId, { email, name: name || email });
      let spreadsheetId = await getUserSpreadsheetId(userId);
      if (!spreadsheetId) {
        spreadsheetId = await createUserSpreadsheet(oauth2Client, email);
        await setUserSpreadsheetId(userId, spreadsheetId);
      }
      session.approved = true;
      await session.save();
      return NextResponse.redirect(new URL('/', url.origin));
    }

    // New non-admin user — set pending & notify admin
    await setUserStatus(userId, 'pending');
    await setUserInfo(userId, { email, name: name || email });

    if (adminEmail) {
      try {
        const approveUrl = generateApproveUrl(userId);
        await sendApprovalEmail(adminEmail, name || email, email, approveUrl);
      } catch (emailErr) {
        console.error('Failed to send approval email:', emailErr);
        // Don't block login flow if email fails
      }
    }

    session.approved = false;
    await session.save();
    return NextResponse.redirect(new URL('/pending', url.origin));
  } catch (err: any) {
    console.error('OAuth callback error:', err);
    return NextResponse.redirect(new URL('/login?error=callback_failed', url.origin));
  }
}
