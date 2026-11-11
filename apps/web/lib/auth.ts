import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import type { AuthUser } from '@liftory/contracts';
import { db } from './db';
import * as schema from './schema';

export const localUser: AuthUser = {
  id: 'local-developer',
  name: 'Local developer',
  email: 'local@example.test',
};

const allowedEmails = new Set(
  (process.env.ALLOWED_EMAILS ?? 'kurochkinmy@gmail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

function isAllowed(email: string): boolean {
  if (allowedEmails.size === 0) return true;
  return allowedEmails.has(email.toLowerCase());
}

const origin =
  process.env.APP_ORIGIN ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : 'http://localhost:3300');

const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim();
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

export const isDevelopment =
  process.env.LIFTORY_DEV_AUTH === 'true' ||
  (process.env.NODE_ENV !== 'production' && !googleClientId);

export const auth = betterAuth({
  appName: 'Liftory',
  baseURL: origin,
  basePath: '/api/auth',
  secret:
    process.env.BETTER_AUTH_SECRET ||
    'liftory-default-secret-key-development-minimum-32-chars-long',
  database: drizzleAdapter(db, { provider: 'pg', schema }),
  trustedOrigins: [
    origin,
    'http://localhost:3300',
    'https://liftory-dev.vercel.app',
    'https://liftory-app.vercel.app',
  ],
  emailAndPassword: { enabled: false },
  account: { encryptOAuthTokens: true, accountLinking: { enabled: false } },
  socialProviders:
    googleClientId && googleClientSecret
      ? {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
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
    useSecureCookies: process.env.NODE_ENV === 'production',
    cookiePrefix: 'liftory',
    defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    ipAddress: { ipAddressHeaders: [] },
  },
  rateLimit: { enabled: true, window: 60, max: 100, storage: 'memory' },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!isAllowed(user.email)) {
            throw new APIError('FORBIDDEN', { message: 'This account is not allowed.' });
          }
          return { data: user };
        },
      },
    },
  },
  logger: { disabled: process.env.NODE_ENV === 'production' },
});

export async function getCurrentUser(requestHeaders: Headers): Promise<AuthUser | null> {
  if (isDevelopment) {
    return localUser;
  }
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user || !isAllowed(session.user.email)) {
    return null;
  }
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
  };
}
