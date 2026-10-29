import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createHmac, randomUUID } from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import type { SyncMutation } from '@liftory/contracts';
import { createAuth } from './auth.js';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { migrateDatabase } from './migrate.js';
import { user, verification } from './schema.js';

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
      expect(authorization.searchParams.get('scope')?.split(' ').sort()).toEqual([
        'email',
        'openid',
        'profile',
      ]);
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

describe.skipIf(!process.env.TEST_DATABASE_URL)('Google registration policies', () => {
  type Runtime = Awaited<ReturnType<typeof createApp>>;
  type Authentication = ReturnType<typeof createAuth>;
  const applicationOrigin = 'https://liftory-public.example.test';
  const secret = 'test-only-public-registration-secret-long-enough';
  const allowedEmail = `allowed-${randomUUID()}@example.test`;
  const fixtureEmails: string[] = [];
  const runtimes: Runtime[] = [];
  let publicRuntime: Runtime;
  let publicAuth: Authentication;
  let restrictedAuth: Authentication;
  let publicOrigin: string;
  let restrictedOrigin: string;

  async function googleIdentity(
    authentication: Authentication,
    email = `google-${randomUUID()}@example.test`,
    emailVerified = true,
  ) {
    fixtureEmails.push(email);
    const context = await authentication.auth.$context;
    const created = await context.internalAdapter.createOAuthUser(
      { name: 'Google test user', email, emailVerified },
      { providerId: 'google', accountId: randomUUID(), scope: 'openid email profile' },
    );
    const session = await context.internalAdapter.createSession(created.user.id);
    const signature = createHmac('sha256', secret).update(session.token).digest('base64');
    return {
      user: { id: created.user.id, name: created.user.name, email: created.user.email },
      cookie:
        context.authCookies.sessionToken.name +
        '=' +
        encodeURIComponent(`${session.token}.${signature}`),
    };
  }

  beforeAll(async () => {
    await migrateDatabase(process.env.TEST_DATABASE_URL!);
    for (const mode of ['public', 'allowlist'] as const) {
      const config = readConfig({
        NODE_ENV: 'production',
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        APP_ORIGIN: applicationOrigin,
        LIFTORY_DEV_AUTH: 'false',
        BETTER_AUTH_SECRET: secret,
        GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com',
        GOOGLE_CLIENT_SECRET: 'fixture-client-secret',
        REGISTRATION_MODE: mode,
        ALLOWED_EMAILS: mode === 'allowlist' ? allowedEmail : '',
      });
      const runtime = await createApp(config);
      runtimes.push(runtime);
      const authentication = createAuth(config, runtime.database);
      await runtime.app.listen(0, '127.0.0.1');
      const origin =
        'http://127.0.0.1:' + (runtime.app.getHttpServer().address() as AddressInfo).port;
      if (mode === 'public') {
        publicRuntime = runtime;
        publicAuth = authentication;
        publicOrigin = origin;
      } else {
        restrictedAuth = authentication;
        restrictedOrigin = origin;
      }
    }
  });

  afterAll(async () => {
    try {
      if (runtimes[0] && fixtureEmails.length)
        await runtimes[0].database.db.delete(user).where(inArray(user.email, fixtureEmails));
    } finally {
      await Promise.all(runtimes.map((runtime) => runtime.close()));
    }
  });

  it('registers two verified Google users and isolates their records through authenticated HTTP', async () => {
    const identities = [await googleIdentity(publicAuth), await googleIdentity(publicAuth)];
    expect(identities[0].user.id).not.toBe(identities[1].user.id);
    const sharedRecordId = randomUUID();
    const sharedMutationId = randomUUID();
    for (const identity of identities) {
      const response = await fetch(publicOrigin + '/api/session', {
        headers: { Cookie: identity.cookie },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        user: identity.user,
        googleConfigured: true,
        development: false,
      });
      const mutation: SyncMutation = {
        ownerId: identity.user.id,
        mutationId: sharedMutationId,
        baseVersion: 0,
        entity: {
          kind: 'exercise',
          data: {
            id: sharedRecordId,
            name: identity.user.email,
            equipment: 'machine',
            muscleGroup: 'legs',
            notes: '',
            archived: false,
          },
        },
      };
      const synchronize = (input: SyncMutation) =>
        fetch(publicOrigin + '/api/sync', {
          method: 'POST',
          headers: {
            Cookie: identity.cookie,
            Origin: applicationOrigin,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(input),
        });
      const saved = await synchronize(mutation);
      expect(saved.status).toBe(201);
      expect(await saved.json()).toMatchObject({
        mutationId: sharedMutationId,
        record: { entity: mutation.entity, version: 1 },
      });
      const other = identities.find((candidate) => candidate !== identity)!;
      const forgedRead = await fetch(publicOrigin + '/api/records', {
        headers: { Cookie: identity.cookie, 'X-Liftory-Owner': other.user.id },
      });
      expect(forgedRead.status).toBe(403);
      expect(await forgedRead.json()).toEqual({ code: 'owner_mismatch' });
      const forgedWrite = await synchronize({ ...mutation, ownerId: other.user.id });
      expect(forgedWrite.status).toBe(403);
      expect(await forgedWrite.json()).toEqual({ code: 'owner_mismatch' });
    }
    for (const identity of identities) {
      const response = await fetch(publicOrigin + '/api/records', {
        headers: { Cookie: identity.cookie, 'X-Liftory-Owner': identity.user.id },
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        records: [
          expect.objectContaining({
            version: 1,
            entity: expect.objectContaining({
              data: expect.objectContaining({ id: sharedRecordId, name: identity.user.email }),
            }),
          }),
        ],
      });
    }
  });

  it('rejects unverified Google registration without creating a user', async () => {
    const email = `unverified-${randomUUID()}@example.test`;
    await expect(googleIdentity(publicAuth, email, false)).rejects.toMatchObject({
      status: 'FORBIDDEN',
    });
    expect(
      await publicRuntime.database.db.select().from(user).where(eq(user.email, email)),
    ).toEqual([]);
  });

  it('rejects an existing session when its email is no longer verified', async () => {
    const identity = await googleIdentity(publicAuth);
    await publicRuntime.database.db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, identity.user.id));
    const response = await fetch(publicOrigin + '/api/session', {
      headers: { Cookie: identity.cookie },
    });
    expect(await response.json()).toMatchObject({ user: null });
    expect(
      (
        await fetch(publicOrigin + '/api/records', {
          headers: { Cookie: identity.cookie, 'X-Liftory-Owner': identity.user.id },
        })
      ).status,
    ).toBe(401);
  });

  it('keeps allowlist registration restricted and denies already-existing outside sessions', async () => {
    const allowed = await googleIdentity(restrictedAuth, allowedEmail);
    const accepted = await fetch(restrictedOrigin + '/api/session', {
      headers: { Cookie: allowed.cookie },
    });
    expect(await accepted.json()).toMatchObject({ user: allowed.user });
    const outsideEmail = `outside-${randomUUID()}@example.test`;
    await expect(googleIdentity(restrictedAuth, outsideEmail)).rejects.toMatchObject({
      status: 'FORBIDDEN',
    });
    expect(
      await publicRuntime.database.db.select().from(user).where(eq(user.email, outsideEmail)),
    ).toEqual([]);
    const outside = await googleIdentity(publicAuth, outsideEmail);
    const denied = await fetch(restrictedOrigin + '/api/session', {
      headers: { Cookie: outside.cookie },
    });
    expect(await denied.json()).toMatchObject({ user: null });
    expect(
      (
        await fetch(restrictedOrigin + '/api/records', {
          headers: { Cookie: outside.cookie, 'X-Liftory-Owner': outside.user.id },
        })
      ).status,
    ).toBe(401);
  });
});
