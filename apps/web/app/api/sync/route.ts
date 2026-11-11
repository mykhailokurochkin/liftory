import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getCurrentUser } from '@/lib/auth';
import { recordStore, RecordError } from '@/lib/records';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const reqHeaders = await headers();
  const user = await getCurrentUser(reqHeaders);
  if (!user) {
    return NextResponse.json({ code: 'authentication_required' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: 'invalid_json' }, { status: 400 });
  }

  try {
    const ack = await recordStore.synchronize(user.id, body);
    return NextResponse.json(ack, {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof RecordError) {
      return NextResponse.json(
        {
          code: error.code,
          ...(error.record !== undefined ? { record: error.record } : {}),
          ...(error.fields ? { fields: error.fields } : {}),
        },
        { status: error.status },
      );
    }
    console.error('Sync error:', error);
    return NextResponse.json({ code: 'internal_error' }, { status: 500 });
  }
}
