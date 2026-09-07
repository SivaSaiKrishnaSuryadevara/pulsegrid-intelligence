/**
 * Browser-side Supabase client (anon key, session bound to cookies via
 * `@supabase/ssr`). Use this from Client Components only — `/discover` is
 * the first consumer. Server-side reads (public pSEO pages, the future
 * middleware-based auth gate) use `src/lib/supabase/service.ts` instead.
 */

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export function getBrowserSupabaseClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable(s).'
    );
  }

  cachedClient = createBrowserClient(url, anonKey);
  return cachedClient;
}
