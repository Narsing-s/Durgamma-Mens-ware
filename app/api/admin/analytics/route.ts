import { NextRequest } from 'next/server';
import { adminJson, requireAdmin } from '../../../../lib/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  const rawDays = Number(request.nextUrl.searchParams.get('days') || 30);
  if (!Number.isInteger(rawDays) || rawDays < 7 || rawDays > 90) {
    return adminJson({ error: 'Choose an analytics period between 7 and 90 days.' }, 400);
  }

  const { data, error } = await auth.db.rpc('get_store_analytics', { p_days: rawDays });
  if (error) {
    console.error('[admin/analytics] Aggregate query failed:', { code: error.code, message: error.message });
    return adminJson({
      error: 'Sales analytics are not configured yet. Apply supabase/migrations/20261117_store_analytics.sql, then retry.',
    }, 503);
  }

  return adminJson(data || {
    periodDays: rawDays,
    summary: { orders: 0, realized_sales_inr: 0, delivered_orders: 0, active_orders: 0, pipeline_value_inr: 0, average_order_value_inr: 0 },
    dailySales: [],
    topProducts: [],
  });
}
