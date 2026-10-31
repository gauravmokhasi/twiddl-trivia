/**
 * ADMIN OPERATION C - Permanently delete Supabase Auth accounts.
 *
 * Run manually from your own machine. This is NOT a Twiddl feature, it is not
 * reachable from the browser, and it is not part of the Next.js app.
 *
 *   npx tsx supabase/manual-admin/delete_auth_accounts.ts <uuid> [<uuid> ...]
 *   npx tsx supabase/manual-admin/delete_auth_accounts.ts --apply <uuid> [...]
 *
 * Without --apply it only inspects and reports (dry run). Nothing is deleted
 * until you pass --apply.
 *
 * ---------------------------------------------------------------------------
 * Why a script, and not a SQL DELETE
 * ---------------------------------------------------------------------------
 * Supabase Auth keeps users in auth.users, which Supabase owns and which a
 * plain SQL DELETE cannot safely edit: the row is bound up with sessions,
 * identities, the refresh-token family and MFA records, and GoTrue keeps its
 * own bookkeeping. The supported route is the Auth Admin API, i.e.
 * `auth.admin.deleteUser(id)`. Do not issue a manual DELETE against auth.users.
 *
 * ---------------------------------------------------------------------------
 * What this does and does not remove
 * ---------------------------------------------------------------------------
 * This deletes ONLY the auth account. `public.profiles.id` has no foreign key
 * to auth.users, so the profile row and everything hanging off it (questions,
 * answers, follows, reports) survives. Run `delete_profiles.sql` afterwards to
 * remove those.
 *
 * Order matters: delete the auth account FIRST. In the other order the person
 * can sign in again and `src/app/api/profile-sync/route.ts` recreates the
 * profile row on their next visit, undoing the deletion.
 *
 * Reversibility: NOT reversible. `auth.admin.deleteUser` is permanent.
 *
 * ---------------------------------------------------------------------------
 * Environment (never commit these, never print them)
 * ---------------------------------------------------------------------------
 *   NEXT_PUBLIC_SUPABASE_URL    your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY   service-role key, server-side only
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../src/lib/database.types';

/** The automated trivia profile. Never removable through this script. */
const TWIDDLOO_ID = '00000000-0000-4000-8000-000000000001';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Target = {
  id: string;
  authFound: boolean;
  authEmail: string | null;
  profileFound: boolean;
  profileUsername: string | null;
};

function usage(): never {
  console.error([
    'Usage:',
    '  npx tsx supabase/manual-admin/delete_auth_accounts.ts <uuid> [<uuid> ...]',
    '  npx tsx supabase/manual-admin/delete_auth_accounts.ts --apply <uuid> [<uuid> ...]',
    '',
    'Environment:',
    '  NEXT_PUBLIC_SUPABASE_URL    Supabase project URL',
    '  SUPABASE_SERVICE_ROLE_KEY   service-role key (server only, never commit)',
  ].join('\n'));
  process.exit(2);
}

function parseArgs(argv: string[]): { apply: boolean; ids: string[] } {
  const apply = argv.includes('--apply');
  const ids = argv.filter((arg) => arg !== '--apply');

  if (ids.length === 0) usage();

  const malformed = ids.filter((id) => !UUID_PATTERN.test(id));
  if (malformed.length > 0) {
    // Refuse rather than guess: a malformed id must never be sent to the API.
    console.error(`Not valid UUID(s): ${malformed.join(', ')}`);
    process.exit(2);
  }

  if (ids.includes(TWIDDLOO_ID)) {
    console.error('Refusing to target the twiddloo bot profile.');
    process.exit(2);
  }

  return { apply, ids };
}

/** Reads both sides without changing anything, so a dry run is genuinely read-only. */
async function inspectTargets(
  supabase: ReturnType<typeof buildClient>,
  ids: string[],
): Promise<Target[]> {
  const targets: Target[] = [];

  for (const id of ids) {
    const { data, error } = await supabase.auth.admin.getUserById(id);
    const user = error ? null : (data?.user ?? null);

    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', id)
      .maybeSingle();

    targets.push({
      id,
      authFound: Boolean(user),
      authEmail: user?.email ?? null,
      profileFound: Boolean(profile),
      profileUsername: (profile as { username: string } | null)?.username ?? null,
    });
  }

  return targets;
}

function buildClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    process.exit(2);
  }

  // The key is read from the environment and never logged or embedded.
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function main(): Promise<void> {
  const { apply, ids } = parseArgs(process.argv.slice(2));
  const supabase = buildClient();
  const targets = await inspectTargets(supabase, ids);

  console.log('');
  console.log(apply ? 'MODE: APPLY  - auth accounts WILL be deleted' : 'MODE: DRY RUN - nothing will be deleted');
  console.log('');
  // Emails/username are shown on purpose so the operator can confirm the right
  // accounts. The service-role key is never printed.
  console.table(targets.map((target) => ({
    id: target.id,
    auth_account: target.authFound ? 'found' : 'MISSING',
    email: target.authEmail ?? '-',
    profile_row: target.profileFound ? 'found' : 'MISSING',
    username: target.profileUsername ?? '-',
  })));

  const deletable = targets.filter((target) => target.authFound);
  const missing = targets.filter((target) => !target.authFound);

  if (missing.length > 0) {
    console.log(`\n${missing.length} id(s) have no auth account and will be skipped:`);
    for (const target of missing) console.log(`  - ${target.id}`);
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to delete the auth account(s).');
    console.log('After that, run supabase/manual-admin/delete_profiles.sql for the profile row(s).');
    return;
  }

  if (deletable.length === 0) {
    console.log('\nNo auth accounts to delete.');
    return;
  }

  let failures = 0;
  for (const target of deletable) {
    // Permanent. GoTrue removes the user, their sessions, identities and
    // refresh tokens together. public.profiles is untouched (no FK, no trigger).
    const { error } = await supabase.auth.admin.deleteUser(target.id);
    if (error) {
      failures += 1;
      console.error(`  FAILED ${target.id}: ${error.message}`);
    } else {
      console.log(`  deleted auth account ${target.id}`);
    }
  }

  console.log(`\nDeleted ${deletable.length - failures} of ${deletable.length} auth account(s).`);
  if (failures > 0) {
    console.error(`${failures} failed; nothing else was changed for those.`);
    process.exitCode = 1;
  }

  console.log('Next: run supabase/manual-admin/delete_profiles.sql to remove the profile row(s).');
}

main().catch((error) => {
  console.error(`Unexpected failure: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
