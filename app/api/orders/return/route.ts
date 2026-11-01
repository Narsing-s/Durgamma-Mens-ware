import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function rateLimit(request: NextRequest): Promise<'ok' | 'limited' | 'unavailable'> {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const ip = (request.headers.get('x-vercel-forwarded-for') ||
    request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  if (!redisUrl || !redisToken || !ip) return 'unavailable';
  const key = 'durgamma:return-rate:' + createHash('sha256').update(ip).digest('hex').slice(0, 32);
  try {
    const response = await fetch(redisUrl.replace(/\/$/, '') + '/pipeline', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + redisToken, 'Content-Type': 'application/json' },
      body: JSON.stringify([['INCR', key], ['EXPIRE', key, 3600]]),
      cache: 'no-store',
    });
    if (!response.ok) return 'unavailable';
    const result = await response.json();
    return Number(result?.[0]?.result) <= 5 ? 'ok' : 'limited';
  } catch {
    return 'unavailable';
  }
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 8_000) return json({ error: 'Request is too large.' }, 413);
  const origin = request.headers.get('origin');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (origin && siteUrl && new URL(origin).origin !== new URL(siteUrl).origin) {
    return json({ error: 'Invalid request origin.' }, 403);
  }
  const limit = await rateLimit(request);
  if (limit === 'limited') return json({ error: 'Too many return requests. Please try again later.' }, 429);
  if (limit === 'unavailable') return json({ error: 'Return request protection is not configured. Please try again later.' }, 503);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  const token = typeof body.token === 'string' ? body.token : '';
  const requestType = body.requestType;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const customerNote = typeof body.customerNote === 'string' ? body.customerNote.trim() : '';

  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return json({ error: 'Use the secure tracking link from your order confirmation.' }, 400);
  if (requestType !== 'return' && requestType !== 'exchange') return json({ error: 'Choose return or exchange.' }, 400);
  if (reason.length < 5 || reason.length > 500 || customerNote.length > 500) {
    return json({ error: 'Add a reason between 5 and 500 characters.' }, 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return json({ error: 'Return service is not configured.' }, 503);

  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const { data, error } = await db.rpc('create_store_return_request', {
    p_tracking_token_hash: tokenHash,
    p_request_type: requestType,
    p_reason: reason,
    p_customer_note: customerNote,
  });

  if (error) {
    const message = /delivered|7-day|already active|tracking link/i.test(error.message)
      ? error.message
      : 'We could not submit your request. Please check the order and try again.';
    return json({ error: message }, 409);
  }
  const result = Array.isArray(data) ? data[0] : data;
  return json({ ok: true, requestId: result?.request_id, status: result?.request_status || 'requested' }, 201);
}
