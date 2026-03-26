/**
 * API Rate Limiting — Upstash Redis (Sliding Window)
 *
 * Uses @upstash/ratelimit with Redis for distributed rate limiting.
 * Falls back to allowing requests when Redis is unavailable (env vars missing).
 */

import { NextRequest, NextResponse } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// ---------------------------------------------------------------------------
// Tier definitions — keep the same limits as before
// ---------------------------------------------------------------------------

interface RateLimitConfig {
  maxRequests: number;  // Max requests per window
  windowMs: number;     // Window size in milliseconds
  keyPrefix?: string;   // Optional key prefix for different limiters
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  starter:    { maxRequests: 100,  windowMs: 60 * 1000 },  // 100/min
  pro:        { maxRequests: 500,  windowMs: 60 * 1000 },  // 500/min
  enterprise: { maxRequests: 2000, windowMs: 60 * 1000 },  // 2000/min
  default:    { maxRequests: 60,   windowMs: 60 * 1000 },  // 60/min unauthenticated
};

// ---------------------------------------------------------------------------
// Redis client — lazy-init, null when env vars are missing
// ---------------------------------------------------------------------------

let _redis: Redis | null = null;

function getRedis(): Redis | null {
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  _redis = new Redis({ url, token });
  return _redis;
}

// ---------------------------------------------------------------------------
// Per-tier Ratelimit instances (cached)
// ---------------------------------------------------------------------------

const _limiters = new Map<string, Ratelimit>();

function getLimiter(plan: string): Ratelimit | null {
  const redis = getRedis();
  if (!redis) return null;

  const cacheKey = plan;
  if (_limiters.has(cacheKey)) return _limiters.get(cacheKey)!;

  const config = RATE_LIMITS[plan] || RATE_LIMITS.default;
  const windowSec = Math.ceil(config.windowMs / 1000);

  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(config.maxRequests, `${windowSec} s`),
    prefix: 'api',
    analytics: false,
  });

  _limiters.set(cacheKey, limiter);
  return limiter;
}

// ---------------------------------------------------------------------------
// checkRateLimit — same signature as before
// ---------------------------------------------------------------------------

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redis = getRedis();

  // Fallback: no Redis => allow everything with a warning
  if (!redis) {
    console.warn(
      '[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — rate limiting disabled'
    );
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: Date.now() + config.windowMs,
    };
  }

  // Determine which plan this config matches (for limiter cache)
  const plan = Object.entries(RATE_LIMITS).find(
    ([, v]) => v.maxRequests === config.maxRequests && v.windowMs === config.windowMs
  )?.[0] || 'default';

  const limiter = getLimiter(plan);
  if (!limiter) {
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: Date.now() + config.windowMs,
    };
  }

  const fullKey = config.keyPrefix ? `${config.keyPrefix}:${key}` : key;

  try {
    const result = await limiter.limit(fullKey);
    return {
      allowed: result.success,
      remaining: result.remaining,
      resetAt: result.reset,
    };
  } catch (err) {
    console.warn('[rate-limit] Redis error — allowing request', err);
    return {
      allowed: true,
      remaining: config.maxRequests,
      resetAt: Date.now() + config.windowMs,
    };
  }
}

// ---------------------------------------------------------------------------
// rateLimitMiddleware — same signature as before
// ---------------------------------------------------------------------------

export async function rateLimitMiddleware(
  request: NextRequest,
  tenantId: string | null,
  plan: string = 'default'
): Promise<NextResponse | null> {
  const config = RATE_LIMITS[plan] || RATE_LIMITS.default;

  // Use tenant ID or IP as the rate limit key
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'anonymous';
  const key = tenantId || ip;

  const { allowed, remaining, resetAt } = await checkRateLimit(key, {
    ...config,
    keyPrefix: 'api',
  });

  // 429 — rate limited
  if (!allowed) {
    const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
    return NextResponse.json(
      {
        error: 'Rate limit exceeded',
        message: `Too many requests. Please wait ${retryAfter} seconds.`,
        retryAfter,
      },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': config.maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': Math.ceil(resetAt / 1000).toString(),
          'Retry-After': retryAfter.toString(),
        },
      }
    );
  }

  // Allowed — caller adds headers to the response
  return null;
}

// ---------------------------------------------------------------------------
// getRateLimitHeaders — same signature as before
// ---------------------------------------------------------------------------

export async function getRateLimitHeaders(
  tenantId: string | null,
  plan: string = 'default'
): Promise<Record<string, string>> {
  const config = RATE_LIMITS[plan] || RATE_LIMITS.default;
  const key = tenantId || 'anonymous';
  const fullKey = `api:${key}`;

  const redis = getRedis();
  if (!redis) {
    const now = Date.now();
    return {
      'X-RateLimit-Limit': config.maxRequests.toString(),
      'X-RateLimit-Remaining': config.maxRequests.toString(),
      'X-RateLimit-Reset': Math.ceil((now + config.windowMs) / 1000).toString(),
    };
  }

  // Peek at current usage without consuming a token
  const limiter = getLimiter(plan);
  if (!limiter) {
    const now = Date.now();
    return {
      'X-RateLimit-Limit': config.maxRequests.toString(),
      'X-RateLimit-Remaining': config.maxRequests.toString(),
      'X-RateLimit-Reset': Math.ceil((now + config.windowMs) / 1000).toString(),
    };
  }

  try {
    const result = await limiter.getRemaining(fullKey);
    return {
      'X-RateLimit-Limit': config.maxRequests.toString(),
      'X-RateLimit-Remaining': Math.max(0, result.remaining).toString(),
      'X-RateLimit-Reset': Math.ceil(result.reset / 1000).toString(),
    };
  } catch {
    const now = Date.now();
    return {
      'X-RateLimit-Limit': config.maxRequests.toString(),
      'X-RateLimit-Remaining': config.maxRequests.toString(),
      'X-RateLimit-Reset': Math.ceil((now + config.windowMs) / 1000).toString(),
    };
  }
}
