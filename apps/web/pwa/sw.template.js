const VERSION = '__LIFTORY_SHELL_VERSION__';
const PREFIX = 'liftory-shell-';
const CACHE = PREFIX + VERSION;
const STAGING = CACHE + ':staging';
const STATIC = [
  '/manifest.webmanifest',
  '/icon.svg',
  '/apple-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

async function installShell() {
  await caches.delete(STAGING);
  const staging = await caches.open(STAGING);
  try {
    const shell = await fetch('/', { cache: 'no-store', credentials: 'omit' });
    if (!shell.ok || !shell.headers.get('Content-Type')?.includes('text/html'))
      throw new Error('Shell is not available.');
    const html = await shell.clone().text();
    if (!html.includes('data-shell-version="' + VERSION + '"'))
      throw new Error('Shell and worker builds differ.');
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1].replaceAll('&amp;', '&'))
      .filter((path) => path.startsWith('/_next/static/'));
    if (!assets.length) throw new Error('The application shell has no static assets.');
    for (const path of [...new Set([...STATIC, ...assets])]) {
      const response = await fetch(path, { cache: 'reload', credentials: 'omit' });
      if (!response.ok) throw new Error('A shell asset is unavailable.');
      await staging.put(path, response);
    }
    await staging.put('/', shell);

    // This cache belongs to a new content-derived build, never the active old worker.
    await caches.delete(CACHE);
    const published = await caches.open(CACHE);
    for (const request of await staging.keys()) {
      if (new URL(request.url).pathname !== '/')
        await published.put(request, await staging.match(request));
    }
    await published.put('/', await staging.match('/'));
    await caches.delete(STAGING);
  } catch (error) {
    await caches.delete(STAGING);
    await caches.delete(CACHE);
    throw error;
  }
}

self.addEventListener('install', (event) => event.waitUntil(installShell()));
self.addEventListener('activate', (event) =>
  event.waitUntil(
    (async () => {
      const names = (await caches.keys()).filter(
        (name) => name.startsWith(PREFIX) && !name.endsWith(':staging'),
      );
      const complete = [];
      for (const name of names) {
        if (await (await caches.open(name)).match('/')) complete.push(name);
      }
      const previous = complete.filter((name) => name !== CACHE).at(-1);
      await Promise.all(
        names
          .filter((name) => name !== CACHE && name !== previous)
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener('message', (event) => {
  if (event.data?.type === 'ACTIVATE_UPDATE') void self.skipWaiting();
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return;
  if (request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          return (await (await caches.open(CACHE)).match('/')) ?? Response.error();
        }
      })(),
    );
  } else if (url.pathname.startsWith('/_next/static/') || STATIC.includes(url.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = (await cache.match(request)) ?? (await caches.match(request));
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});
