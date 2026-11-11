import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getCurrentUser, isDevelopment } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const reqHeaders = await headers();
  const user = await getCurrentUser(reqHeaders);
  return NextResponse.json(
    {
      user,
      googleConfigured: Boolean(process.env.GOOGLE_CLIENT_ID),
      development: isDevelopment,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    },
  );
}
