import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { recordStore, RecordError } from '@/lib/records';

export const dynamic = 'force-dynamic';

export async function GET() {
  const reqHeaders = await headers();
  const user = await getCurrentUser(reqHeaders);
  if (!user) {
    return NextResponse.json({ code: 'authentication_required' }, { status: 401 });
  }
  const ownerHeader = reqHeaders.get('x-liftory-owner');
  if (ownerHeader && ownerHeader !== user.id) {
    return NextResponse.json({ code: 'owner_mismatch' }, { status: 403 });
  }
  try {
    const records = await recordStore.list(user.id);
    return NextResponse.json(
      { records },
      {
        headers: {
          'Cache-Control': 'private, no-store',
        },
      },
    );
  } catch (error) {
    if (error instanceof RecordError) {
      return NextResponse.json({ code: error.code }, { status: error.status });
    }
    return NextResponse.json({ code: 'internal_error' }, { status: 500 });
  }
}
