/**
 * Cookie-bound, user-session-aware Supabase client for Server Components and
 * Route Handlers (`@supabase/ssr`). Unlike `service.ts`, this client acts
 * *as the signed-in caller* — RLS applies exactly as it would for that
 * user's own browser session, and `auth.uid()` inside any RPC it calls
 * resolves to that real user, not to nothing.
 *
 * That's the reason Step 5's unlock route calls `unlock_creator_contact`
 * through this client rather than the service-role one: the RPC derives
 * "who is spending the credit" from `auth.uid()`, which only resolves
 * correctly when the request carries the caller's own JWT.
 */

import { createServerClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

export async function getServerSupabaseClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable(s).'
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render, where cookies() is
          // read-only — a refreshed session is instead persisted by
          // middleware on the next request. Route Handlers (this file's
          // main consumer in Step 5) can always write cookies, so this
          // branch is effectively Server-Component-only.
        }
      },
    },
  });
}
