import { getIronSession, IronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';

export interface SessionData {
  userId: string;
  email: string;
  name: string;
  accessToken: string;
  refreshToken: string;
  tokenExpiry: number;
  approved: boolean;
  lastActivity?: number;
  lastFullLogin?: number;
  locked?: boolean;
}

const sessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: 'ed-assistant-session',
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  },
};

export async function getSession(req: NextRequest): Promise<IronSession<SessionData>> {
  const res = new Response();
  const session = await getIronSession<SessionData>(req, res, sessionOptions);
  return session;
}

export async function getSessionFromCookies(): Promise<IronSession<SessionData>> {
  const cookieStore = await cookies();
  const session = await getIronSession<SessionData>(cookieStore, sessionOptions);

  // Update last activity on every session access
  if (session.userId && !session.locked) {
    session.lastActivity = Date.now();
    // Don't await save here — will be saved by the caller or next request
  }

  return session;
}

/** Check if session should be locked due to timeout. Call from page-level. */
export function isSessionTimedOut(session: IronSession<SessionData>, timeoutMinutes: number): boolean {
  if (!session.lastActivity) return false;
  return Date.now() - session.lastActivity > timeoutMinutes * 60 * 1000;
}

/** Check if full re-login is required (24h policy). */
export function isFullLoginRequired(session: IronSession<SessionData>): boolean {
  if (!session.lastFullLogin) return false;
  return Date.now() - session.lastFullLogin > 24 * 60 * 60 * 1000;
}
