import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../lib/admin';

export const dynamic = 'force-dynamic';

const columns = [
  ['Order number', 'order_number'],
  ['Customer', 'customer_name'],
  ['Email', 'email'],
  ['Total INR', 'total_inr'],
  ['Order status', 'order_status'],
  ['Payment status', 'payment_status'],
  ['Created at', 'created_at'],
  ['Courier', 'shipping_provider'],
  ['Tracking number', 'tracking_number'],
  ['Tracking URL', 'tracking_url'],
  ['Expected delivery date', 'expected_delivery_date'],
] as const;

function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  // Prevent spreadsheet formula execution when an exported cell begins with a formula marker.
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  const rows: Record<string, unknown>[] = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await auth.db
      .from('orders')
      .select('order_number,customer_name,email,total_inr,order_status,payment_status,created_at,shipping_provider,tracking_number,tracking_url,expected_delivery_date')
      .order('created_at', { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error('[admin/orders/export] Order export query failed:', { code: error.code, message: error.message });
      return NextResponse.json({ error: 'Could not export orders. Check the orders table and try again.' }, {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      });
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }

  const header = columns.map(([label]) => csvCell(label)).join(',');
  const body = rows.map(row => columns.map(([, key]) => csvCell(row[key])).join(','));
  const csv = '\uFEFF' + [header, ...body].join('\r\n');
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="durgamma-orders-' + date + '.csv"',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
