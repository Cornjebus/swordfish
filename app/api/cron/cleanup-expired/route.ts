/**
 * Cleanup Expired Resources Cron
 * Runs daily to remove stale OAuth states, expired rewritten URLs, etc.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { sql } from '@/lib/db';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Validate cron secret using timing-safe comparison
  const cronSecret =
    request.headers.get('authorization')?.replace('Bearer ', '') ?? '';
  const expected = process.env.CRON_SECRET ?? '';

  if (
    !expected ||
    !cronSecret ||
    cronSecret.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(cronSecret), Buffer.from(expected))
  ) {
    return new Response('Unauthorized', { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // Clean up expired OAuth states
  try {
    await sql`DELETE FROM oauth_states WHERE expires_at < NOW()`;
    results.oauthStates = 'cleaned';
  } catch (error) {
    results.oauthStates =
      error instanceof Error ? error.message : 'unknown error';
  }

  // Clean up expired rewritten URLs (if the cleanup function exists)
  try {
    await sql`SELECT cleanup_expired_rewritten_urls()`;
    results.rewrittenUrls = 'cleaned';
  } catch {
    // Function may not exist yet — that is fine
    results.rewrittenUrls = 'skipped (function not found)';
  }

  return NextResponse.json({ status: 'ok', cleaned: true, results });
}
