import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { inArray } from 'drizzle-orm';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { migrateDatabase } from './migrate.js';
import { verification } from './schema.js';

describe.skipIf(!process.env.TEST_DATABASE_URL)('anonymous HTTP authentication', () => {
  let runtime: Awaited<ReturnType<typeof createApp>>;
  let origin: string;
  beforeAll(async () => {
    await migrateDatabase(process.env.TEST_DATABASE_URL!);
    const config = readConfig({
      DATABASE_URL: process.env.TEST_DATABASE_URL,
      APP_ORIGIN: 'http://localhost:3300',
      LIFTORY_DEV_AUTH: 'false',
      BETTER_AUTH_SECRET: 'test-only-secret-that-is-long-enough',
    });
    runtime = await createApp(config);
    await runtime.app.listen(0, '127.0.0.1');
    origin = 'http://127.0.0.1:' + (runtime.app.getHttpServer().address() as AddressInfo).port;
  });
  afterAll(async () => {
    if (runtime) await runtime.close();
  });
  it('does not accept a forged profile or cookie as an authenticated identity', async () => {
    const session = await fetch(origin + '/api/session', {
      headers: { Cookie: 'liftory.session_token=forged', 'X-User-ID': 'local-developer' },
    });
    expect(await session.json()).toEqual({
      user: null,
      googleConfigured: false,
      development: false,
    });
    expect(
      (await fetch(origin + '/api/records', { headers: { 'X-Liftory-Owner': 'local-developer' } }))
        .status,
    ).toBe(401);
    expect(
      (
        await fetch(origin + '/api/sync', {
          method: 'POST',
          headers: { Origin: 'http://localhost:3300', 'Content-Type': 'application/json' },
          body: '{}',
        })
      ).status,
    ).toBe(401);
  });
});

describe.skipIf(!process.env.TEST_DATABASE_URL)(
  'production authentication behind a Web proxy',
  () => {
    let runtime: Awaited<ReturnType<typeof createApp>>;
    let origin: string;
    const applicationOrigin = 'https://liftory-dev.example.test';
    const createdStates: string[] = [];
    beforeAll(async () => {
      await migrateDatabase(process.env.TEST_DATABASE_URL!);
      runtime = await createApp(
        readConfig({
          NODE_ENV: 'production',
          DATABASE_URL: process.env.TEST_DATABASE_URL,
          APP_ORIGIN: applicationOrigin,
          LIFTORY_DEV_AUTH: 'false',
          BETTER_AUTH_SECRET: 'test-only-production-secret-that-is-long-enough',
          GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com',
          GOOGLE_CLIENT_SECRET: 'fixture-client-secret',
          ALLOWED_EMAILS: 'owner@example.test',
        }),
      );
      await runtime.app.listen(0, '127.0.0.1');
      origin = 'http://127.0.0.1:' + (runtime.app.getHttpServer().address() as AddressInfo).port;
    });
    afterAll(async () => {
      if (!runtime) return;
      if (createdStates.length)
        await runtime.database.db
          .delete(verification)
          .where(inArray(verification.identifier, createdStates));
      await runtime.close();
    });
    it('keeps anonymous session responses private and never trusts a forwarded identity', async () => {
      const response = await fetch(origin + '/api/session', {
        headers: {
          'X-Forwarded-For': '198.51.100.1',
          'X-Real-IP': '198.51.100.2',
          'X-User-ID': 'local-developer',
          Cookie: '__Secure-liftory.session_token=forged',
        },
      });
      expect(response.headers.get('cache-control')).toBe('private, no-store');
      expect(response.headers.get('cdn-cache-control')).toBe('no-store');
      expect(response.headers.get('vercel-cdn-cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({
        user: null,
        googleConfigured: true,
        development: false,
      });
    });
    it('uses the configured Web callback and secure cookies despite forged forwarded headers', async () => {
      const response = await fetch(origin + '/api/auth/sign-in/social', {
        method: 'POST',
        headers: {
          Origin: applicationOrigin,
          'Content-Type': 'application/json',
          'X-Forwarded-Host': 'untrusted.example.test',
          'X-Forwarded-Proto': 'http',
          'X-Forwarded-For': '198.51.100.3',
        },
        body: JSON.stringify({
          provider: 'google',
          callbackURL: applicationOrigin,
          disableRedirect: true,
        }),
        redirect: 'manual',
      });
      expect(response.status).toBe(200);
      const body = (await response.json()) as { url: string };
      const authorization = new URL(body.url);
      const state = authorization.searchParams.get('state');
      if (state) createdStates.push('auth-state:' + state);
      expect(authorization.origin).toBe('https://accounts.google.com');
      expect(authorization.searchParams.get('redirect_uri')).toBe(
        applicationOrigin + '/api/auth/callback/google',
      );
      expect(state).toBeTruthy();
      const cookies = response.headers.getSetCookie();
      expect(cookies.length).toBeGreaterThan(0);
      for (const cookie of cookies) {
        expect(cookie).toMatch(/;\s*Secure(?:;|$)/i);
        expect(cookie).toMatch(/;\s*HttpOnly(?:;|$)/i);
        expect(cookie).toMatch(/;\s*SameSite=Lax(?:;|$)/i);
        expect(cookie).not.toMatch(/;\s*Domain=/i);
      }
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    });
    it.each(['https://untrusted.example.test', 'null', undefined])(
      'rejects an unsafe authentication request with Origin %s',
      async (requestOrigin) => {
        const response = await fetch(origin + '/api/auth/sign-in/social', {
          method: 'POST',
          headers: {
            ...(requestOrigin ? { Origin: requestOrigin } : {}),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ provider: 'google', callbackURL: applicationOrigin }),
          redirect: 'manual',
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ code: 'origin_not_allowed' });
        expect(response.headers.get('location')).toBeNull();
        expect(response.headers.getSetCookie()).toHaveLength(0);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
      },
    );
    it('passes an origin-less Google GET callback to OAuth state validation', async () => {
      const response = await fetch(origin + '/api/auth/callback/google?error=access_denied', {
        redirect: 'manual',
      });
      expect(response.status).toBe(302);
      const redirect = new URL(response.headers.get('location')!);
      expect(redirect.origin).toBe(applicationOrigin);
      expect(redirect.pathname).toBe('/api/auth/error');
      expect(redirect.searchParams.get('error')).toBe('state_not_found');
      expect(response.headers.get('cache-control')).toBe('private, no-store');
    });
  },
);
