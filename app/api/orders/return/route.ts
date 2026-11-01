import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { sendStoreEmail, escapeEmailHtml } from '../../../../lib/order-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function getIp(request: NextRequest): string | null {
  const value = request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-vercel-forwarded-for') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for');
  const ip = value?.split(',')[0]?.trim();
  return ip && ip !== 'unknown' ? ip : null;
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 8_000) return json({ error: 'Request is too large.' }, 413);
  const origin = request.headers.get('origin');
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (origin && siteUrl && new URL(origin).origin !== new URL(siteUrl).origin) {
    return json({ error: 'Invalid request origin.' }, 403);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const token = typeof body.token === 'string' ? body.token : '';
  const orderNumber = typeof body.orderNumber === 'string' ? body.orderNumber.trim().toUpperCase() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const requestType = body.requestType;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const customerNote = typeof body.customerNote === 'string' ? body.customerNote.trim() : '';

  if ((!/^[A-Za-z0-9_-]{40,60}$/.test(token) &&
       (!/^DMW-[A-Z0-9]{10}$/.test(orderNumber) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
      (requestType !== 'return' && requestType !== 'exchange') ||
      reason.length < 5 || reason.length > 500 || customerNote.length > 500) {
    return json({ error: 'Verify your order and provide a valid return or exchange reason.' }, 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return json({ error: 'Return service is not configured.' }, 503);
  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const ip = getIp(request);
  if (!ip) return json({ error: 'We could not verify this connection. Please try again.' }, 503);
  const { data: attempts, error: rateError } = await db.rpc('consume_tracking_rate_limit', {
    p_ip_hash: createHash('sha256').update(ip).digest('hex'),
  });
  if (rateError || typeof attempts !== 'number') return json({ error: 'Request protection is temporarily unavailable.' }, 503);
  if (attempts > 5) return json({ error: 'Too many return requests. Please try again later.' }, 429);

  let trackingHash = '';
  let order: any = null;
  if (token) {
    trackingHash = createHash('sha256').update(token).digest('hex');
    const { data, error } = await db.from('orders')
      .select('id,order_number,customer_name,email,order_status,delivered_at,tracking_token_hash')
      .eq('tracking_token_hash', trackingHash).maybeSingle();
    if (error) return json({ error: 'We could not verify this order.' }, 503);
    order = data;
  } else {
    const { data, error } = await db.from('orders')
      .select('id,order_number,customer_name,email,order_status,delivered_at,tracking_token_hash')
      .eq('order_number', orderNumber).eq('email', email).maybeSingle();
    if (error) return json({ error: 'We could not verify this order.' }, 503);
    order = data;
    if (order && !order.tracking_token_hash) {
      trackingHash = createHash('sha256').update(randomBytes(32).toString('base64url')).digest('hex');
      const { error: saveError } = await db.from('orders').update({ tracking_token_hash: trackingHash }).eq('id', order.id);
      if (saveError) return json({ error: 'We could not securely enable return requests for this order.' }, 503);
    } else trackingHash = order?.tracking_token_hash || '';
  }

  if (!order || !trackingHash) return json({ error: 'We could not find an order matching those details.' }, 404);
  if (order.order_status !== 'delivered' || !order.delivered_at) return json({ error: 'Returns and exchanges are available only after delivery.' }, 409);
  if (new Date(order.delivered_at).getTime() < Date.now() - 7 * 24 * 60 * 60 * 1000) {
    return json({ error: 'The 7-day return/exchange period has ended.' }, 409);
  }

  const { data, error } = await db.rpc('create_store_return_request', {
    p_tracking_token_hash: trackingHash,
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
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, '');
  const emailResult = await sendStoreEmail({
    to: order.email,
    subject: 'We received your ' + requestType + ' request for order ' + order.order_number,
    text: 'Hello ' + order.customer_name + ',\nWe received your ' + requestType + ' request for order ' + order.order_number + '. Our team will review the item after receiving and inspecting it. Track updates at ' + baseUrl + '/track.',
    html: '<div style="font-family:Arial,sans-serif;color:#202020;max-width:600px;margin:auto"><p style="letter-spacing:2px;color:#987b4e">DURGAMMA MENSWEAR</p><h1>Request received</h1><p>Hello ' + escapeEmailHtml(order.customer_name) + ',</p><p>We received your ' + requestType + ' request for order <strong>' + escapeEmailHtml(order.order_number) + '</strong>.</p><p>Our team will review the request after receiving and inspecting the item. You can check updates on your order tracking page.</p><p><a href="' + baseUrl + '/track">Track your order</a></p></div>',
  });

  return json({ ok: true, requestId: result?.request_id, status: result?.request_status || 'requested', emailSent: emailResult.sent }, 201);
}
