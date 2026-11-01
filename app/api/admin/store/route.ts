import { NextRequest } from 'next/server';
import { adminJson, requireAdmin } from '../../../../lib/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const [products, orders, returns, lowStock] = await Promise.all([
    auth.db.from('products').select('id,name,category,price_inr,is_active,product_variants(id,size,colour,stock,sku)').order('updated_at', { ascending: false }),
    auth.db.from('orders').select('id,order_number,customer_name,email,total_inr,order_status,payment_status,created_at').order('created_at', { ascending: false }).limit(100),
    auth.db.from('return_requests').select('id,status,request_type,reason,customer_note,admin_note,refund_reference,refund_method,refund_amount_inr,order_item_id,order_items(product_name,size,quantity,line_total_inr),created_at,orders(order_number,customer_name,total_inr)').order('created_at', { ascending: false }).limit(50),
    auth.db.from('product_variants').select('id,product_id,sku,size,colour,stock,products(name)').lte('stock', 5).order('stock', { ascending: true }).limit(100),
  ]);
  const failures = [
    { table: 'products', error: products.error },
    { table: 'orders', error: orders.error },
    { table: 'return_requests', error: returns.error },
    { table: 'product_variants', error: lowStock.error },
  ].filter(item => Boolean(item.error));
  if (failures.length) {
    for (const failure of failures) {
      if (failure.error) console.error('[admin/store] Database query failed:', {
        table: failure.table,
        code: failure.error.code,
        message: failure.error.message,
      });
    }
    return adminJson({
      error: `Could not load store operations. Database query failed for: ${failures.map(item => item.table).join(', ')}. Check the database schema and deployment logs.`,
    }, 500);
  }
  return adminJson({ products: products.data || [], orders: orders.data || [], returns: returns.data || [], lowStock: lowStock.data || [] });
}
