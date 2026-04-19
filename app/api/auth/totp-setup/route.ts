import { NextRequest, NextResponse } from 'next/server';
import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';
import { getSessionFromCookies } from '@/lib/session';
import { setUserTotpSecret, deleteUserTotpSecret } from '@/lib/kv';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { action } = await request.json().catch(() => ({ action: 'setup' }));

    if (action === 'disable') {
      await deleteUserTotpSecret(session.userId);
      return NextResponse.json({ success: true });
    }

    // Generate new TOTP secret
    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: 'ED Assistant',
      label: session.email || session.name || 'User',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const uri = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(uri, { width: 256, margin: 2 });

    // Store secret temporarily — will be confirmed after verification
    await setUserTotpSecret(session.userId, secret.base32);

    return NextResponse.json({
      qrCode: qrDataUrl,
      secret: secret.base32,
      uri,
    });
  } catch (error: any) {
    console.error('TOTP setup error:', error);
    return NextResponse.json({ error: error?.message || 'Setup failed' }, { status: 500 });
  }
}
