import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store, private' } });

export async function GET(request: NextRequest) {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!token || token.length > 4096) return json({ error: 'Sign in to view your order history.' }, 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) return json({ error: 'Customer order history is not configured.' }, 503);

  const auth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: authData, error: authError } = await auth.auth.getUser(token);
  const user = authData.user;
  if (authError || !user?.email || !user.email_confirmed_at) {
    return json({ error: 'A verified customer account is required to view order history.' }, 403);
  }

  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await db.from('orders')
    .select('id,order_number,order_status,payment_status,total_inr,created_at,updated_at,shipping_provider,tracking_number,tracking_url,expected_delivery_date,order_items(id,product_name,size,colour,quantity,unit_price_inr,line_total_inr),order_status_events(status,note,created_at),return_requests(id,status,request_type,created_at)')
    .eq('email', user.email)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[account/orders] Customer order history query failed:', error.code, error.message);
    return json({ error: 'Your order history is temporarily unavailable. Please try again.' }, 503);
  }

  return json({
    orders: (data || []).map((order) => ({
      ...order,
      order_items: order.order_items || [],
      order_status_events: order.order_status_events || [],
      return_requests: order.return_requests || [],
    })),
  });
}
