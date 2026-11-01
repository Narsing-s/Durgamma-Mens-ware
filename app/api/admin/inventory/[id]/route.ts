import { NextRequest } from 'next/server';
import { adminJson, requireAdmin } from '../../../../../lib/admin';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  let body: { stock?: unknown; reason?: unknown };
  try { body = await request.json(); } catch { return adminJson({ error: 'Invalid request.' }, 400); }
  const stock = Number(body.stock);
  if (!Number.isInteger(stock) || stock < 0 || stock > 1000000) return adminJson({ error: 'Enter a valid stock quantity.' }, 400);
  if (typeof body.reason !== 'string' || body.reason.trim().length < 3) return adminJson({ error: 'Provide a reason for the stock adjustment.' }, 400);
  const { id } = await params;
  const { data, error } = await auth.db.rpc('adjust_store_inventory', {
    p_variant_id: id, p_new_stock: stock, p_reason: body.reason.trim(), p_adjusted_by: auth.email
  });
  if (error) return adminJson({ error: error.message || 'Stock update failed.' }, 409);
  return adminJson({ ok: true, result: data });
}