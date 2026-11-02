import { NextRequest } from 'next/server';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { adminJson, requireAdmin } from '../../../../../../lib/admin';
import { sendStoreEmail, escapeEmailHtml } from '../../../../../../lib/order-email';

function hashOtp(orderId: string, otp: string) {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY || '')
    .update(orderId + ':' + otp).digest('hex');
}

async function notify(order: any, subject: string, text: string, html: string) {
  return sendStoreEmail({ to: order.email, subject, text, html });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const { id } = await params;
  let body: { action?: string; otp?: string };
  try { body = await request.json(); } catch { return adminJson({ error: 'Invalid request.' }, 400); }

  const { data: order, error: loadError } = await auth.db.from('orders')
    .select('id,order_number,customer_name,email,order_status,delivery_otp_hash,delivery_otp_expires_at')
    .eq('id', id).maybeSingle();
  if (loadError || !order) return adminJson({ error: 'Order not found.' }, 404);
  if (order.order_status !== 'shipped') return adminJson({ error: 'A delivery OTP is available only for shipped orders.' }, 409);

  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://durgamma-mensware.netlify.app').replace(/\/$/, '');

  if (body.action === 'resend') {
    const otp = String(randomInt(100000, 1000000));
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error } = await auth.db.from('orders').update({
      delivery_otp_hash: hashOtp(id, otp),
      delivery_otp_expires_at: expires,
    }).eq('id', id);
    if (error) return adminJson({ error: 'Could not generate a delivery OTP.' }, 500);
    const result = await notify(order, 'Your delivery OTP · ' + order.order_number,
      'Your delivery OTP is ' + otp + '. Share it with the delivery agent only when your parcel is physically delivered. It expires in 15 minutes. Track: ' + baseUrl + '/track',
      '<div style="font-family:Arial,sans-serif;color:#202020;max-width:600px;margin:auto"><p style="letter-spacing:2px;color:#987b4e">DURGAMMA MENSWEAR</p><h1>Delivery verification</h1><p>Hello ' + escapeEmailHtml(order.customer_name) + ',</p><p>Your delivery OTP for order <strong>' + escapeEmailHtml(order.order_number) + '</strong> is:</p><p style="font-size:32px;letter-spacing:8px;text-align:center;background:#f5f1e8;padding:18px">' + otp + '</p><p>Share it only with the delivery agent when your parcel is physically delivered. It expires in 15 minutes.</p><a href="' + baseUrl + '/track">Track your order</a></div>');
    return adminJson({ ok: true, emailSent: result.sent, warning: result.sent ? undefined : 'OTP saved but email was not sent. Configure RESEND_API_KEY and ORDER_EMAIL_FROM.' });
  }

  if (body.action !== 'verify' || !/^\d{6}$/.test(body.otp || '')) {
    return adminJson({ error: 'Enter the 6-digit customer delivery OTP.' }, 400);
  }
  if (!order.delivery_otp_hash || !order.delivery_otp_expires_at ||
      new Date(order.delivery_otp_expires_at).getTime() <= Date.now()) {
    return adminJson({ error: 'The delivery OTP has expired or has not been sent. Resend a new OTP.' }, 409);
  }

  const supplied = Buffer.from(hashOtp(id, body.otp!), 'hex');
  const stored = Buffer.from(order.delivery_otp_hash, 'hex');
  if (supplied.length !== stored.length || !timingSafeEqual(supplied, stored)) {
    return adminJson({ error: 'The delivery OTP is incorrect. Please check with the customer.' }, 401);
  }

  // Consume the code atomically so it cannot be reused by another delivery attempt.
  const { data: consumed, error: consumeError } = await auth.db.from('orders')
    .update({ delivery_otp_hash: null, delivery_otp_expires_at: null })
    .eq('id', id).eq('delivery_otp_hash', order.delivery_otp_hash)
    .gt('delivery_otp_expires_at', new Date().toISOString()).select('id').maybeSingle();
  if (consumeError || !consumed) return adminJson({ error: 'OTP expired or already used. Send a new OTP.' }, 409);

  const { data, error } = await auth.db.rpc('set_store_order_status', {
    p_order_id: id,
    p_status: 'delivered',
    p_note: 'Delivery completed after successful customer OTP verification.',
  });
  if (error) return adminJson({ error: 'OTP verified, but delivery status could not be saved. Send a new OTP if needed and retry.' }, 409);

  const result = await notify(order, 'Your order has been delivered · ' + order.order_number,
    'Hello ' + order.customer_name + ', your Durgamma Menswear order ' + order.order_number + ' has been delivered successfully. You can request a return or exchange within 7 days if the item meets the return conditions. Track: ' + baseUrl + '/track',
    '<div style="font-family:Arial,sans-serif;color:#202020;max-width:600px;margin:auto"><p style="letter-spacing:2px;color:#987b4e">DURGAMMA MENSWEAR</p><h1>Your order has been delivered.</h1><p>Hello ' + escapeEmailHtml(order.customer_name) + ',</p><p>Your order <strong>' + escapeEmailHtml(order.order_number) + '</strong> was marked delivered after OTP verification.</p><p>You may request a return or exchange within 7 days, subject to the item condition and inspection policy.</p><a href="' + baseUrl + '/track">View order and return options</a></div>');
  return adminJson({ ok: true, result: data, emailSent: result.sent, warning: result.sent ? undefined : 'Delivery was recorded, but the delivery email was not sent. Configure RESEND_API_KEY and ORDER_EMAIL_FROM.' });
}
