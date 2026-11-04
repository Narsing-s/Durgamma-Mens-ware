import { NextRequest } from 'next/server';
import { createHmac, randomInt } from 'node:crypto';
import { adminJson, requireAdmin } from '../../../../../lib/admin';
import { sendStoreEmail, escapeEmailHtml } from '../../../../../lib/order-email';
import { getPublicSiteUrl } from '../../../../../lib/site-url';

function otpHash(orderId: string, otp: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createHmac('sha256', secret).update(orderId + ':' + otp).digest('hex');
}

async function sendStatusEmail(order: any, status: string, requestOrigin: string, otp?: string, shipment?: any) {
  const baseUrl = getPublicSiteUrl(requestOrigin);
  const labels: Record<string, string> = {
    confirmed: 'confirmed',
    packed: 'being processed, packed and prepared for dispatch',
    shipped: 'shipped and on its way',
    cancelled: 'cancelled',
  };
  const title = status === 'shipped' ? 'Your order is on its way' : status === 'packed' ? 'Your order is being prepared' : 'Order ' + labels[status];
  const shipmentText = status === 'shipped' && shipment
    ? '\nCourier: ' + shipment.shipping_provider + '\nAWB / Tracking number: ' + shipment.tracking_number +
      (shipment.tracking_url ? '\nCourier tracking: ' + shipment.tracking_url : '') +
      (shipment.expected_delivery_date ? '\nExpected delivery: ' + shipment.expected_delivery_date : '')
    : '';
  const otpText = otp ? '\nYour delivery OTP is ' + otp + '. Share it with the delivery agent only when your parcel is physically delivered. It expires in 15 minutes.' : '';
  const text = 'Hello ' + order.customer_name + ',\nYour Durgamma Menswear order ' + order.order_number + ' is ' + labels[status] + '.' + shipmentText + otpText + '\nTrack your order at ' + baseUrl + '/track using your order number and checkout email.';
  const html = '<div style="font-family:Arial,sans-serif;color:#202020;max-width:600px;margin:auto"><p style="letter-spacing:2px;color:#987b4e">DURGAMMA MENSWEAR</p><h1>' + title + '</h1><p>Hello ' + escapeEmailHtml(order.customer_name) + ',</p><p>Your order <strong>' + escapeEmailHtml(order.order_number) + '</strong> is ' + labels[status] + '.</p>' +
    (status === 'shipped' && shipment ? '<div style="padding:16px;background:#f5f1e8"><p><strong>COURIER DETAILS</strong></p><p>Partner: ' + escapeEmailHtml(shipment.shipping_provider) + '<br>AWB / Tracking number: <strong>' + escapeEmailHtml(shipment.tracking_number) + '</strong></p>' +
      (shipment.tracking_url ? '<p><a href="' + escapeEmailHtml(shipment.tracking_url) + '">Track parcel with courier</a></p>' : '') +
      (shipment.expected_delivery_date ? '<p>Expected delivery: ' + escapeEmailHtml(shipment.expected_delivery_date) + '</p>' : '') + '</div>' : '') +
    (otp ? '<div style="padding:18px;background:#f5f1e8;text-align:center"><p>DELIVERY OTP</p><strong style="font-size:30px;letter-spacing:8px">' + otp + '</strong><p>Share this code only with the delivery agent when your parcel is physically delivered. Expires in 15 minutes.</p></div>' : '') +
    '<p><a href="' + baseUrl + '/track">Track your order</a> using your order number and checkout email.</p></div>';
  return sendStoreEmail({ to: order.email, subject: 'Durgamma Menswear: ' + title + ' · ' + order.order_number, text, html });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  let body: { status?: string; note?: string; shippingProvider?: string; trackingNumber?: string; trackingUrl?: string; expectedDeliveryDate?: string };
  try { body = await request.json(); } catch { return adminJson({ error: 'Invalid request.' }, 400); }
  const allowed = ['confirmed','packed','shipped','cancelled'];
  if (!body.status || !allowed.includes(body.status)) {
    return adminJson({ error: 'Invalid order status. Delivery must be verified with the customer OTP.' }, 400);
  }
  const { id } = await params;
  const orderSelect = 'id,order_number,customer_name,email,total_inr,order_status,shipping_provider,tracking_number,tracking_url,expected_delivery_date';
  const byId = await auth.db.from('orders').select(orderSelect).eq('id', id).maybeSingle();
  let existingOrder = byId.data;
  let existingOrderError = byId.error;
  // Accept both the internal UUID and the customer-facing DMW order number.
  if (!existingOrder) {
    const byNumber = await auth.db.from('orders').select(orderSelect).eq('order_number', id).maybeSingle();
    existingOrder = byNumber.data;
    existingOrderError = byNumber.error || existingOrderError;
  }
  if (existingOrderError && !existingOrder) {
    console.error('[admin/orders] Order lookup failed:', { code: existingOrderError.code, message: existingOrderError.message });
  }
  if (!existingOrder) return adminJson({ error: 'Order not found. Refresh the admin Orders list and try again.' }, 404);
  const orderId = existingOrder.id;

  let shipment: any = null;
  if (body.status === 'shipped') {
    const shippingProvider = String(body.shippingProvider || existingOrder.shipping_provider || '').trim().slice(0, 100);
    const trackingNumber = String(body.trackingNumber || existingOrder.tracking_number || '').trim().slice(0, 120);
    const trackingUrl = String(body.trackingUrl || existingOrder.tracking_url || '').trim().slice(0, 500);
    const expectedDeliveryDate = String(body.expectedDeliveryDate || existingOrder.expected_delivery_date || '').trim();
    if (!shippingProvider || !trackingNumber) return adminJson({ error: 'Courier name and AWB / tracking number are required before shipping.' }, 400);
    if (trackingUrl) {
      try { const parsed = new URL(trackingUrl); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('invalid'); }
      catch { return adminJson({ error: 'Enter a valid http:// or https:// courier tracking URL.' }, 400); }
    }
    if (expectedDeliveryDate && (!/^\d{4}-\d{2}-\d{2}$/.test(expectedDeliveryDate) || Number.isNaN(Date.parse(expectedDeliveryDate + 'T00:00:00Z')))) {
      return adminJson({ error: 'Expected delivery date must use YYYY-MM-DD.' }, 400);
    }
    shipment = { shipping_provider: shippingProvider, tracking_number: trackingNumber, tracking_url: trackingUrl || null, expected_delivery_date: expectedDeliveryDate || null };
    const { error: shipmentError } = await auth.db.from('orders').update(shipment).eq('id', orderId);
    if (shipmentError) return adminJson({ error: 'Could not save courier details. Apply the courier tracking migration in Supabase, then retry.' }, 409);
  }

  const sameStatus = existingOrder.order_status === body.status;
  const { data, error } = sameStatus ? { data: null, error: null } : await auth.db.rpc('set_store_order_status', {
    p_order_id: orderId,
    p_status: body.status,
    p_note: (body.note || '').slice(0, 1000),
  });
  if (error) return adminJson({ error: error.message || 'Order update failed.' }, 409);
  if (sameStatus && !shipment) return adminJson({ ok: true, result: data, emailSent: false, emailSkipped: true, message: 'Order already had this status. No duplicate email was sent.' });

  let otp: string | undefined;
  if (body.status === 'shipped' && !sameStatus) {
    otp = String(randomInt(100000, 1000000));
    const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error: otpError } = await auth.db.from('orders').update({
      delivery_otp_hash: otpHash(orderId, otp),
      delivery_otp_expires_at: expires,
    }).eq('id', orderId);
    if (otpError) return adminJson({ ok: true, result: data, emailSent: false, warning: 'Order shipped, but delivery OTP could not be saved. Check the database before retrying.' });
  }

  const emailResult = await sendStatusEmail(existingOrder, body.status, request.nextUrl.origin, otp, shipment);
  if (otp && !emailResult.sent) {
    // A shipped order can remain shipped, but never leave an active OTP that was not emailed.
    const { error: clearError } = await auth.db.from('orders')
      .update({ delivery_otp_hash: null, delivery_otp_expires_at: null })
      .eq('id', orderId).eq('delivery_otp_hash', otpHash(orderId, otp));
    if (clearError) console.error('Could not clear undelivered delivery OTP for order:', existingOrder.order_number);
  }
  return adminJson({
    ok: true,
    result: data,
    emailSent: emailResult.sent,
    emailWarning: emailResult.sent ? undefined : emailResult.warning || 'Order status was saved, but the notification email was not sent. Check the configured email provider and retry.',
    message: sameStatus ? 'Courier tracking details updated.' : undefined,
  });
}
