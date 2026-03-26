/**
 * Stripe Webhook Handler
 *
 * Processes Stripe webhook events for subscription lifecycle management.
 * Verifies webhook signatures, handles subscription changes, and updates
 * tenant plan/status in the database accordingly.
 */

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { sql } from '@/lib/db';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-12-15.clover',
});

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';

export async function POST(request: NextRequest) {
  let event: Stripe.Event;

  try {
    const body = await request.text();
    const signature = request.headers.get('stripe-signature');

    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header' },
        { status: 400 }
      );
    }

    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionCreated(subscription);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdated(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await handlePaymentFailed(invoice);
        break;
      }

      default:
        // Unhandled event type -- acknowledge receipt
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`Error processing webhook event ${event.type}:`, error);
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

/**
 * Map Stripe tier metadata or price to our plan names
 */
function resolvePlan(subscription: Stripe.Subscription): 'starter' | 'pro' | 'enterprise' | null {
  const tier = subscription.metadata?.tier;
  if (tier === 'starter' || tier === 'pro' || tier === 'enterprise') {
    return tier;
  }

  // Fallback: check price ID conventions
  const priceId = subscription.items.data[0]?.price?.id || '';
  if (priceId.includes('enterprise')) return 'enterprise';
  if (priceId.includes('pro')) return 'pro';
  if (priceId.includes('starter')) return 'starter';

  return null;
}

/**
 * Find the tenant linked to a Stripe customer via metadata.tenantId
 */
async function findTenantByCustomer(customerId: string): Promise<string | null> {
  try {
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer;
    const tenantId = customer.metadata?.tenantId;
    if (tenantId) return tenantId;
  } catch {
    // Customer retrieval failed; fall through
  }
  return null;
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;

  const tenantId = await findTenantByCustomer(customerId);
  if (!tenantId) {
    console.warn('Subscription created for unknown tenant, customer:', customerId);
    return;
  }

  const plan = resolvePlan(subscription);
  if (!plan) return;

  await sql`
    UPDATE tenants SET
      plan = ${plan},
      settings = COALESCE(settings, '{}'::jsonb) || ${JSON.stringify({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
      })}::jsonb,
      updated_at = NOW()
    WHERE id = ${tenantId}::uuid
  `;

  console.log(`Subscription created: tenant=${tenantId} plan=${plan}`);
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;

  const tenantId = await findTenantByCustomer(customerId);
  if (!tenantId) {
    console.warn('Subscription updated for unknown tenant, customer:', customerId);
    return;
  }

  const plan = resolvePlan(subscription);

  const updates: Record<string, unknown> = {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
  };

  if (plan) {
    await sql`
      UPDATE tenants SET
        plan = ${plan},
        settings = COALESCE(settings, '{}'::jsonb) || ${JSON.stringify(updates)}::jsonb,
        updated_at = NOW()
      WHERE id = ${tenantId}::uuid
    `;
  } else {
    await sql`
      UPDATE tenants SET
        settings = COALESCE(settings, '{}'::jsonb) || ${JSON.stringify(updates)}::jsonb,
        updated_at = NOW()
      WHERE id = ${tenantId}::uuid
    `;
  }

  console.log(`Subscription updated: tenant=${tenantId} plan=${plan || 'unchanged'} status=${subscription.status}`);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer.id;

  const tenantId = await findTenantByCustomer(customerId);
  if (!tenantId) {
    console.warn('Subscription deleted for unknown tenant, customer:', customerId);
    return;
  }

  // Downgrade to starter plan when subscription is cancelled
  await sql`
    UPDATE tenants SET
      plan = 'starter',
      settings = COALESCE(settings, '{}'::jsonb) || ${JSON.stringify({
        subscriptionStatus: 'cancelled',
        cancelledAt: new Date().toISOString(),
      })}::jsonb,
      updated_at = NOW()
    WHERE id = ${tenantId}::uuid
  `;

  console.log(`Subscription deleted: tenant=${tenantId} downgraded to starter`);
}

async function handlePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = typeof invoice.customer === 'string'
    ? invoice.customer
    : typeof invoice.customer === 'object' && invoice.customer !== null
      ? invoice.customer.id
      : null;

  if (!customerId) return;

  const tenantId = await findTenantByCustomer(customerId);
  if (!tenantId) {
    console.warn('Payment failed for unknown tenant, customer:', customerId);
    return;
  }

  // Log the payment failure in tenant settings
  await sql`
    UPDATE tenants SET
      settings = COALESCE(settings, '{}'::jsonb) || ${JSON.stringify({
        lastPaymentFailed: true,
        lastPaymentFailedAt: new Date().toISOString(),
        paymentFailureReason: invoice.last_finalization_error?.message || 'Payment failed',
      })}::jsonb,
      updated_at = NOW()
    WHERE id = ${tenantId}::uuid
  `;

  // Check attempt count -- suspend after 3 failures
  const tenant = await sql`
    SELECT settings FROM tenants WHERE id = ${tenantId}::uuid LIMIT 1
  `;

  const settings = tenant[0]?.settings || {};
  const failCount = (settings.paymentFailureCount || 0) + 1;

  if (failCount >= 3) {
    await sql`
      UPDATE tenants SET
        status = 'suspended',
        settings = COALESCE(settings, '{}'::jsonb) || ${JSON.stringify({ paymentFailureCount: failCount })}::jsonb,
        updated_at = NOW()
      WHERE id = ${tenantId}::uuid
    `;
  } else {
    await sql`
      UPDATE tenants SET
        settings = COALESCE(settings, '{}'::jsonb) || ${JSON.stringify({ paymentFailureCount: failCount })}::jsonb,
        updated_at = NOW()
      WHERE id = ${tenantId}::uuid
    `;
  }

  console.log(`Payment failed: tenant=${tenantId} attempt=${failCount}${failCount >= 3 ? ' (suspended)' : ''}`);
}
