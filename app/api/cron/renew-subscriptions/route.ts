/**
 * Cron: Renew Webhook Subscriptions
 * Runs hourly to renew expiring Gmail/O365 push notification subscriptions
 */

import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { renewExpiringSubscriptions } from '@/lib/webhooks/subscriptions';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret with timing-safe comparison
    const cronSecret = request.headers.get('authorization')?.replace('Bearer ', '') ?? '';
    const expected = process.env.CRON_SECRET ?? '';
    if (!expected || !cronSecret || !crypto.timingSafeEqual(Buffer.from(cronSecret), Buffer.from(expected))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const startTime = Date.now();

    const result = await renewExpiringSubscriptions();

    const summary = {
      success: true,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime,
      renewed: result.renewed,
      registered: result.registered,
      failed: result.failed,
      errors: result.errors.length > 0 ? result.errors : undefined,
    };

    return NextResponse.json(summary);
  } catch (error) {
    console.error('[Cron] Subscription renewal failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Renewal failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
