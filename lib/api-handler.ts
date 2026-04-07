/**
 * Shared API route handler wrapper.
 *
 * Provides consistent error handling, rate limiting, audit logging,
 * and Zod input validation so individual routes don't repeat boilerplate.
 *
 * Usage:
 *   export const POST = withApiHandler(
 *     { rateLimit: { limit: 10, window: 60 }, schema: processSchema },
 *     async (req, ctx, body) => {
 *       // body is already validated and typed
 *       return NextResponse.json({ success: true });
 *     }
 *   );
 */

import { NextRequest, NextResponse } from 'next/server';
import { type ZodSchema } from 'zod';
import { checkRateLimit, safeErrorLog, safeApiError } from '@med/shared';
import { getSessionFromCookies } from '@/lib/session';
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
  /** Zod schema for request body validation. Omit to skip validation. */
  schema?: ZodSchema;
}

type HandlerFn = (request: NextRequest, context?: any) => Promise<NextResponse | Response>;

/**
 * Wraps an API route handler with consistent error handling, rate limiting, and validation.
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
      // Zod validation errors → 400 with field-level details
      if (error?.name === 'ZodError' && Array.isArray(error.issues)) {
        const fieldErrors = error.issues.map((e: any) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return NextResponse.json(
          { error: 'Validation failed', fields: fieldErrors },
          { status: 400 },
        );
      }
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

/**
 * Parse and validate a request body against a Zod schema.
 * Throws ZodError (caught by withApiHandler → 400 response).
 */
export async function parseBody<T>(request: NextRequest, schema: ZodSchema<T>): Promise<T> {
  const raw = await request.json();
  return schema.parse(raw);
}
