import { NextRequest } from 'next/server';
import { createHmac, randomInt } from 'node:crypto';
import { adminJson, requireAdmin } from '../../../../../lib/admin';
import { sendStoreEmail, escapeEmailHtml } from '../../../../../lib/order-email';

function otpHash(orderId: string, otp: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createHmac('sha256', secret).update(orderId + ':' + otp).digest('hex');
}

async function sendStatusEmail(order: any, status: string, otp?: string) {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://durgamma-mensware.netlify.app').replace(/\/$/, '');
  const labels: Record<string, string> = {
    confirmed: 'confirmed',
    packed: 'packed and ready for dispatch',
    shipped: 'shipped and on its way',
    cancelled: 'cancelled',
  };
  const title = status === 'shipped' ? 'Your order is on its way' : 'Order ' + labels[status];
  const otpText = otp ? '\nYour delivery OTP is ' + otp + '. Share it with the delivery agent only when your parcel is physically delivered. It expires in 15 minutes.' : '';
  const text = 'Hello ' + order.customer_name + ',\nYour Durgamma Menswear order ' + order.order_number + ' is ' + labels[status] + '.' + otpText + '\nTrack your order at ' + baseUrl + '/track using your order number and checkout email.';
  const html = '<div style="font-family:Arial,sans-serif;color:#202020;max-width:600px;margin:auto"><p style="letter-spacing:2px;color:#987b4e">DURGAMMA MENSWEAR</p><h1>' + title + '</h1><p>Hello ' + escapeEmailHtml(order.customer_name) + ',</p><p>Your order <strong>' + escapeEmailHtml(order.order_number) + '</strong> is ' + labels[status] + '.</p>' +
    (otp ? '<div style="padding:18px;background:#f5f1e8;text-align:center"><p>DELIVERY OTP</p><strong style="font-size:30px;letter-spacing:8px">' + otp + '</strong><p>Share this code only with the delivery agent when your parcel is physically delivered. Expires in 15 minutes.</p></div>' : '') +
    '<p><a href="' + baseUrl + '/track">Track your order</a> using your order number and checkout email.</p></div>';
  return sendStoreEmail({ to: order.email, subject: 'Durgamma Menswear: ' + title + ' · ' + order.order_number, text, html });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  let body: { status?: string; note?: string };
  try { body = await request.json(); } catch { return adminJson({ error: 'Invalid request.' }, 400); }
  const allowed = ['pending','confirmed','packed','shipped','cancelled'];
  if (!body.status || !allowed.includes(body.status)) {
    return adminJson({ error: 'Invalid order status. Delivery must be verified with the customer OTP.' }, 400);
  }
  const { id } = await params;
  const { data, error } = await auth.db.rpc('set_store_order_status', {
    p_order_id: id,
    p_status: body.status,
    p_note: (body.note || '').slice(0, 1000),
  });
  if (error) return adminJson({ error: error.message || 'Order update failed.' }, 409);

  const { data: order, error: orderError } = await auth.db.from('orders')
    .select('id,order_number,customer_name,email,total_inr').eq('id', id).maybeSingle();
  if (orderError || !order) return adminJson({ ok: true, result: data, emailSent: false, warning: 'Order updated, but notification details could not be loaded.' });

  let otp: string | undefined;
  if (body.status === 'shipped') {
    otp = String(randomInt(100000, 1000000));
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error: otpError } = await auth.db.from('orders').update({
      delivery_otp_hash: otpHash(id, otp),
      delivery_otp_expires_at: expires,
    }).eq('id', id);
    if (otpError) return adminJson({ ok: true, result: data, emailSent: false, warning: 'Order shipped, but delivery OTP could not be saved. Use Resend OTP after checking the database.' });
  }

  const emailResult = await sendStatusEmail(order, body.status, otp);
  return adminJson({
    ok: true,
    result: data,
    emailSent: emailResult.sent,
    emailWarning: emailResult.sent ? undefined : 'Order status was saved, but email was not sent. Configure RESEND_API_KEY and ORDER_EMAIL_FROM in Netlify.',
  });
}
