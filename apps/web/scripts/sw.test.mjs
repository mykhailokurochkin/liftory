import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import vm from 'node:vm';
import { prepareServiceWorker } from './build.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(project, 'pwa/sw.template.js'), 'utf8');
const version = 'build-test-1';
const target = 'liftory-shell-' + version;
const url = (request) =>
  new URL(typeof request === 'string' ? request : request.url, 'https://liftory.test').href;

function harness({ failAsset = false } = {}) {
  const stores = new Map();
  const handlers = new Map();
  let networkHTML = `<html><body data-shell-version="${version}"><script src="/_next/static/app.js"></script><link href="/_next/static/app.css"></body></html>`;
  let offline = false;
  class Cache {
    entries = new Map();
    async put(request, response) {
      this.entries.set(url(request), response.clone());
    }
    async match(request) {
      return this.entries.get(url(request))?.clone();
    }
    async keys() {
      return [...this.entries.keys()].map((path) => new Request(path));
    }
  }
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Cache());
      return stores.get(name);
    },
    async delete(name) {
      return stores.delete(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async match(request) {
      for (const cache of stores.values()) {
        const hit = await cache.match(request);
        if (hit) return hit;
      }
    },
  };
  const fetch = async (request) => {
    const path = new URL(url(request)).pathname;
    if (offline) throw new Error('offline');
    if (path === '/')
      return new Response(networkHTML, { headers: { 'Content-Type': 'text/html' } });
    if (failAsset && path === '/_next/static/app.js')
      return new Response('missing', { status: 404 });
    return new Response(path);
  };
  vm.runInNewContext(source.replaceAll('__LIFTORY_SHELL_VERSION__', version), {
    caches,
    fetch,
    URL,
    Response,
    Set,
    Error,
    self: {
      location: { origin: 'https://liftory.test' },
      addEventListener: (type, handler) => handlers.set(type, handler),
      clients: { claim: async () => {} },
      skipWaiting: async () => {},
    },
  });
  return {
    caches,
    stores,
    setHTML(value) {
      networkHTML = value;
    },
    setOffline() {
      offline = true;
    },
    async lifecycle(type) {
      let work;
      handlers.get(type)({
        waitUntil: (promise) => {
          work = promise;
        },
      });
      return work;
    },
    async request(path, mode = 'cors') {
      let response;
      handlers.get('fetch')({
        request: { url: url(path), method: 'GET', mode },
        respondWith: (promise) => {
          response = promise;
        },
      });
      return response;
    },
  };
}

test('failed staging keeps previously complete offline shell and assets', async () => {
  const h = harness({ failAsset: true });
  const old = await h.caches.open('liftory-shell-old');
  await old.put('/', new Response('previous complete shell'));
  await old.put('/_next/static/old.js', new Response('previous asset'));
  await assert.rejects(h.lifecycle('install'));
  assert.equal(await (await old.match('/')).text(), 'previous complete shell');
  assert.equal(await (await old.match('/_next/static/old.js')).text(), 'previous asset');
  assert.deepEqual(await h.caches.keys(), ['liftory-shell-old']);
});

test('successful install publishes assets before shell and preserves the previous build', async () => {
  const h = harness();
  const old = await h.caches.open('liftory-shell-old');
  await old.put('/', new Response('previous complete shell'));
  await h.lifecycle('install');
  const published = await h.caches.open(target);
  const keys = (await published.keys()).map((request) => new URL(request.url).pathname);
  assert.equal(keys.at(-1), '/');
  assert.ok(keys.includes('/_next/static/app.js'));
  assert.ok(keys.includes('/_next/static/app.css'));
  assert.ok(!(await h.caches.keys()).some((name) => name.endsWith(':staging')));
  await h.lifecycle('activate');
  assert.deepEqual(await h.caches.keys(), ['liftory-shell-old', target]);
});

test('activation retains a complete previous shell over an interrupted partial publication', async () => {
  const h = harness();
  const old = await h.caches.open('liftory-shell-old');
  await old.put('/', new Response('previous complete shell'));
  const partial = await h.caches.open('liftory-shell-interrupted');
  await partial.put('/_next/static/partial.js', new Response('partial asset'));
  await h.lifecycle('install');
  await h.lifecycle('activate');
  assert.deepEqual(await h.caches.keys(), ['liftory-shell-old', target]);
});

test('navigation never replaces a published shell with an unprepared newer build', async () => {
  const h = harness();
  await h.lifecycle('install');
  const published = await h.caches.open(target);
  const original = await (await published.match('/')).text();
  h.setHTML('<html>new version with missing assets</html>');
  assert.equal(
    await (await h.request('/', 'navigate')).text(),
    '<html>new version with missing assets</html>',
  );
  assert.equal(await (await published.match('/')).text(), original);
  h.setOffline();
  assert.equal(await (await h.request('/', 'navigate')).text(), original);
});

test('auth, API and foreign-origin requests never enter a public cache', async () => {
  const h = harness();
  await h.lifecycle('install');
  for (const path of [
    '/api/session',
    '/api/auth/get-session',
    '/api/records',
    'https://other.test/_next/static/app.js',
  ])
    assert.equal(await h.request(path), undefined);
});

test('a mismatched HTML build cannot become the offline shell', async () => {
  const h = harness();
  h.setHTML(
    '<html><body data-shell-version="old"><script src="/_next/static/old.js"></script></body></html>',
  );
  await assert.rejects(h.lifecycle('install'));
  assert.deepEqual(await h.caches.keys(), []);
});

test('worker generation is stable and versions app and shared contract changes', (t) => {
  const base = mkdtempSync(join(tmpdir(), 'liftory-worker-'));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const root = join(base, 'apps/web');
  for (const folder of [
    'app',
    'public',
    'pwa',
    'scripts',
    '../../packages/contracts/src',
    '../../packages/offline/src',
  ])
    mkdirSync(resolve(root, folder), { recursive: true });
  writeFileSync(join(root, 'pwa/sw.template.js'), source);
  writeFileSync(join(root, 'app/page.tsx'), 'initial');
  writeFileSync(join(root, 'next.config.ts'), 'config');
  writeFileSync(join(root, 'package.json'), '{}');
  const first = prepareServiceWorker(root, 'commit1');
  assert.equal(prepareServiceWorker(root, 'commit1'), first);
  writeFileSync(join(root, 'app/page.tsx'), 'changed');
  const second = prepareServiceWorker(root, 'commit1');
  assert.notEqual(second, first);
  writeFileSync(resolve(root, '../../packages/contracts/src/index.ts'), 'new contract');
  assert.notEqual(prepareServiceWorker(root, 'commit1'), second);
  assert.ok(readFileSync(join(root, 'public/sw.js'), 'utf8').includes('const VERSION = '));
  assert.notEqual(prepareServiceWorker(root, 'commit2'), second);
});
