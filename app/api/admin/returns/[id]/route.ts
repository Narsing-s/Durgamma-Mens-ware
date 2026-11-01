import { NextRequest } from 'next/server';
import { adminJson, requireAdmin } from '../../../../../lib/admin';
import { sendStoreEmail, escapeEmailHtml } from '../../../../../lib/order-email';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  let body: { status?: string; note?: string; refundReference?: string; refundMethod?: string; refundAmount?: number };
  try { body = await request.json(); } catch { return adminJson({ error: 'Invalid request.' }, 400); }
  const allowed = ['approved', 'rejected', 'received', 'refunded', 'exchanged'];
  if (!body.status || !allowed.includes(body.status)) {
    return adminJson({ error: 'Choose a valid return status.' }, 400);
  }
  if (body.status === 'refunded') {
    if (typeof body.refundReference !== 'string' || body.refundReference.trim().length < 4 ||
        !['upi','bank_transfer','cash','original_payment_method'].includes(body.refundMethod || '') ||
        !Number.isInteger(body.refundAmount) || Number(body.refundAmount) < 1) {
      return adminJson({ error: 'A refund reference, refund method and actual refund amount are required. Complete the transfer before recording it.' }, 400);
    }
  }

  const { id } = await params;
  const { data, error } = await auth.db.rpc('set_store_return_status', {
    p_return_id: id,
    p_status: body.status,
    p_admin_note: typeof body.note === 'string' ? body.note.slice(0, 500) : '',
    p_refund_reference: body.status === 'refunded' ? body.refundReference!.trim() : null,
    p_refund_method: body.status === 'refunded' ? body.refundMethod : null,
    p_refund_amount_inr: body.status === 'refunded' ? Number(body.refundAmount) : null,
  });
  if (error) return adminJson({ error: error.message || 'Return request update failed.' }, 409);

  const { data: requestRow, error: loadError } = await auth.db.from('return_requests')
    .select('request_type,refund_reference,refund_method,refund_amount_inr,orders(order_number,customer_name,email)')
    .eq('id', id).maybeSingle();
  if (loadError || !requestRow || !requestRow.orders) {
    return adminJson({ ok: true, result: data, emailSent: false, emailWarning: 'Return status saved, but customer notification details could not be loaded.' });
  }
  const order: any = requestRow.orders;
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://durgamma-mensware.netlify.app').replace(/\/$/, '');
  const labels: Record<string, string> = {
    approved: 'approved for return/exchange',
    rejected: 'not approved',
    received: 'received and awaiting inspection',
    refunded: 'refund processed',
    exchanged: 'exchange completed',
  };
  const refundInfo = body.status === 'refunded'
    ? ' Refund amount: INR ' + body.refundAmount + '. Method: ' + body.refundMethod + '. Reference: ' + body.refundReference + '.'
    : '';
  const emailResult = await sendStoreEmail({
    to: order.email,
    subject: 'Return/exchange update for order ' + order.order_number,
    text: 'Hello ' + order.customer_name + ', your ' + requestRow.request_type + ' request for order ' + order.order_number + ' is ' + labels[body.status] + '.' + refundInfo + ' View updates at ' + baseUrl + '/track using your order number and checkout email.',
    html: '<div style="font-family:Arial,sans-serif;color:#202020;max-width:600px;margin:auto"><p style="letter-spacing:2px;color:#987b4e">DURGAMMA MENSWEAR</p><h1>Your request was updated</h1><p>Hello ' + escapeEmailHtml(order.customer_name) + ',</p><p>Your ' + escapeEmailHtml(requestRow.request_type) + ' request for order <strong>' + escapeEmailHtml(order.order_number) + '</strong> is ' + labels[body.status] + '.</p>' +
      (body.status === 'refunded' ? '<p>Refund amount: <strong>INR ' + Number(body.refundAmount).toLocaleString('en-IN') + '</strong><br/>Method: ' + escapeEmailHtml(body.refundMethod || '') + '<br/>Reference: ' + escapeEmailHtml(body.refundReference || '') + '</p>' : '') +
      '<p><a href="' + baseUrl + '/track">View order updates</a> using your order number and checkout email.</p></div>',
  });
  return adminJson({
    ok: true,
    result: data,
    emailSent: emailResult.sent,
    emailWarning: emailResult.sent ? undefined : 'Return status was saved, but the customer email was not sent. Configure RESEND_API_KEY and ORDER_EMAIL_FROM in Netlify.',
  });
}
