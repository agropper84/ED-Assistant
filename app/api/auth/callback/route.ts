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

// Wraps a KV call so Redis failures don't crash the entire callback
async function tryKV<T>(fn: () => Promise<T>, fallback: T, label: string): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    console.error(`KV error (${label}):`, e?.message || e);
    return fallback;
  }
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
  console.log('OAuth callback: state =', state?.slice(0, 10) + '...', 'isNative =', isNative);

  if (isNative) {
    const valid = await tryKV(() => consumeNativeAuthState(state), false, 'consumeNativeAuthState');
    if (!valid) {
      console.error('Native auth: state not found in KV for state:', state);
      return nativeRedirect('edassistant://auth-error?error=native_state_expired');
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
    // Exchange code for tokens — no KV involved, must succeed
    const tokens = await exchangeCode(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      if (isNative) return nativeRedirect('edassistant://auth-error?error=no_tokens');
      return NextResponse.redirect(new URL('/login?error=no_tokens', url.origin));
    }

    // Get user profile — no KV involved, must succeed
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
    const isAdmin = email.toLowerCase() === adminEmail.toLowerCase();

    // KV reads — degrade gracefully if Redis is down
    const userStatus = await tryKV(() => getUserStatus(userId), null, 'getUserStatus');

    // Build session data
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
    let isApproved = false;

    if (userStatus === 'approved') {
      isApproved = true;
      let spreadsheetId = await tryKV(() => getUserSpreadsheetId(userId), null, 'getUserSpreadsheetId');
      if (!spreadsheetId) {
        try {
          const driveClient = google.drive({ version: 'v3', auth: oauth2Client });
          const searchRes = await driveClient.files.list({
            q: `name = 'ED Assistant - ${email}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
            fields: 'files(id)',
            pageSize: 1,
          });
          spreadsheetId = searchRes.data.files?.[0]?.id || await createUserSpreadsheet(oauth2Client, email);
        } catch {
          spreadsheetId = await createUserSpreadsheet(oauth2Client, email);
        }
        await tryKV(() => setUserSpreadsheetId(userId, spreadsheetId!), undefined, 'setUserSpreadsheetId');
      }
    } else if (!userStatus && isAdmin) {
      // Admin auto-approved on first login
      isApproved = true;
      await tryKV(() => setUserStatus(userId, 'approved'), undefined, 'setUserStatus:admin');
      await tryKV(() => setUserInfo(userId, { email, name: name || email }), undefined, 'setUserInfo:admin');
      let spreadsheetId = await tryKV(() => getUserSpreadsheetId(userId), null, 'getUserSpreadsheetId:admin');
      if (!spreadsheetId) {
        try {
          const driveClient = google.drive({ version: 'v3', auth: oauth2Client });
          const searchRes = await driveClient.files.list({
            q: `name = 'ED Assistant - ${email}' and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
            fields: 'files(id)',
            pageSize: 1,
          });
          spreadsheetId = searchRes.data.files?.[0]?.id || await createUserSpreadsheet(oauth2Client, email);
        } catch {
          spreadsheetId = await createUserSpreadsheet(oauth2Client, email);
        }
        await tryKV(() => setUserSpreadsheetId(userId, spreadsheetId!), undefined, 'setUserSpreadsheetId:admin');
      }
    } else if (!userStatus) {
      // New non-admin user — set pending & notify admin
      await tryKV(() => setUserStatus(userId, 'pending'), undefined, 'setUserStatus:pending');
      await tryKV(() => setUserInfo(userId, { email, name: name || email }), undefined, 'setUserInfo:pending');
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
      await tryKV(() => setAuthExchangeToken(exchangeToken, JSON.stringify(sessionData)), undefined, 'setAuthExchangeToken');
      return nativeRedirect(`edassistant://auth-complete?token=${exchangeToken}`);
    }

    // --- Web flow: set session cookie and redirect ---
    // Session cookie is iron-session (no Redis) — always works
    const session = await getSessionFromCookies();
    session.userId = sessionData.userId;
    session.email = sessionData.email;
    session.name = sessionData.name;
    session.accessToken = sessionData.accessToken;
    session.refreshToken = sessionData.refreshToken;
    session.tokenExpiry = sessionData.tokenExpiry;
    session.approved = sessionData.approved;
    session.lastFullLogin = Date.now();
    session.lastActivity = Date.now();
    session.locked = false;
    await session.save();

    if (isApproved) {
      // Check if terms accepted (skip for admin)
      if (!isAdmin) {
        const settings = await tryKV(() => getUserSettings(userId), null, 'getUserSettings:terms');
        if (!settings?.termsAccepted) {
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
