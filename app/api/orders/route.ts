import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { sendStoreEmail, escapeEmailHtml } from '../../../lib/order-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function getClientIp(request: NextRequest): string | null {
  // Netlify is the live host; also support Vercel and Cloudflare deployments.
  const value =
    request.headers.get('x-nf-client-connection-ip') ||
    request.headers.get('x-vercel-forwarded-for') ||
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for');
  const ip = value?.split(',')[0]?.trim();
  return ip && ip !== 'unknown' ? ip : null;
}

function validText(value: unknown, min: number, max: number): value is string {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowedOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  if (origin && allowedOrigin && new URL(origin).origin !== new URL(allowedOrigin).origin) {
    return json({ error: 'Invalid request origin.' }, 403);
  }
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 16_000) return json({ error: 'Request is too large.' }, 413);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return json({ error: 'Order service is not configured yet.' }, 503);

  const supabase = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const clientIp = getClientIp(request);
  if (!clientIp) return json({ error: 'We could not verify this connection. Please refresh and try again.' }, 503);
  const ipHash = createHash('sha256').update(clientIp).digest('hex');
  const { data: attempts, error: rateLimitError } = await supabase.rpc('consume_order_rate_limit', {
    p_ip_hash: ipHash,
  });
  if (rateLimitError || typeof attempts !== 'number') {
    console.error('Order rate-limit check failed:', rateLimitError?.message || 'Invalid rate-limit response');
    return json({ error: 'Order protection is temporarily unavailable. Please try again later.' }, 503);
  }
  if (attempts > 5) return json({ error: 'Too many order attempts. Please try again in a minute.' }, 429);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON request.' }, 400);
  }

  // COD is enabled only through this trusted server route. Online payments stay disabled
  // until Razorpay order creation and signature verification are configured.
  if (body.paymentMethod !== 'cod') {
    return json({ error: 'Online payment is not enabled yet. Choose Cash on Delivery.' }, 409);
  }
  if (!validText(body.customerName, 2, 100) ||
      !validText(body.email, 5, 254) ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email) ||
      !validText(body.phone, 10, 20) ||
      (body.phone as string).replace(/[^0-9]/g, '').length < 10 ||
      !body.shippingAddress || typeof body.shippingAddress !== 'object' ||
      Array.isArray(body.shippingAddress) ||
      !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
    return json({ error: 'Please provide valid customer, delivery and cart details.' }, 400);
  }
  const address = body.shippingAddress as Record<string, unknown>;
  if (!validText(address.line1, 5, 160) || !validText(address.city, 2, 80) ||
      !validText(address.state, 2, 80) || !validText(address.pincode, 6, 6) ||
      !/^[1-9][0-9]{5}$/.test(address.pincode) ||
      (address.country !== undefined && address.country !== 'India')) {
    return json({ error: 'Please enter a valid Indian delivery address and 6-digit PIN code.' }, 400);
  }

  const items: { variant_id: string; quantity: number }[] = [];
  for (const raw of body.items) {
    if (!raw || typeof raw !== 'object') return json({ error: 'Invalid cart item.' }, 400);
    const item = raw as Record<string, unknown>;
    if (typeof item.variantId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.variantId) ||
        !Number.isInteger(item.quantity) || Number(item.quantity) < 1 || Number(item.quantity) > 10) {
      return json({ error: 'Invalid product size or quantity.' }, 400);
    }
    items.push({ variant_id: item.variantId, quantity: Number(item.quantity) });
  }

  const { data, error } = await supabase.rpc('create_store_order', {
    p_customer_name: body.customerName.trim(),
    p_email: body.email.trim().toLowerCase(),
    p_phone: body.phone.trim(),
    p_shipping_address: body.shippingAddress,
    p_payment_method: 'cod',
    p_items: items,
  });

  if (error) {
    const message = error.message.includes('Insufficient stock') || error.message.includes('unavailable')
      ? 'One of your selected sizes is no longer available. Please refresh your bag.'
      : 'We could not place your order. Please check your details and try again.';
    return json({ error: message }, 409);
  }
  const order = Array.isArray(data) ? data[0] : data;
  if (!order?.order_number || !order?.order_id) return json({ error: 'Order confirmation could not be created.' }, 500);

  // Give the customer a high-entropy tracking link. Only its SHA-256 hash is stored.
  // The raw token is returned once and is never persisted in the database.
  const trackingToken = randomBytes(32).toString('base64url');
  const trackingHash = createHash('sha256').update(trackingToken).digest('hex');
  const { error: trackingError } = await supabase
    .from('orders')
    .update({ tracking_token_hash: trackingHash })
    .eq('id', order.order_id);
  if (trackingError) {
    // The order itself is already safely committed. Do not encourage a duplicate order
    // by returning a failed checkout; simply omit tracking and surface the order number.
    console.error('Order tracking token could not be saved for', order.order_number, trackingError.message);
  }

  const { error: confirmationError } = await supabase.rpc('set_store_order_status', {
    p_order_id: order.order_id,
    p_status: 'confirmed',
    p_note: 'Automatically confirmed when the customer completed Cash on Delivery checkout.',
  });
  if (confirmationError) console.error('Could not confirm order', order.order_number, confirmationError.message);

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin).replace(/\/$/, '');
  const trackingUrl = trackingError ? null : siteUrl + '/track?token=' + encodeURIComponent(trackingToken);
  const statusLabel = confirmationError ? 'Order received' : 'Confirmed';
  const emailResult = await sendStoreEmail({
    to: body.email.trim().toLowerCase(),
    subject: 'Order ' + order.order_number + ' ' + statusLabel.toLowerCase() + ' | Durgamma Menswear',
    text: [
      'Hello ' + body.customerName.trim() + ',',
      'Your Durgamma Menswear Cash on Delivery order ' + order.order_number + ' has been ' + statusLabel.toLowerCase() + '.',
      'Order total: INR ' + Number(order.total_inr).toLocaleString('en-IN') + '. Pay when your order arrives.',
      trackingUrl ? 'Track your order: ' + trackingUrl : 'Track at ' + siteUrl + '/track using order number ' + order.order_number + ' and this checkout email.',
      'Thank you for shopping with Durgamma Menswear.',
    ].join('\n'),
    html: '<div style="font-family:Arial,sans-serif;color:#202020;max-width:600px;margin:auto"><p style="letter-spacing:2px;color:#987b4e">DURGAMMA MENSWEAR</p><h1>Your order is ' + statusLabel.toLowerCase() + '.</h1><p>Hello ' + escapeEmailHtml(body.customerName.trim()) + ',</p><p>Your Cash on Delivery order <strong>' + escapeEmailHtml(order.order_number) + '</strong> has been ' + statusLabel.toLowerCase() + '.</p><p>Order total: <strong>INR ' + Number(order.total_inr).toLocaleString('en-IN') + '</strong>. Pay when your order arrives.</p>' +
      (trackingUrl ? '<p><a href="' + trackingUrl + '" style="display:inline-block;padding:12px 18px;background:#b99a62;color:#fff;text-decoration:none">Track your order</a></p>' : '<p>Visit ' + escapeEmailHtml(siteUrl) + '/track and enter order number <strong>' + escapeEmailHtml(order.order_number) + '</strong> with this checkout email.</p>') +
      '<p>Thank you for shopping with Durgamma Menswear.</p></div>',
  });

  return json({
    ok: true,
    orderNumber: order.order_number,
    subtotal: order.subtotal_inr,
    shipping: order.shipping_inr,
    total: order.total_inr,
    paymentMethod: 'cod',
    status: confirmationError ? 'pending' : 'confirmed',
    trackingToken: trackingError ? null : trackingToken,
    trackingUrl,
    emailSent: emailResult.sent,
    message: 'Your Cash on Delivery order has been placed.',
  }, 201);
}
