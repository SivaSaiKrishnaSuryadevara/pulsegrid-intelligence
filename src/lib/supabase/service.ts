/**
 * Server-only Supabase client authenticated with the service-role key.
 *
 * PulseGrid's programmatic SEO pages (`/directories/[slug]`, `/verified/[handle]`,
 * `sitemap.ts`) must be crawlable by search engines without a signed-in
 * session, but `creators` / `event_enterprises` RLS policies (see
 * `supabase/migrations/001_init.sql`) only grant SELECT to the
 * `authenticated` role — anonymous reads are intentionally blocked so a
 * stray client-side query can never bulk-read the directory for free.
 *
 * The service-role key bypasses RLS entirely, so it is safe to use ONLY in
 * trusted server-side code (Server Components, Route Handlers, Server
 * Actions) that itself controls exactly which fields reach the rendered
 * page — never import this module from a Client Component or anything
 * bundled for the browser, and never forward its result object as a prop
 * into one either. The public pages built on top of it (see `queries.ts`)
 * are responsible for omitting or masking anything gated, such as direct
 * booking contact details.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;

export function getServiceRoleClient(): SupabaseClient {
  if (cachedClient) {
    return cachedClient;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable(s). ' +
        'Server-only Supabase reads (directories, verified profiles, sitemap) cannot run without them.'
    );
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return cachedClient;
}
