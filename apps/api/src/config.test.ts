import { describe, expect, it } from 'vitest';
import { readConfig } from './config.js';

const base = {
  DATABASE_URL: 'postgres://fixture:fixture@localhost:5432/fixture',
  APP_ORIGIN: 'http://localhost:3300',
  BETTER_AUTH_SECRET: 'test-only-secret-that-is-long-enough',
  LIFTORY_DEV_AUTH: 'true',
};
describe('API environment boundaries', () => {
  it('permits the explicit localhost development profile', () => {
    expect(readConfig(base)).toMatchObject({ development: true, host: '127.0.0.1', port: 3301 });
  });
  it.each([
    { NODE_ENV: 'production' },
    { API_HOST: '0.0.0.0' },
    { APP_ORIGIN: 'http://192.168.1.10:3300' },
    { DATABASE_URL: 'file:///tmp/database' },
    { BETTER_AUTH_SECRET: 'short' },
    { LIFTORY_DEV_AUTH: 'yes' },
    { APP_ORIGIN: 'https://example.test/path' },
    { APP_ORIGIN: 'https://user:password@example.test' },
    { API_PORT: '0' },
    { API_PORT: '65536' },
    { API_PORT: 'bad' },
    { GOOGLE_CLIENT_ID: 'one-half' },
    { ALLOWED_EMAILS: 'invalid' },
    { REGISTRATION_MODE: 'anything' },
    { REGISTRATION_MODE: '' },
  ])('rejects unsafe or incomplete configuration %j', (patch) => {
    expect(() => readConfig({ ...base, ...patch })).toThrow('Invalid API configuration');
  });
  it('requires HTTPS, Google credentials and an allowlist in production', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      LIFTORY_DEV_AUTH: 'false',
      APP_ORIGIN: 'https://liftory.example.test',
      GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'fixture-client-secret',
      ALLOWED_EMAILS: 'Owner@Example.test',
    };
    expect(readConfig(production).registrationMode).toBe('allowlist');
    expect(readConfig(production).allowedEmails.has('owner@example.test')).toBe(true);
    for (const patch of [
      { APP_ORIGIN: 'http://liftory.example.test' },
      { GOOGLE_CLIENT_SECRET: '' },
      { ALLOWED_EMAILS: '' },
    ])
      expect(() => readConfig({ ...production, ...patch })).toThrow();
  });
  it('allows public production signup only when explicitly configured', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      LIFTORY_DEV_AUTH: 'false',
      APP_ORIGIN: 'https://liftory.example.test',
      GOOGLE_CLIENT_ID: 'fixture.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'fixture-client-secret',
      REGISTRATION_MODE: 'public',
    };
    expect(readConfig(production)).toMatchObject({
      registrationMode: 'public',
      allowedEmails: new Set(),
    });
    for (const patch of [
      { REGISTRATION_MODE: undefined },
      { REGISTRATION_MODE: 'allowlist' },
      { GOOGLE_CLIENT_SECRET: '' },
      { APP_ORIGIN: 'http://liftory.example.test' },
      { LIFTORY_DEV_AUTH: 'true' },
    ])
      expect(() => readConfig({ ...production, ...patch })).toThrow();
  });
  it('does not interpolate the bad value in an error', () => {
    expect(() => readConfig({ ...base, DATABASE_URL: 'secret-sensitive-fixture' })).toThrow(
      /^Invalid API configuration;/,
    );
  });
});
