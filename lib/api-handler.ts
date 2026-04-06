/**
 * Shared API route handler wrapper.
 *
 * Provides consistent error handling, rate limiting, and audit logging
 * so individual routes don't repeat the same boilerplate.
 *
 * Usage:
 *   export const POST = withApiHandler({ rateLimit: { limit: 10, window: 60 } }, async (req) => {
 *     // ... route logic
 *     return NextResponse.json({ success: true });
 *   });
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getSessionFromCookies } from '@/lib/session';
import { safeErrorLog, safeApiError } from '@/lib/safe-error';
import { audit, type AuditAction } from '@/lib/audit';

export interface ApiHandlerOptions {
  /** Rate limit config. Omit to skip rate limiting. */
  rateLimit?: {
    /** Max requests per window. Default: 30 */
    limit?: number;
    /** Window in seconds. Default: 60 */
    window?: number;
    /** Endpoint name for the rate limit key. Default: inferred from URL path. */
    endpoint?: string;
  };
  /** Audit log event name. Omit to skip audit logging. */
  auditEvent?: AuditAction;
  /** If true, skip authentication check (for public routes). Default: false */
  public?: boolean;
}

type HandlerFn = (request: NextRequest, context?: any) => Promise<NextResponse | Response>;

/**
 * Wraps an API route handler with consistent error handling and optional rate limiting.
 */
export function withApiHandler(options: ApiHandlerOptions, handler: HandlerFn): HandlerFn {
  return async (request: NextRequest, context?: any) => {
    try {
      // Auth check
      if (!options.public) {
        const session = await getSessionFromCookies();
        if (!session.userId) {
          return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
        }
      }

      // Rate limiting
      if (options.rateLimit) {
        const session = await getSessionFromCookies();
        const userId = session.userId || 'anon';
        const endpoint = options.rateLimit.endpoint || new URL(request.url).pathname;
        const { allowed } = await checkRateLimit(
          userId,
          endpoint,
          options.rateLimit.limit ?? 30,
          options.rateLimit.window ?? 60,
        );
        if (!allowed) {
          return NextResponse.json(
            { error: 'Rate limit exceeded. Please wait a moment.' },
            { status: 429 },
          );
        }
      }

      // Audit logging
      if (options.auditEvent) {
        const session = await getSessionFromCookies();
        audit(options.auditEvent, session.userId || 'unknown');
      }

      return await handler(request, context);
    } catch (error: any) {
      if (error.message === 'Not authenticated') {
        return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
      }
      if (error.message === 'Not approved') {
        return NextResponse.json({ error: 'Not approved' }, { status: 403 });
      }
      safeErrorLog(`API error [${request.method} ${new URL(request.url).pathname}]:`, error);
      return NextResponse.json({ error: safeApiError(error) }, { status: 500 });
    }
  };
}
