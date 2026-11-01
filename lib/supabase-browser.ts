import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null | undefined;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) { browserClient = null; return browserClient; }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') { browserClient = null; return browserClient; }
    browserClient = createClient(parsed.toString().replace(/\/$/, ''), key, {
      auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
    });
  } catch { browserClient = null; }
  return browserClient;
}

export function getSupabaseBrowserConfigIssue(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
  if (!url && !key) return 'Supabase URL and publishable key are missing.';
  if (!url) return 'NEXT_PUBLIC_SUPABASE_URL is missing.';
  if (!key) return 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or legacy NEXT_PUBLIC_SUPABASE_ANON_KEY) is missing.';
  try { const parsed = new URL(url); if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return 'Supabase URL must start with https:// or http://.'; }
  catch { return 'Supabase URL is invalid. Use the Project URL from Supabase → Connect.'; }
  return null;
}