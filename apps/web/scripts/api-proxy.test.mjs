import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import http from 'node:http';
import https from 'node:https';
import { test } from 'node:test';
import { createApiLookup, proxyApiRequest, readApiProxyConfig } from './api-proxy.mjs';

const secureConfig = () =>
  readApiProxyConfig({
    VERCEL: '1',
    API_INTERNAL_URL: 'https://example.tail123456.ts.net',
    API_DNS_FALLBACK_IPS: '192.0.2.1, 192.0.2.2',
  });

function lookupResult(lookup, hostname, options = { all: true }) {
  return new Promise((resolve, reject) => {
    lookup(hostname, options, (error, ...result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
}

test('normal DNS takes precedence over explicitly configured fallback addresses', async () => {
  const config = secureConfig();
  const addresses = [{ address: '198.51.100.3', family: 4 }];
  let called = 0;
  const lookup = createApiLookup(config, (host, options, callback) => {
    assert.equal(host, config.origin.hostname);
    assert.equal(options.all, true);
    called++;
    callback(null, addresses);
  });
  assert.deepEqual(await lookupResult(lookup, config.origin.hostname), [addresses]);
  assert.equal(called, 1);
});

test('only DNS unavailability permits fallback for the exact configured hostname', async () => {
  const config = secureConfig();
  for (const code of ['ENOTFOUND', 'EAI_AGAIN']) {
    const error = Object.assign(new Error('private DNS detail'), { code });
    const lookup = createApiLookup(config, (_host, _options, callback) => callback(error));
    assert.deepEqual(await lookupResult(lookup, config.origin.hostname), [
      [
        { address: '192.0.2.1', family: 4 },
        { address: '192.0.2.2', family: 4 },
      ],
    ]);
    assert.deepEqual(await lookupResult(lookup, config.origin.hostname, { family: 4 }), [
      '192.0.2.1',
      4,
    ]);
    await assert.rejects(lookupResult(lookup, 'other.tail123456.ts.net'), { code });
    await assert.rejects(lookupResult(lookup, config.origin.hostname, { family: 6 }), { code });
  }
  for (const code of ['ECONNREFUSED', 'ETIMEDOUT', 'CERT_HAS_EXPIRED']) {
    const lookup = createApiLookup(config, (_host, _options, callback) =>
      callback(Object.assign(new Error('private detail'), { code })),
    );
    await assert.rejects(lookupResult(lookup, config.origin.hostname), { code });
  }
});

test('fallback is disabled by default and cannot target non-Tailscale or HTTP origins', async () => {
  const plain = readApiProxyConfig({});
  assert.equal(plain.origin.origin, 'http://127.0.0.1:3301');
  assert.deepEqual(plain.fallbackIPs, []);
  for (const env of [
    { API_DNS_FALLBACK_IPS: '192.0.2.1' },
    { API_INTERNAL_URL: 'https://example.com', API_DNS_FALLBACK_IPS: '192.0.2.1' },
    { API_INTERNAL_URL: 'https://example.ts.net', API_DNS_FALLBACK_IPS: 'not-an-IP' },
    { API_INTERNAL_URL: 'https://example.ts.net', API_DNS_FALLBACK_IPS: '192.0.2.1:443' },
  ])
    assert.throws(() => readApiProxyConfig(env));
  const error = Object.assign(new Error('missing DNS'), { code: 'ENOTFOUND' });
  const lookup = createApiLookup(plain, (_host, _options, callback) => callback(error));
  await assert.rejects(lookupResult(lookup, plain.origin.hostname), { code: 'ENOTFOUND' });
});

async function serverFixture(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const env = { API_INTERNAL_URL: `http://127.0.0.1:${server.address().port}` };
  return { server, env };
}

test('fixed-origin proxy preserves OAuth query, body and cookies without forwarding hop headers', async (t) => {
  let received;
  const { env } = await serverFixture(t, async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = {
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: Buffer.concat(chunks).toString(),
    };
    response.writeHead(200, {
      'content-type': 'application/json',
      connection: 'close, x-private-hop',
      'x-private-hop': 'omit-me',
      'set-cookie': ['state=one; Secure; HttpOnly; SameSite=Lax', 'session=two; Secure; HttpOnly'],
      'cache-control': 'public, max-age=3600',
    });
    response.write('{"ok":');
    response.end('true}');
  });
  const request = new Request(
    'https://liftory.test/api/auth/callback/google?state=test&code=a%2Bb',
    {
      method: 'POST',
      headers: {
        host: 'attacker.example',
        origin: 'https://liftory.test',
        cookie: 'state=one',
        authorization: 'Bearer test-only',
        connection: 'x-remove-me',
        'x-remove-me': 'omit-me',
        'content-type': 'application/json',
      },
      body: '{"provider":"google"}',
    },
  );
  const result = await proxyApiRequest(request, { env });
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { ok: true });
  assert.equal(received.url, '/api/auth/callback/google?state=test&code=a%2Bb');
  assert.equal(received.method, 'POST');
  assert.equal(received.body, '{"provider":"google"}');
  assert.equal(received.headers.host, new URL(env.API_INTERNAL_URL).host);
  assert.equal(received.headers.origin, 'https://liftory.test');
  assert.equal(received.headers.cookie, 'state=one');
  assert.equal(received.headers.authorization, 'Bearer test-only');
  assert.equal(received.headers['x-remove-me'], undefined);
  assert.equal(result.headers.get('x-private-hop'), null);
  assert.deepEqual(result.headers.getSetCookie(), [
    'state=one; Secure; HttpOnly; SameSite=Lax',
    'session=two; Secure; HttpOnly',
  ]);
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
});

test('redirects are passed to the browser and no-body responses remain empty', async (t) => {
  const { env } = await serverFixture(t, (request, response) => {
    if (request.url === '/api/redirect')
      response.writeHead(302, { location: 'https://accounts.google.com/example' }).end();
    else response.writeHead(204).end();
  });
  const redirect = await proxyApiRequest(new Request('https://liftory.test/api/redirect'), { env });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), 'https://accounts.google.com/example');
  await redirect.body.cancel();
  const empty = await proxyApiRequest(new Request('https://liftory.test/api/empty'), { env });
  assert.equal(empty.status, 204);
  assert.equal(await empty.text(), '');
});

test('non-API paths and oversized requests never reach the upstream', async (t) => {
  let calls = 0;
  const { env } = await serverFixture(t, (_request, response) => {
    calls++;
    response.end();
  });
  const invalid = await proxyApiRequest(new Request('https://liftory.test/not-api'), { env });
  assert.equal(invalid.status, 404);
  const large = await proxyApiRequest(
    new Request('https://liftory.test/api/sync', { method: 'POST', body: '12345' }),
    { env, maxBodyBytes: 4 },
  );
  assert.equal(large.status, 413);
  assert.equal(calls, 0);
});

test('timeouts and disconnects do not retry mutations or expose private errors', async (t) => {
  let calls = 0;
  const { env } = await serverFixture(t, () => {
    calls++;
  });
  const result = await proxyApiRequest(
    new Request('https://liftory.test/api/sync?private=secret', { method: 'POST', body: '{}' }),
    { env, timeoutMs: 50 },
  );
  assert.equal(result.status, 502);
  assert.equal(calls, 1);
  assert.deepEqual(await result.json(), { message: 'The API is temporarily unavailable.' });
  assert.equal(result.headers.get('cache-control'), 'private, no-store');
});

test('HTTPS fallback preserves the original TLS name and never disables certificate verification', async () => {
  const original = https.request;
  let calls = 0;
  try {
    https.request = (url, options) => {
      calls++;
      assert.equal(url.hostname, 'example.tail123456.ts.net');
      assert.equal(options.servername, 'example.tail123456.ts.net');
      assert.equal(options.headers.host, 'example.tail123456.ts.net');
      assert.notEqual(options.rejectUnauthorized, false);
      assert.equal(options.checkServerIdentity, undefined);
      const request = new EventEmitter();
      request.end = () =>
        queueMicrotask(() => request.emit('error', new Error('sensitive TLS failure')));
      return request;
    };
    const config = secureConfig();
    const response = await proxyApiRequest(new Request('https://liftory.test/api/session'), {
      env: {
        API_INTERNAL_URL: config.origin.origin,
        API_DNS_FALLBACK_IPS: config.fallbackIPs.join(','),
      },
    });
    assert.equal(response.status, 502);
    assert.equal(calls, 1);
    assert.deepEqual(await response.json(), { message: 'The API is temporarily unavailable.' });
  } finally {
    https.request = original;
  }
});
