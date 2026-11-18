import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { requireAdmin } from '../../../../../lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const columns = [
  { header: 'Order number', key: 'order_number', width: 22 },
  { header: 'Customer', key: 'customer_name', width: 28 },
  { header: 'Email', key: 'email', width: 32 },
  { header: 'Total (INR)', key: 'total_inr', width: 16 },
  { header: 'Order status', key: 'order_status', width: 18 },
  { header: 'Payment status', key: 'payment_status', width: 18 },
  { header: 'Order date & time (IST)', key: 'created_at', width: 25 },
  { header: 'Courier', key: 'shipping_provider', width: 22 },
  { header: 'Tracking number', key: 'tracking_number', width: 24 },
  { header: 'Tracking URL', key: 'tracking_url', width: 42 },
  { header: 'Expected delivery date', key: 'expected_delivery_date', width: 24 },
] as const;

type OrderRow = Record<(typeof columns)[number]['key'], string | number | null>;

function dateInIndia(value: string | null): string {
  if (!value) return 'Unknown date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value || '';
  return part('year') + '-' + part('month') + '-' + part('day');
}

function safeCell(value: unknown): string | number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value);
  // Keep user-controlled text inert if a spreadsheet application opens the file.
  return /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? "'" + text : text;
}

function styleDataSheet(sheet: ExcelJS.Worksheet, rows: OrderRow[]) {
  sheet.columns = columns.map(column => ({ header: column.header, key: column.key, width: column.width }));
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: 'K1' };
  const header = sheet.getRow(1);
  header.height = 26;
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF302B27' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  for (const order of rows) {
    const row = sheet.addRow(Object.fromEntries(columns.map(column => [column.key, safeCell(order[column.key])])));
    row.alignment = { vertical: 'top', wrapText: true };
    row.getCell('total_inr').numFmt = '"₹"#,##0.00';
    const createdAt = order.created_at ? new Date(order.created_at) : null;
    if (createdAt && !Number.isNaN(createdAt.getTime())) {
      row.getCell('created_at').value = new Date(createdAt.getTime() + 330 * 60 * 1000);
      row.getCell('created_at').numFmt = 'dd-mmm-yyyy hh:mm';
    }
  }
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && rowNumber % 2 === 0) {
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF7F4EF' } };
      });
    }
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;

  const rows: OrderRow[] = [];
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
    rows.push(...((data || []) as OrderRow[]));
    if (!data || data.length < pageSize) break;
  }

  const groups = new Map<string, OrderRow[]>();
  for (const order of rows) {
    const date = dateInIndia(order.created_at ? String(order.created_at) : null);
    const group = groups.get(date) || [];
    group.push(order);
    groups.set(date, group);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Durgamma Menswear';
  workbook.subject = 'Admin order export grouped by order date';
  workbook.title = 'Durgamma Menswear Orders';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.views = [{ visibility: 'visible', x: 0, y: 0, width: 18000, height: 10000, firstSheet: 0, activeTab: 0 }];

  const summary = workbook.addWorksheet('Summary');
  summary.columns = [
    { header: 'Order date (IST)', key: 'date', width: 22 },
    { header: 'Number of orders', key: 'count', width: 22 },
    { header: 'Order value (INR)', key: 'total', width: 24 },
  ];
  summary.views = [{ state: 'frozen', ySplit: 1 }];
  summary.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  summary.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF302B27' } };
  const sortedDates = [...groups.keys()].sort((a, b) => b.localeCompare(a));
  for (const date of sortedDates) {
    const dayOrders = groups.get(date) || [];
    const total = dayOrders.reduce((sum, order) => sum + Number(order.total_inr || 0), 0);
    const row = summary.addRow({ date, count: dayOrders.length, total });
    row.getCell('total').numFmt = '"₹"#,##0.00';
    const sheet = workbook.addWorksheet(date);
    styleDataSheet(sheet, dayOrders);
  }
  if (!sortedDates.length) {
    summary.addRow({ date: 'No orders found', count: 0, total: 0 });
    const emptySheet = workbook.addWorksheet('No Orders');
    styleDataSheet(emptySheet, []);
  }
  summary.autoFilter = { from: 'A1', to: 'C1' };

  const buffer = await workbook.xlsx.writeBuffer();
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="durgamma-orders-' + date + '.xlsx"',
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
