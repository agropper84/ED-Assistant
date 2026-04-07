import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { google } from 'googleapis';
import crypto from 'crypto';
import { exchangeCode, getOAuth2Client } from '@/lib/oauth';
import { getSessionFromCookies } from '@/lib/session';
import { getUserSpreadsheetId, setUserSpreadsheetId, getUserStatus, setUserStatus, setUserInfo, getUserSettings, consumeNativeAuthState, setAuthExchangeToken } from '@/lib/kv';
import { createUserSpreadsheet } from '@/lib/setup-sheet';
import { generateApproveUrl, sendApprovalEmail } from '@/lib/email';

function nativeRedirect(url: string): Response {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>` +
    `<script>window.location.replace(${JSON.stringify(url)});</script>` +
    `<p style="font-family:system-ui;color:#999;text-align:center;margin-top:40vh">Returning to app…</p>` +
    `</body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  );
}

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

  // Detect native app flow (state ends with _NATIVE)
  const isNative = !!state && state.endsWith('_NATIVE');

  if (isNative) {
    const valid = await consumeNativeAuthState(state);
    if (!valid) {
      return nativeRedirect('edassistant://auth-error?error=invalid_state');
    }
  } else {
    const cookieStore = await cookies();
    const savedState = cookieStore.get('oauth_state')?.value;
    cookieStore.delete('oauth_state');
    if (!savedState || savedState !== state) {
      return NextResponse.redirect(new URL('/login?error=invalid_state', url.origin));
    }
  }

  try {
    // Exchange code for tokens
    const tokens = await exchangeCode(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      if (isNative) return nativeRedirect('edassistant://auth-error?error=no_tokens');
      return NextResponse.redirect(new URL('/login?error=no_tokens', url.origin));
    }

    // Get user profile
    const oauth2Client = getOAuth2Client();
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();
    const { id: userId, email, name } = userInfo.data;

    if (!userId || !email) {
      if (isNative) return nativeRedirect('edassistant://auth-error?error=no_user_info');
      return NextResponse.redirect(new URL('/login?error=no_user_info', url.origin));
    }

    const adminEmail = process.env.ADMIN_EMAIL || '';
    const userStatus = await getUserStatus(userId);

    // Build session data (used for both web session and native exchange token)
    const sessionData = {
      userId,
      email,
      name: name || email,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiry: tokens.expiry_date || Date.now() + 3600 * 1000,
      approved: false as boolean,
    };

    // Determine approval status and ensure spreadsheet exists
    let isApproved = userStatus === 'approved';

    if (userStatus === 'approved') {
      let spreadsheetId = await getUserSpreadsheetId(userId);
      if (!spreadsheetId) {
        spreadsheetId = await createUserSpreadsheet(oauth2Client, email);
        await setUserSpreadsheetId(userId, spreadsheetId);
      }
      isApproved = true;
    } else if (!userStatus && email.toLowerCase() === adminEmail.toLowerCase()) {
      // Admin auto-approved on first login
      await setUserStatus(userId, 'approved');
      await setUserInfo(userId, { email, name: name || email });
      let spreadsheetId = await getUserSpreadsheetId(userId);
      if (!spreadsheetId) {
        spreadsheetId = await createUserSpreadsheet(oauth2Client, email);
        await setUserSpreadsheetId(userId, spreadsheetId);
      }
      isApproved = true;
    } else if (!userStatus) {
      // New non-admin user — set pending & notify admin
      await setUserStatus(userId, 'pending');
      await setUserInfo(userId, { email, name: name || email });
      if (adminEmail) {
        try {
          const approveUrl = generateApproveUrl(userId);
          await sendApprovalEmail(adminEmail, name || email, email, approveUrl);
        } catch (emailErr) {
          console.error('Failed to send approval email:', emailErr);
        }
      }
    }

    sessionData.approved = isApproved;

    // --- Native flow: store session as exchange token, redirect to custom scheme ---
    if (isNative) {
      const exchangeToken = crypto.randomBytes(32).toString('hex');
      await setAuthExchangeToken(exchangeToken, JSON.stringify(sessionData));
      return nativeRedirect(`edassistant://auth-complete?token=${exchangeToken}`);
    }

    // --- Web flow: set session cookie and redirect ---
    const session = await getSessionFromCookies();
    session.userId = sessionData.userId;
    session.email = sessionData.email;
    session.name = sessionData.name;
    session.accessToken = sessionData.accessToken;
    session.refreshToken = sessionData.refreshToken;
    session.tokenExpiry = sessionData.tokenExpiry;
    session.approved = sessionData.approved;
    await session.save();

    if (isApproved) {
      // Check if terms accepted (skip for admin)
      if (email.toLowerCase() !== adminEmail.toLowerCase()) {
        const settings = await getUserSettings(userId) || {};
        if (!settings.termsAccepted) {
          return NextResponse.redirect(new URL('/terms', url.origin));
        }
      }
      return NextResponse.redirect(new URL('/', url.origin));
    }

    return NextResponse.redirect(new URL('/pending', url.origin));
  } catch (err: any) {
    console.error('OAuth callback error:', err);
    if (isNative) return nativeRedirect('edassistant://auth-error?error=callback_failed');
    return NextResponse.redirect(new URL('/login?error=callback_failed', url.origin));
  }
}
