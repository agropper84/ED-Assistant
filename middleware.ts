import { NextRequest, NextResponse } from 'next/server';

// Routes that don't require authentication
const PUBLIC_PATHS = ['/login', '/api/auth', '/pending', '/api/shortcuts'];
const PUBLIC_PREFIXES = ['/_next', '/icons', '/manifest.json', '/icon-', '/favicon'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return NextResponse.next();
  }
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for session cookie (iron-session cookie name)
  const sessionCookie = request.cookies.get('ed-assistant-session');
  if (!sessionCookie?.value) {
    // Redirect to login for page requests, return 401 for API requests
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image).*)',
  ],
};
