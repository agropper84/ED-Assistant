import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromCookies } from '@/lib/session';
import { setUserStatus, getUserInfo } from '@/lib/kv';
import { ADMIN_EMAIL } from '@/lib/config';

// POST /api/auth/admin-approve — Approve a user by email (admin only)
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId || !session.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Only admin can approve
    if (session.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    await setUserStatus(userId, 'approved');
    const info = await getUserInfo(userId);

    return NextResponse.json({ success: true, email: info?.email || 'unknown' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET /api/auth/admin-approve — List pending users (admin only)
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromCookies();
    if (!session.userId || !session.email) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (session.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }

    // We can't scan Redis keys from Vercel KV easily, so return instructions
    return NextResponse.json({
      message: 'To approve a user, POST with { "userId": "<google-user-id>" }',
      note: 'The userId is shown on the pending page or in the approval email',
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
