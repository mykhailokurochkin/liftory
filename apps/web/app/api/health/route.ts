import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const applied = await db.execute(sql`SELECT 1 FROM gym_migration WHERE name = '0001-initial'`);
    if (!applied || applied.length !== 1) {
      throw new Error('Schema is not ready.');
    }
    return NextResponse.json({
      status: 'ok',
      version: process.env.APP_VERSION || 'nextjs-serverless',
    });
  } catch (err) {
    console.error('Health check failed:', err);
    return NextResponse.json({ status: 'unavailable' }, { status: 503 });
  }
}
