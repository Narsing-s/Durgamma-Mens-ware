import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function allowLookup(request: NextRequest): Promise<'ok' | 'limited' | 'unavailable'> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken) return 'unavailable';
  const forwarded = request.headers.get('x-vercel-forwarded-for') ||
    request.headers.get('x-forwarded-for') || '';
  const ip = forwarded.split(',')[0].trim();
  if (!ip) return 'unavailable';
  const key = 'durgamma:tracking-rate:' +
    createHash('sha256').update(ip).digest('hex').slice(0, 32);
  try {
    const response = await fetch(redisUrl.replace(/\/$/, '') + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + redisToken, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, 60]]),
      cache: 'no-store',
    });
    if (!response.ok) return 'unavailable';
    const result = await response.json();
    return Number(result?.[0]?.result) <= 20 ? 'ok' : 'limited';
  } catch {
    return 'unavailable';
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || '';
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    return json({ error: 'Enter the secure tracking link from your order confirmation.' }, 400);
  }

  const limit = await allowLookup(request);
  if (limit === 'limited') return json({ error: 'Too many tracking attempts. Please wait a minute and try again.' }, 429);
  if (limit === 'unavailable') return json({ error: 'Order tracking is temporarily unavailable. Please try again later.' }, 503);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return json({ error: 'Order tracking is not configured yet.' }, 503);

  const tokenHash = createHash('sha256').update(token).digest('hex');
  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from('orders')
    .select('order_number,order_status,payment_status,total_inr,created_at,updated_at,order_items(product_name,size,quantity,line_total_inr)')
    .eq('tracking_token_hash', tokenHash)
    .maybeSingle();

  if (error) return json({ error: 'We could not retrieve this order right now.' }, 503);
  if (!data) return json({ error: 'This tracking link is invalid or has expired.' }, 404);

  return json({
    ok: true,
    orderNumber: data.order_number,
    status: data.order_status,
    paymentStatus: data.payment_status,
    total: data.total_inr,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    items: data.order_items || [],
  });
}
