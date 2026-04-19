import { NextRequest, NextResponse } from 'next/server';

// Routes that don't require authentication
const PUBLIC_PATHS = ['/login', '/api/auth', '/pending', '/api/shortcuts', '/tos', '/privacy'];
const PUBLIC_PREFIXES = ['/_next', '/icons', '/manifest.json', '/icon-', '/favicon'];

// Content Security Policy
const CSP_DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://api.anthropic.com https://api.openai.com https://api.deepgram.com https://sheets.googleapis.com https://www.googleapis.com https://accounts.google.com",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('Content-Security-Policy', CSP_DIRECTIVES);
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))) {
    return addSecurityHeaders(NextResponse.next());
  }
  if (PUBLIC_PREFIXES.some(p => pathname.startsWith(p))) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Allow lock screen
  if (pathname === '/locked') {
    return addSecurityHeaders(NextResponse.next());
  }

  // Check for session cookie (iron-session cookie name)
  const sessionCookie = request.cookies.get('ed-assistant-session');
  if (!sessionCookie?.value) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return addSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image).*)',
  ],
};
