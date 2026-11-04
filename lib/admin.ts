import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export function adminJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function adminClient(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return { error: adminJson({ error: 'Admin service is not configured. Check the Supabase URL, publishable key and server-only service-role key in Vercel.' }, 503) };
  const authHeader = request.headers.get('authorization') || '';
  if (!authHeader.startsWith('Bearer ')) return { error: adminJson({ error: 'Sign in is required.' }, 401) };
  const token = authHeader.slice(7);
  return { auth: createClient(url, anon, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { autoRefreshToken: false, persistSession: false } }), db: createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } }) };
}

export async function requireAdmin(request: NextRequest) {
  const clients = adminClient(request);
  if ('error' in clients) return { error: clients.error };
  const { data, error } = await clients.auth.auth.getUser();
  if (error || !data.user?.email) return { error: adminJson({ error: 'Your session is invalid. Sign out and sign in again.' }, 401) };
  const allowed = (process.env.STORE_ADMIN_EMAILS || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) {
    console.error('[admin] STORE_ADMIN_EMAILS is missing or empty.');
    return { error: adminJson({ error: 'Store admin access is not configured. In Vercel, add STORE_ADMIN_EMAILS with the exact owner email, then redeploy.' }, 503) };
  }
  if (!allowed.includes(data.user.email.toLowerCase())) {
    console.warn('[admin] Authenticated account is not in STORE_ADMIN_EMAILS.');
    return { error: adminJson({ error: 'This account is signed in but is not on the store owner allowlist. Add its exact email to STORE_ADMIN_EMAILS in Vercel, then redeploy.' }, 403) };
  }
  return { db: clients.db, email: data.user.email };
}
