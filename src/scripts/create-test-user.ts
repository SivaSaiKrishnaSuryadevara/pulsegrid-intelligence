/**
 * Creates a dev-only test agency account for local `/discover` inspection:
 * a Supabase Auth user plus a matching `public.profiles` row with enough
 * `contact_unlocks_remaining` credits to exercise the "Reveal Desk" /
 * unlock-contact drawer flow.
 *
 * Uses the Auth Admin API (`supabase.auth.admin.*`), which only works with
 * the service-role key — the same reason this script, like the seeder,
 * must be run with `--env-file=.env.local`.
 *
 * Safe to re-run: if the user already exists, it's looked up instead of
 * re-created, and the profile row is upserted either way.
 *
 * This is a throwaway local/dev convenience account, not a real customer —
 * don't run this against a Supabase project holding real user data.
 *
 * Usage: `npx tsx --env-file=.env.local src/scripts/create-test-user.ts`
 */

import { getServiceRoleClient } from '@/lib/supabase/service';

const TEST_EMAIL = 'test@pulsegrid.io';
const TEST_PASSWORD = 'PulseGrid2026!';
const TEST_AGENCY_NAME = 'PulseGrid Test Agency';
const TEST_CONTACT_UNLOCKS_REMAINING = 5;

async function findUserIdByEmail(
  supabase: ReturnType<typeof getServiceRoleClient>,
  email: string
): Promise<string | null> {
  const perPage = 200;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      throw new Error(`Failed to list existing users: ${error.message}`);
    }
    const match = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (data.users.length < perPage) return null; // exhausted all pages
  }
}

async function main(): Promise<void> {
  const supabase = getServiceRoleClient();

  let userId: string;

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    // Skips the email-confirmation requirement — this account only ever
    // needs to work with signInWithPassword against a local dev server.
    email_confirm: true,
  });

  if (createError) {
    const alreadyExists = /already.*(registered|exists)/i.test(createError.message);
    if (!alreadyExists) {
      throw new Error(`Failed to create auth user: ${createError.message}`);
    }
    console.log(`Auth user ${TEST_EMAIL} already exists — looking up its id...`);
    const existingId = await findUserIdByEmail(supabase, TEST_EMAIL);
    if (!existingId) {
      throw new Error(
        `createUser reported "${createError.message}" but no matching user was found via listUsers.`
      );
    }
    userId = existingId;
    console.log(`Found existing auth user: ${userId}`);
  } else {
    userId = created.user.id;
    console.log(`Created new auth user: ${userId}`);
  }

  const { error: profileError } = await supabase.from('profiles').upsert(
    {
      id: userId,
      full_name: 'Test Agency Rep',
      agency_name: TEST_AGENCY_NAME,
      contact_unlocks_remaining: TEST_CONTACT_UNLOCKS_REMAINING,
    },
    { onConflict: 'id' }
  );

  if (profileError) {
    throw new Error(`Failed to upsert profile: ${profileError.message}`);
  }

  console.log(`Profile upserted (contact_unlocks_remaining=${TEST_CONTACT_UNLOCKS_REMAINING}).`);
  console.log('\nTest credentials:');
  console.log(`  email:    ${TEST_EMAIL}`);
  console.log(`  password: ${TEST_PASSWORD}`);
}

main().catch((err) => {
  console.error('create-test-user script crashed:', err);
  process.exitCode = 1;
});
