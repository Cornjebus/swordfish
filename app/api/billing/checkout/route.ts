/**
 * Billing Checkout API
 *
 * Creates Stripe Checkout Sessions for tenant plan upgrades.
 * Requires Clerk authentication. Looks up or creates a Stripe customer
 * for the tenant, then returns a checkout URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import Stripe from 'stripe';
import { sql } from '@/lib/db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-12-15.clover',
});

// MSP plan pricing -- price IDs should be configured in Stripe Dashboard
// These are placeholder IDs; replace with actual Stripe price IDs in production
const PLAN_PRICE_IDS: Record<string, { monthly: string; annual: string }> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || 'price_starter_monthly',
    annual: process.env.STRIPE_PRICE_STARTER_ANNUAL || 'price_starter_annual',
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || 'price_pro_monthly',
    annual: process.env.STRIPE_PRICE_PRO_ANNUAL || 'price_pro_annual',
  },
  enterprise: {
    monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY || 'price_enterprise_monthly',
    annual: process.env.STRIPE_PRICE_ENTERPRISE_ANNUAL || 'price_enterprise_annual',
  },
};

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify the user exists and has appropriate access
    const userResult = await sql`
      SELECT id, is_msp_user, tenant_id, email, role FROM users
      WHERE clerk_user_id = ${userId}
      LIMIT 1
    `;

    const user = userResult[0];
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const { tenant_id, plan, period = 'monthly' } = body;

    if (!tenant_id || !plan) {
      return NextResponse.json(
        { error: 'tenant_id and plan are required' },
        { status: 400 }
      );
    }

    // Validate plan
    if (!PLAN_PRICE_IDS[plan]) {
      return NextResponse.json(
        { error: 'Invalid plan. Must be starter, pro, or enterprise.' },
        { status: 400 }
      );
    }

    // Validate period
    if (period !== 'monthly' && period !== 'annual') {
      return NextResponse.json(
        { error: 'Invalid period. Must be monthly or annual.' },
        { status: 400 }
      );
    }

    // Verify access to the tenant
    if (!user.is_msp_user && user.tenant_id !== tenant_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get tenant
    const tenantResult = await sql`
      SELECT id, name, settings FROM tenants WHERE id = ${tenant_id}::uuid LIMIT 1
    `;

    if (tenantResult.length === 0) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const tenant = tenantResult[0];
    const tenantSettings = tenant.settings || {};
    let stripeCustomerId = tenantSettings.stripeCustomerId as string | undefined;

    // Create or retrieve Stripe customer
    if (!stripeCustomerId) {
      const customer = await stripe.customers.create({
        email: user.email as string,
        name: tenant.name as string,
        metadata: { tenantId: tenant_id },
      });
      stripeCustomerId = customer.id;

      // Store the Stripe customer ID
      await sql`
        UPDATE tenants SET
          settings = COALESCE(settings, '{}'::jsonb) || ${JSON.stringify({ stripeCustomerId })}::jsonb,
          updated_at = NOW()
        WHERE id = ${tenant_id}::uuid
      `;
    }

    // Get the price ID for the selected plan and period
    const priceId = PLAN_PRICE_IDS[plan][period as 'monthly' | 'annual'];

    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/admin/tenants/${tenant_id}?checkout=success`,
      cancel_url: `${origin}/admin/tenants/${tenant_id}?checkout=cancelled`,
      metadata: {
        tenantId: tenant_id,
        plan,
        period,
      },
      subscription_data: {
        metadata: {
          tenantId: tenant_id,
          tier: plan,
        },
      },
    });

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error('Checkout session creation error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    );
  }
}
