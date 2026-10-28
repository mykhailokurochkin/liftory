import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) {
  console.log('Existing .env preserved.');
} else {
  const password = randomBytes(24).toString('hex');
  const template = readFileSync('.env.example', 'utf8')
    .replaceAll('replace-local-password', password)
    .replace('replace-with-at-least-32-random-characters', randomBytes(48).toString('base64url'));
  writeFileSync('.env', template, { mode: 0o600, flag: 'wx' });
  console.log('Created private local .env. Credentials were not printed.');
}
