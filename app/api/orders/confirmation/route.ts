import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { sendStoreEmail, escapeEmailHtml } from '../../../../lib/order-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const receivedOrigin = new URL(origin).origin;
      const trustedOrigins = new Set<string>([request.nextUrl.origin]);
      if (process.env.NEXT_PUBLIC_SITE_URL) trustedOrigins.add(new URL(process.env.NEXT_PUBLIC_SITE_URL).origin);
      if (!trustedOrigins.has(receivedOrigin)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    } catch {
      return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
    }
  }
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }
  if (typeof body.token !== 'string' || !/^[A-Za-z0-9_-]{40,60}$/.test(body.token) ||
      (body.action !== 'confirm' && body.action !== 'cancel')) {
    return NextResponse.json({ error: 'Invalid confirmation request.' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: 'Order service is not configured.' }, { status: 503 });

  const supabase = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const tokenHash = createHash('sha256').update(body.token).digest('hex');
  const { data, error } = await supabase.rpc('resolve_store_order_confirmation', {
    p_token_hash: tokenHash,
    p_action: body.action,
  });
  if (error) {
    const message = /expired/i.test(error.message) ? 'This confirmation link has expired.' :
      /already finalized|already used/i.test(error.message) ? 'This order has already been confirmed or cancelled.' :
      /invalid/i.test(error.message) ? 'This confirmation link is invalid.' :
      'We could not update this order. Please contact the store.';
    return NextResponse.json({ error: message }, { status: 409 });
  }
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.order_number) return NextResponse.json({ error: 'Order confirmation could not be completed.' }, { status: 500 });

  const confirmed = body.action === 'confirm';
  const statusText = confirmed ? 'confirmed' : 'cancelled';
  const customerEmail = await sendStoreEmail({
    to: result.customer_email,
    subject: 'Order ' + result.order_number + ' ' + statusText + ' | Durgamma Menswear',
    text: 'Hello ' + result.customer_name + ',\nYour order ' + result.order_number + ' has been ' + statusText + '.\nOrder total: INR ' + Number(result.total_inr).toLocaleString('en-IN') + '.\n' +
      (confirmed ? 'The store can now prepare your order. We will email you as it moves through packing, dispatch and delivery.' : 'Your order has been cancelled and reserved stock has been released.'),
    html: '<div style="font-family:Arial,sans-serif;color:#202020;max-width:600px;margin:auto"><p style="letter-spacing:2px;color:#987b4e">DURGAMMA MENSWEAR</p><h1>Your order is ' + statusText + '.</h1><p>Hello ' + escapeEmailHtml(result.customer_name) + ',</p><p>Order <strong>' + escapeEmailHtml(result.order_number) + '</strong> has been ' + statusText + '.</p><p>Total: <strong>INR ' + Number(result.total_inr).toLocaleString('en-IN') + '</strong>.</p><p>' +
      (confirmed ? 'The store can now prepare your order. We will email you as it moves through packing, dispatch and delivery.' : 'Your order has been cancelled and reserved stock has been released.') +
      '</p></div>',
  });

  const adminRecipients = confirmed
    ? (process.env.STORE_ADMIN_EMAILS || '').split(',').map(value => value.trim()).filter(Boolean)
    : [];
  const adminResults = await Promise.all(adminRecipients.map(to => sendStoreEmail({
    to,
    subject: 'Customer confirmed order ' + result.order_number + ' | Durgamma Menswear',
    text: 'Customer ' + result.customer_name + ' confirmed order ' + result.order_number + '. Total: INR ' + Number(result.total_inr).toLocaleString('en-IN') + '. The order is ready for store fulfilment.',
    html: '<div style="font-family:Arial,sans-serif"><h2>Order ready for fulfilment</h2><p>Customer ' + escapeEmailHtml(result.customer_name) + ' confirmed order <strong>' + escapeEmailHtml(result.order_number) + '</strong>.</p><p>Total: INR ' + Number(result.total_inr).toLocaleString('en-IN') + '</p></div>',
  })));
  const adminEmailsSent = adminResults.every(item => item.sent);
  const emailWarning = !customerEmail.sent
    ? (customerEmail.warning || 'Your order status was saved, but the customer email could not be sent. Check the Resend sender-domain configuration.')
    : confirmed && adminRecipients.length > 0 && !adminEmailsSent
      ? 'Your order is confirmed and the customer email was sent, but the store notification email could not be sent.'
      : undefined;

  return NextResponse.json({
    ok: true,
    orderNumber: result.order_number,
    status: confirmed ? 'confirmed' : 'cancelled',
    emailSent: customerEmail.sent,
    emailWarning,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
