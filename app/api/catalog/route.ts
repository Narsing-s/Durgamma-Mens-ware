import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const revalidate = 60;

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ configured: false, products: [] }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  }
  const supabase = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase
    .from('products')
    .select('id,slug,name,description,category,price_inr,compare_at_price_inr,image_url,product_variants(id,sku,size,colour,stock)')
    .eq('is_active', true)
    .eq('product_variants.is_active', true)
    .order('created_at', { ascending: false });
  if (error) {
    return NextResponse.json({ error: 'Catalogue is temporarily unavailable.' }, { status: 503 });
  }
  return NextResponse.json({ configured: true, products: data ?? [] }, {
    headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
  });
}
