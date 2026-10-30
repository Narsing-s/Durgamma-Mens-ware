import { NextResponse } from 'next/server';

export const runtime = 'edge';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'durgamma-menswear-storefront',
    checkout: 'not-configured',
    catalog: 'demo-data',
    timestamp: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
