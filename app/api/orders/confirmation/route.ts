import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { sendStoreEmail, escapeEmailHtml } from '../../../../lib/order-email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  const allowedOrigin = process.env.NEXT_PUBLIC_SITE_URL;
  if (origin && allowedOrigin && new URL(origin).origin !== new URL(allowedOrigin).origin) {
    return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
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
  await sendStoreEmail({
    to: result.customer_email,
    subject: 'Order ' + result.order_number + ' ' + statusText + ' | Durgamma Menswear',
    text: 'Hello ' + result.customer_name + ',\\nYour order ' + result.order_number + ' has been ' + statusText + '.\\nOrder total: INR ' + Number(result.total_inr).toLocaleString('en-IN') + '.',
    html: '<div style="font-family:Arial,sans-serif;color:#202020"><p style="letter-spacing:2px;color:#987b4e">DURGAMMA MENSWEAR</p><h1>Your order is ' + statusText + '.</h1><p>Hello ' + escapeEmailHtml(result.customer_name) + ',</p><p>Order <strong>' + escapeEmailHtml(result.order_number) + '</strong> has been ' + statusText + '.</p><p>Total: <strong>INR ' + Number(result.total_inr).toLocaleString('en-IN') + '</strong>.</p></div>',
  });
  return NextResponse.json({ ok: true, orderNumber: result.order_number, status: confirmed ? 'confirmed' : 'cancelled' }, { headers: { 'Cache-Control': 'no-store' } });
}
