import { NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth-server';
import { readJsonBody } from '@/lib/api-guards';
import { canBlock } from '@/lib/user-blocks';
import { createBlock, removeBlock } from '@/lib/user-blocks-server';
import { supabaseAdmin } from '@/lib/supabase-admin';

/**
 * Creates or removes one private block for the caller.
 *
 * The block list belongs to the caller alone: `blocker_id` is always the
 * verified server-side user, never an id from the request body, and nothing in
 * here reports whether a block already exists.
 */
async function resolveBlockedId(request: Request): Promise<
  { blockedId: string; userId: string } | NextResponse
> {
  const body = await readJsonBody(request);
  if (!body) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });

  const { blockedId } = body as { blockedId?: unknown };
  if (typeof blockedId !== 'string' || !blockedId) {
    return NextResponse.json({ error: 'blockedId is required.' }, { status: 400 });
  }

  const user = await getAuthenticatedUser();
  if (!user?.id) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  if (!canBlock(user.id, blockedId)) {
    return NextResponse.json({ error: 'You cannot block yourself.' }, { status: 400 });
  }

  const { data: target, error: targetError } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .eq('id', blockedId)
    .maybeSingle();

  if (targetError) return NextResponse.json({ error: 'Unable to do that right now.' }, { status: 500 });
  if (!target) return NextResponse.json({ error: 'That profile does not exist.' }, { status: 404 });

  return { blockedId, userId: user.id };
}

export async function POST(request: Request) {
  const resolved = await resolveBlockedId(request);
  if (resolved instanceof NextResponse) return resolved;

  try {
    await createBlock(resolved.userId, resolved.blockedId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to do that right now.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const resolved = await resolveBlockedId(request);
  if (resolved instanceof NextResponse) return resolved;

  try {
    await removeBlock(resolved.userId, resolved.blockedId);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to do that right now.' },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
