import { NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { getUserStatus, getUserInfo } from '@/lib/kv';
import { generateApproveUrl, sendApprovalEmail } from '@/lib/email';

export async function POST() {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId || !session.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const status = await getUserStatus(session.userId);
    if (status !== 'pending') {
      return NextResponse.json({ error: 'Not in pending status' }, { status: 400 });
    }

    const adminEmail = process.env.ADMIN_EMAIL || '';
    if (!adminEmail) {
      return NextResponse.json({ error: 'Admin email not configured' }, { status: 500 });
    }

    const info = await getUserInfo(session.userId);
    const name = info?.name || session.name || session.email;
    const email = info?.email || session.email;

    const approveUrl = generateApproveUrl(session.userId);
    await sendApprovalEmail(adminEmail, name, email, approveUrl);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Resend approval error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
