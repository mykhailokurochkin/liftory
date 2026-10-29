import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { fromNodeHeaders } from 'better-auth/node';
import type { IncomingHttpHeaders } from 'node:http';
import type { AuthUser } from '@liftory/contracts';
import type { ApiConfig } from './config.js';
import type { Database } from './database.js';
import * as schema from './schema.js';

export const localUser: AuthUser = {
  id: 'local-developer',
  name: 'Local developer',
  email: 'local@example.test',
};
export function createAuth(config: ApiConfig, database: Database) {
  const allowed = (email: string) =>
    config.registrationMode === 'public' || config.allowedEmails.has(email.toLowerCase());
  const auth = betterAuth({
    appName: 'Liftory',
    baseURL: config.origin,
    basePath: '/api/auth',
    secret: config.secret,
    database: drizzleAdapter(database.db, { provider: 'pg', schema }),
    trustedOrigins: [config.origin],
    emailAndPassword: { enabled: false },
    account: { encryptOAuthTokens: true, accountLinking: { enabled: false } },
    socialProviders:
      config.googleClientId && config.googleClientSecret
        ? {
            google: {
              clientId: config.googleClientId,
              clientSecret: config.googleClientSecret,
              accessType: 'online',
              prompt: 'select_account',
            },
          }
        : {},
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    advanced: {
      useSecureCookies: config.production,
      cookiePrefix: 'liftory',
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      ipAddress: { ipAddressHeaders: [] },
    },
    rateLimit: { enabled: true, window: 60, max: 50, storage: 'memory' },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!user.emailVerified || !allowed(user.email))
              throw new APIError('FORBIDDEN', { message: 'This account is not allowed.' });
            return { data: user };
          },
        },
      },
    },
    logger: { disabled: true },
  });
  return {
    auth,
    async getUser(headers: IncomingHttpHeaders): Promise<AuthUser | null> {
      if (config.development) return localUser;
      const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
      if (!session?.user || !session.user.emailVerified || !allowed(session.user.email))
        return null;
      return { id: session.user.id, email: session.user.email, name: session.user.name };
    },
  };
}
export type Authentication = ReturnType<typeof createAuth>;
