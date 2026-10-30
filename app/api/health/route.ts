import { NextResponse } from 'next/server';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export function GET() {
  const supabaseConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const orderProtectionConfigured = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
  const razorpayConfigured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET);
  return NextResponse.json({
    ok: true,
    service: 'durgamma-menswear-storefront',
    integrations: { supabase: supabaseConfigured, orderProtection: orderProtectionConfigured, razorpay: razorpayConfigured },
    checkout: supabaseConfigured && orderProtectionConfigured ? 'cod-api-ready-pending-live-tests' : 'not-configured',
    onlinePayments: razorpayConfigured ? 'server-routes-present-pending-checkout-ui-and-live-tests' : 'not-configured',
    timestamp: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
