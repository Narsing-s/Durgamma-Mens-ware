import { NextRequest } from 'next/server';
import { createHash, randomBytes } from 'node:crypto';
import { adminJson, requireAdmin } from '../../../../../../lib/admin';
import { sendStoreEmail, escapeEmailHtml } from '../../../../../../lib/order-email';
import { getPublicSiteUrl } from '../../../../../../lib/site-url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  const { id } = await params;
  const { data: order, error: loadError } = await auth.db.from('orders')
    .select('id,order_number,customer_name,email,total_inr,order_status,confirmation_token_hash,confirmation_expires_at,confirmation_decided_at')
    .eq('id', id).maybeSingle();

  if (loadError || !order) return adminJson({ error: 'Order not found.' }, 404);
  if (order.order_status !== 'pending') {
    return adminJson({ error: 'A confirmation email can only be resent while the order is pending.' }, 409);
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: updated, error: updateError } = await auth.db.from('orders')
    .update({
      confirmation_token_hash: tokenHash,
      confirmation_expires_at: expiresAt,
      confirmation_decided_at: null,
    })
    .eq('id', id)
    .eq('order_status', 'pending')
    .select('id')
    .maybeSingle();

  if (updateError || !updated) {
    return adminJson({ error: 'The order changed while the confirmation email was being prepared. Refresh and try again.' }, 409);
  }

  const confirmationUrl = getPublicSiteUrl(request.nextUrl.origin) +
    '/order-confirmation/' + encodeURIComponent(token);
  const emailResult = await sendStoreEmail({
    to: order.email,
    subject: 'Please confirm your Durgamma Menswear order ' + order.order_number,
    text: 'Hello ' + order.customer_name + ',\nYour order ' + order.order_number +
      ' is still pending. Confirm or cancel it using this secure link: ' + confirmationUrl +
      '\nThe link expires in 24 hours. Order total: INR ' +
      Number(order.total_inr).toLocaleString('en-IN') + '.',
    html: '<div style="font-family:Arial,sans-serif;color:#202020;max-width:600px;margin:auto">' +
      '<p style="letter-spacing:2px;color:#987b4e">DURGAMMA MENSWEAR</p>' +
      '<h1>Please confirm your order</h1><p>Hello ' + escapeEmailHtml(order.customer_name) +
      ',</p><p>Order <strong>' + escapeEmailHtml(order.order_number) +
      '</strong> is still awaiting your confirmation.</p><p>Total: <strong>INR ' +
      Number(order.total_inr).toLocaleString('en-IN') +
      '</strong>.</p><p><a href="' + confirmationUrl +
      '" style="display:inline-block;padding:14px 22px;background:#987b4e;color:#fff;text-decoration:none">REVIEW &amp; CONFIRM ORDER</a></p>' +
      '<p>This secure link expires in 24 hours. You can confirm or cancel on the page that opens.</p></div>',
  });

  if (!emailResult.sent) {
    // Preserve the previous link if the provider rejected this resend. Never
    // invalidate a working customer link merely because an email could not send.
    const { error: restoreError } = await auth.db.from('orders')
      .update({
        confirmation_token_hash: order.confirmation_token_hash,
        confirmation_expires_at: order.confirmation_expires_at,
        confirmation_decided_at: order.confirmation_decided_at,
      })
      .eq('id', id)
      .eq('order_status', 'pending')
      .eq('confirmation_token_hash', tokenHash);
    if (restoreError) console.error('Could not restore previous confirmation token for order', order.order_number, restoreError.message);

    return adminJson({
      error: 'Resend could not deliver the confirmation email. The previous confirmation link was preserved when possible. Check the sender configuration and Resend logs, then retry.',
      emailSent: false,
    }, 502);
  }

  return adminJson({
    ok: true,
    emailSent: true,
    message: 'A new 24-hour confirmation link was emailed to ' + order.email + '. The previous link is no longer valid.',
  });
}
