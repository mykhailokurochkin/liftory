export interface ApiConfig {
  databaseURL: string;
  origin: string;
  host: string;
  port: number;
  development: boolean;
  production: boolean;
  secret: string;
  googleClientId?: string;
  googleClientSecret?: string;
  allowedEmails: Set<string>;
  version: string;
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const invalid = () => {
    throw new Error('Invalid API configuration; check the documented environment fields.');
  };
  const databaseURL = env.DATABASE_URL ?? '';
  try {
    const url = new URL(databaseURL);
    if (!['postgres:', 'postgresql:'].includes(url.protocol)) invalid();
  } catch {
    invalid();
  }
  let parsed: URL;
  try {
    parsed = new URL(env.APP_ORIGIN ?? 'http://localhost:3300');
  } catch {
    return invalid();
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  )
    invalid();
  const production = env.NODE_ENV === 'production';
  if (env.LIFTORY_DEV_AUTH && !['true', 'false'].includes(env.LIFTORY_DEV_AUTH)) invalid();
  const development = env.LIFTORY_DEV_AUTH === 'true';
  const host = env.API_HOST ?? '127.0.0.1';
  const port = Number(env.API_PORT ?? '3301');
  if (!Number.isInteger(port) || port < 1 || port > 65535) invalid();
  if (
    development &&
    (production || host !== '127.0.0.1' || !['localhost', '127.0.0.1'].includes(parsed.hostname))
  )
    invalid();
  const secret = env.BETTER_AUTH_SECRET ?? '';
  if (secret.length < 32) invalid();
  const googleClientId = env.GOOGLE_CLIENT_ID?.trim() || undefined;
  const googleClientSecret = env.GOOGLE_CLIENT_SECRET?.trim() || undefined;
  if (!!googleClientId !== !!googleClientSecret) invalid();
  const allowedEmails = new Set(
    (env.ALLOWED_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  if ([...allowedEmails].some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) invalid();
  if (production && (parsed.protocol !== 'https:' || !googleClientId || allowedEmails.size === 0))
    invalid();
  return {
    databaseURL,
    origin: parsed.origin,
    host,
    port,
    development,
    production,
    secret,
    googleClientId,
    googleClientSecret,
    allowedEmails,
    version: env.APP_VERSION || 'local',
  };
}
