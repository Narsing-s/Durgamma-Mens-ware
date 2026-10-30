import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  if (origin && site && new URL(origin).origin !== new URL(site).origin) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
  }

  const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
  if (!url || !service) {
    return NextResponse.json({ error: 'Order service is not configured.' }, { status: 503 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const razorpayOrderId = body.razorpayOrderId;
  if (typeof razorpayOrderId !== 'string' || !/^order_[A-Za-z0-9]+$/.test(razorpayOrderId)) {
    return NextResponse.json({ error: 'Invalid payment order.' }, { status: 400 });
  }

  const db = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: order, error: lookupError } = await db
    .from('orders')
    .select('id,payment_status,order_status')
    .eq('razorpay_order_id', razorpayOrderId)
    .maybeSingle();

  if (lookupError) {
    return NextResponse.json({ error: 'Could not locate the pending order.' }, { status: 503 });
  }
  if (!order) return NextResponse.json({ ok: true, cancelled: false });

  const { data, error } = await db.rpc('cancel_unpaid_store_order', { p_order_id: order.id });
  if (error) {
    return NextResponse.json({ error: 'Could not release the reserved stock yet.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true, cancelled: data === true });
}
