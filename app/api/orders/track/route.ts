import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function clientIp(request: NextRequest): string | null {
  const value = request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-vercel-forwarded-for') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for');
  const ip = value?.split(',')[0]?.trim();
  return ip && ip !== 'unknown' ? ip : null;
}

async function createDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function allowLookup(request: NextRequest, db: NonNullable<Awaited<ReturnType<typeof createDb>>>) {
  const ip = clientIp(request);
  if (!ip) return 'unavailable' as const;
  const hash = createHash('sha256').update(ip).digest('hex');
  const { data, error } = await db.rpc('consume_tracking_rate_limit', { p_ip_hash: hash });
  if (error || typeof data !== 'number') return 'unavailable' as const;
  return data > 20 ? 'limited' as const : 'ok' as const;
}

function publicOrder(data: any) {
  const latestReturn = (data.return_requests || []).sort((a: any, b: any) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;
  return {
    ok: true,
    orderNumber: data.order_number,
    status: data.order_status,
    paymentStatus: data.payment_status,
    total: data.total_inr,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    deliveredAt: data.delivered_at,
    returnRequest: latestReturn,
    statusHistory: (data.order_status_events || []).sort((a: any, b: any) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    items: data.order_items || [],
  };
}

const orderSelect = 'id,order_number,order_status,payment_status,total_inr,created_at,updated_at,delivered_at,order_items(product_name,size,quantity,line_total_inr),return_requests(id,status,request_type,created_at,updated_at,refund_reference,refund_method,refund_amount_inr),order_status_events(status,note,created_at)';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || '';
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    return json({ error: 'Enter your order number and checkout email, or open the secure tracking link.' }, 400);
  }
  const db = await createDb();
  if (!db) return json({ error: 'Order tracking is not configured yet.' }, 503);
  const limit = await allowLookup(request, db);
  if (limit === 'limited') return json({ error: 'Too many tracking attempts. Please wait a minute and try again.' }, 429);
  if (limit === 'unavailable') return json({ error: 'Order tracking protection is temporarily unavailable. Please try again later.' }, 503);

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data, error } = await db.from('orders').select(orderSelect)
    .eq('tracking_token_hash', tokenHash).maybeSingle();
  if (error) return json({ error: 'We could not retrieve this order right now.' }, 503);
  if (!data) return json({ error: 'This tracking link is invalid or has expired.' }, 404);
  return json(publicOrder(data));
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const orderNumber = typeof body.orderNumber === 'string' ? body.orderNumber.trim().toUpperCase() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!/^DMW-[A-Z0-9]{10}$/.test(orderNumber) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ error: 'Enter a valid order number and the email used at checkout.' }, 400);
  }
  const db = await createDb();
  if (!db) return json({ error: 'Order tracking is not configured yet.' }, 503);
  const limit = await allowLookup(request, db);
  if (limit === 'limited') return json({ error: 'Too many tracking attempts. Please wait a minute and try again.' }, 429);
  if (limit === 'unavailable') return json({ error: 'Order tracking protection is temporarily unavailable. Please try again later.' }, 503);

  const { data, error } = await db.from('orders').select(orderSelect)
    .eq('order_number', orderNumber).eq('email', email).maybeSingle();
  if (error) return json({ error: 'We could not retrieve this order right now.' }, 503);
  if (!data) return json({ error: 'We could not find an order matching those details. Check the order number and checkout email.' }, 404);
  return json(publicOrder(data));
}
