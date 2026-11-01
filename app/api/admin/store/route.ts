import { NextRequest } from 'next/server';
import { adminJson, requireAdmin } from '../../../../lib/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const [products, orders, returns, lowStock] = await Promise.all([
    auth.db.from('products').select('id,name,category,price_inr,is_active,product_variants(id,size,colour,stock,sku)').order('updated_at', { ascending: false }),
    auth.db.from('orders').select('id,order_number,customer_name,total_inr,order_status,payment_status,created_at').order('created_at', { ascending: false }).limit(100),
    auth.db.from('return_requests').select('id,status,created_at').order('created_at', { ascending: false }).limit(50),
    auth.db.from('product_variants').select('id,product_id,sku,size,colour,stock,products(name)').lte('stock', 5).order('stock', { ascending: true }).limit(100),
  ]);
  const failure = [products.error, orders.error, returns.error, lowStock.error].find(Boolean);
  if (failure) return adminJson({ error: 'Could not load store operations.' }, 500);
  return adminJson({ products: products.data || [], orders: orders.data || [], returns: returns.data || [], lowStock: lowStock.data || [] });
}
