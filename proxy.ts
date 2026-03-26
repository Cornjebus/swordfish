import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

/**
 * Security headers applied to every response.
 */
const SECURITY_HEADERS: Record<string, string> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://*.clerk.accounts.dev",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://api.stripe.com",
    "frame-src 'self' https://*.clerk.accounts.dev https://*.stripe.com",
  ].join('; '),
};

/** Apply security headers to any NextResponse */
function withSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/webhooks(.*)',
  '/api/health',
  '/api/cron(.*)',
  '/click(.*)',
]);

// Define onboarding routes
const isOnboardingRoute = createRouteMatcher(['/onboarding(.*)']);

// Define protected routes with specific requirements
const isDashboardRoute = createRouteMatcher(['/dashboard(.*)']);
const isAdminRoute = createRouteMatcher(['/admin(.*)']);
const isApiRoute = createRouteMatcher(['/api(.*)']);

// Check database for onboarding completion status (fallback when session is stale)
async function checkOnboardingInDatabase(tenantId: string): Promise<{ completed: boolean; isMsp: boolean }> {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const result = await sql`
      SELECT completed_at, metadata FROM onboarding_progress
      WHERE tenant_id = ${tenantId}
      LIMIT 1
    `;

    if (result.length === 0) {
      return { completed: false, isMsp: false };
    }

    const row = result[0];
    const metadata = (row.metadata || {}) as { accountType?: string };
    return {
      completed: row.completed_at !== null,
      isMsp: metadata.accountType === 'msp',
    };
  } catch {
    // On error, return false to allow normal flow
    return { completed: false, isMsp: false };
  }
}

export default clerkMiddleware(async (auth, request) => {
  const { userId, orgId, orgRole, sessionClaims } = await auth();

  // Allow public routes
  if (isPublicRoute(request)) {
    return withSecurityHeaders(NextResponse.next());
  }

  // Redirect unauthenticated users to sign-in
  if (!userId) {
    const signInUrl = new URL('/sign-in', request.url);
    signInUrl.searchParams.set('redirect_url', request.url);
    return withSecurityHeaders(NextResponse.redirect(signInUrl));
  }

  // Allow API calls needed during onboarding
  if (request.nextUrl.pathname.startsWith('/api/onboarding')) {
    return withSecurityHeaders(NextResponse.next());
  }
  if (request.nextUrl.pathname.startsWith('/api/settings')) {
    return withSecurityHeaders(NextResponse.next());
  }
  if (request.nextUrl.pathname.startsWith('/api/auth')) {
    return withSecurityHeaders(NextResponse.next());
  }
  // Allow admin verify API (needed for dashboard access check)
  if (request.nextUrl.pathname.startsWith('/api/admin')) {
    return withSecurityHeaders(NextResponse.next());
  }

  // Check if user has completed onboarding via public metadata
  const publicMetadata = sessionClaims?.publicMetadata as { onboardingCompleted?: boolean } | undefined;
  let hasCompletedOnboarding = publicMetadata?.onboardingCompleted === true;

  // If session says not completed, check database as fallback (session JWT might be stale)
  if (!hasCompletedOnboarding && !isOnboardingRoute(request)) {
    const tenantId = orgId || `personal_${userId}`;
    const dbStatus = await checkOnboardingInDatabase(tenantId);
    hasCompletedOnboarding = dbStatus.completed;
  }

  // If user hasn't completed onboarding and isn't on onboarding page, redirect there
  if (!hasCompletedOnboarding && !isOnboardingRoute(request)) {
    return withSecurityHeaders(NextResponse.redirect(new URL('/onboarding', request.url)));
  }

  // Create headers with user context for downstream use
  const headers = new Headers(request.headers);
  headers.set('x-user-id', userId);
  if (orgId) headers.set('x-org-id', orgId);
  if (orgRole) headers.set('x-org-role', orgRole);

  // All remaining routes get auth context headers
  return withSecurityHeaders(NextResponse.next({
    request: { headers },
  }));
});

export const config = {
  matcher: [
    // Skip static files and Next.js internals
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
