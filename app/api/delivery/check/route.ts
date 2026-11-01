import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const pincode = request.nextUrl.searchParams.get('pincode') || '';
  if (!/^[1-9][0-9]{5}$/.test(pincode)) return NextResponse.json({ error: 'Enter a valid 6-digit PIN code.' }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ configured: false }, { status: 503 });
  const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data, error } = await db.from('delivery_pincodes').select('is_serviceable,shipping_inr,min_delivery_days,max_delivery_days').eq('pincode', pincode).maybeSingle();
  if (error) return NextResponse.json({ error: 'Delivery service is temporarily unavailable.' }, { status: 503 });
  if (!data) return NextResponse.json({ serviceable: false });
  return NextResponse.json({ serviceable: data.is_serviceable, shipping: data.shipping_inr, minDays: data.min_delivery_days, maxDays: data.max_delivery_days });
}
