import { NextRequest } from 'next/server';
import { adminJson, requireAdmin } from '../../../../../lib/admin';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  let body: { status?: string; note?: string };
  try { body = await request.json(); } catch { return adminJson({ error: 'Invalid request.' }, 400); }
  const allowed = ['pending','confirmed','packed','shipped','delivered','cancelled'];
  if (!body.status || !allowed.includes(body.status)) return adminJson({ error: 'Invalid order status.' }, 400);
  const { id } = await params;
  const { data, error } = await auth.db.rpc('set_store_order_status', { p_order_id: id, p_status: body.status, p_note: (body.note || '').slice(0, 1000) });
  if (error) return adminJson({ error: error.message || 'Order update failed.' }, 409);
  return adminJson({ ok: true, result: data });
}
