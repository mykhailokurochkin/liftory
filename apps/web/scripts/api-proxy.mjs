import { lookup as systemLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

const hopByHop = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

export function readApiProxyConfig(env = process.env) {
  if (env.VERCEL === '1' && !env.API_INTERNAL_URL)
    throw new Error('Vercel requires an explicit HTTPS API_INTERNAL_URL.');
  const origin = new URL(env.API_INTERNAL_URL ?? 'http://127.0.0.1:3301');
  if (
    !['http:', 'https:'].includes(origin.protocol) ||
    (env.VERCEL === '1' && origin.protocol !== 'https:') ||
    origin.username ||
    origin.password ||
    origin.pathname !== '/' ||
    origin.search ||
    origin.hash
  )
    throw new Error('Invalid API origin.');
  const fallbackIPs = (env.API_DNS_FALLBACK_IPS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    fallbackIPs.length > 4 ||
    fallbackIPs.some((address) => !isIP(address)) ||
    (fallbackIPs.length && (origin.protocol !== 'https:' || !origin.hostname.endsWith('.ts.net')))
  )
    throw new Error('DNS fallback requires explicit IP addresses and an HTTPS Tailscale API.');
  return { origin, fallbackIPs };
}

export function createApiLookup(config, lookup = systemLookup) {
  return (hostname, options, callback) => {
    lookup(hostname, options, (error, ...result) => {
      if (
        !error ||
        !['ENOTFOUND', 'EAI_AGAIN'].includes(error.code) ||
        hostname !== config.origin.hostname ||
        !config.fallbackIPs.length
      ) {
        callback(error, ...result);
        return;
      }
      const family = typeof options === 'number' ? options : options?.family;
      const addresses = config.fallbackIPs
        .map((address) => ({ address, family: isIP(address) }))
        .filter((entry) => !family || family === entry.family);
      if (!addresses.length) callback(error);
      else if (options?.all) callback(null, addresses);
      else callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

function blockedHeaders(connection) {
  return new Set([
    ...hopByHop,
    ...(connection ?? '').split(',').map((name) => name.trim().toLowerCase()),
  ]);
}

function privateHeaders(headers = new Headers()) {
  headers.set('cache-control', 'private, no-store');
  headers.set('cdn-cache-control', 'no-store');
  headers.set('vercel-cdn-cache-control', 'no-store');
  return headers;
}

async function readBody(request, signal, maximum) {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const cancel = () => void reader.cancel().catch(() => {});
  signal.addEventListener('abort', cancel, { once: true });
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) {
        cancel();
        throw new RangeError('Request body exceeds the proxy limit.');
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks, bytes);
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}

export async function proxyApiRequest(request, options = {}) {
  try {
    const config = readApiProxyConfig(options.env);
    const incoming = new URL(request.url);
    if (!incoming.pathname.startsWith('/api/'))
      return new Response(null, { status: 404, headers: privateHeaders() });
    const target = new URL(config.origin.origin + incoming.pathname + incoming.search);
    const signal = AbortSignal.any([
      request.signal,
      AbortSignal.timeout(options.timeoutMs ?? 25_000),
    ]);
    const body = await readBody(request, signal, options.maxBodyBytes ?? 4 * 1024 * 1024);
    signal.throwIfAborted();
    const blocked = blockedHeaders(request.headers.get('connection'));
    const headers = {};
    for (const [name, value] of request.headers)
      if (!blocked.has(name) && name !== 'host' && name !== 'content-length') headers[name] = value;
    headers.host = config.origin.host;
    headers['x-forwarded-host'] = incoming.host;
    headers['x-forwarded-proto'] = incoming.protocol.slice(0, -1);
    if (body !== null) headers['content-length'] = String(body.byteLength);
    const transport = config.origin.protocol === 'https:' ? https : http;
    return await new Promise((resolve, reject) => {
      const upstream = transport.request(
        target,
        {
          method: request.method,
          headers,
          signal,
          agent: false,
          lookup: createApiLookup(config),
          autoSelectFamily: true,
          autoSelectFamilyAttemptTimeout: 250,
          ...(config.origin.protocol === 'https:' ? { servername: config.origin.hostname } : {}),
        },
        (response) => {
          const output = new Headers();
          const removed = blockedHeaders(response.headers.connection);
          for (let index = 0; index < response.rawHeaders.length; index += 2) {
            const name = response.rawHeaders[index];
            if (!removed.has(name.toLowerCase()))
              output.append(name, response.rawHeaders[index + 1]);
          }
          privateHeaders(output);
          const status = response.statusCode ?? 502;
          const noBody = request.method === 'HEAD' || [204, 205, 304].includes(status);
          if (noBody) response.resume();
          resolve(
            new Response(noBody ? null : Readable.toWeb(response), {
              status,
              headers: output,
            }),
          );
        },
      );
      upstream.once('error', reject);
      upstream.end(body);
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof RangeError
            ? 'Request body is too large.'
            : 'The API is temporarily unavailable.',
      },
      { status: error instanceof RangeError ? 413 : 502, headers: privateHeaders() },
    );
  }
}
