import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { validateBackendConfig, withBackendLock } from './backend.mjs';

export const repository = 'mykhailokurochkin/liftory';
const imagePattern = /^ghcr\.io\/mykhailokurochkin\/liftory-api@sha256:[a-f0-9]{64}$/;
const commitPattern = /^[a-f0-9]{40}$/;
const hash = (value) => createHash('sha256').update(value).digest('hex');

export function deliveryPaths(base) {
  const directory = join(base, '.local/share/liftory/delivery-dev');
  return {
    directory,
    control: join(directory, 'control.json'),
    state: join(directory, 'state.json'),
    error: join(directory, 'last-error.json'),
    lock: join(directory, 'operation.lock'),
    config: join(base, '.config/liftory/dev.env'),
  };
}

function assertPrivate(path, directory = false) {
  const stat = lstatSync(path);
  if (
    stat.isSymbolicLink() ||
    (directory ? !stat.isDirectory() : !stat.isFile()) ||
    (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw new Error('Delivery files must be private and owned by the current user.');
}

export function atomicPrivateWrite(path, text) {
  if (existsSync(path)) assertPrivate(path);
  const temporary = path + '.' + randomUUID() + '.tmp';
  const descriptor = openSync(temporary, 'wx', 0o600);
  try {
    try {
      writeFileSync(descriptor, text);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, path);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

const writeJson = (path, value) => atomicPrivateWrite(path, JSON.stringify(value) + '\n');

function readJson(path) {
  assertPrivate(path);
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (value?.schema !== 1) throw new Error('Unrecognized delivery state.');
  return value;
}

export function initializeDelivery(paths) {
  mkdirSync(paths.directory, { recursive: true, mode: 0o700 });
  assertPrivate(paths.directory, true);
  if (!existsSync(paths.control))
    writeJson(paths.control, { schema: 1, enabled: false, generation: randomUUID() });
  if (!existsSync(paths.state))
    writeJson(paths.state, { schema: 1, baseline: null, inFlight: null, attempts: null });
}

function controlAt(paths) {
  const control = readJson(paths.control);
  if (typeof control.enabled !== 'boolean' || typeof control.generation !== 'string')
    throw new Error('Invalid delivery control state.');
  return control;
}

export async function withDeliveryLock(paths, operation) {
  mkdirSync(paths.lock, { mode: 0o700 });
  try {
    return await operation();
  } finally {
    rmdirSync(paths.lock);
  }
}

function readConfig(paths) {
  assertPrivate(paths.config);
  const text = readFileSync(paths.config, 'utf8');
  return { text, values: validateBackendConfig(parseEnv(text), 'dev'), hash: hash(text) };
}

export function validateCandidate(candidate, source, expectedCommit) {
  const invalid = () => {
    throw new Error('Untrusted or stale backend release candidate.');
  };
  const expectedKeys = [
    'branch',
    'commit',
    'image',
    'platform',
    'repository',
    'schema',
    'verifiedRunId',
  ]
    .sort()
    .join(',');
  if (!candidate || Object.keys(candidate).sort().join(',') !== expectedKeys) invalid();
  if (
    !commitPattern.test(expectedCommit) ||
    candidate.schema !== 1 ||
    candidate.repository !== repository ||
    candidate.branch !== 'develop' ||
    candidate.commit !== expectedCommit ||
    candidate.platform !== 'linux/amd64' ||
    !imagePattern.test(candidate.image) ||
    !/^[1-9][0-9]*$/.test(candidate.verifiedRunId)
  )
    invalid();
  const { release, ci, releaseWorkflowId, ciWorkflowId } = source;
  if (
    !Number.isSafeInteger(releaseWorkflowId) ||
    releaseWorkflowId < 1 ||
    !Number.isSafeInteger(ciWorkflowId) ||
    ciWorkflowId < 1
  )
    invalid();
  for (const run of [release, ci]) {
    if (
      !run ||
      !Number.isSafeInteger(run.id) ||
      run.id < 1 ||
      run.repository?.full_name !== repository ||
      run.head_repository?.full_name !== repository ||
      run.status !== 'completed' ||
      run.conclusion !== 'success'
    )
      invalid();
  }
  if (
    release.event !== 'workflow_run' ||
    release.name !== 'Release backend' ||
    release.path !== '.github/workflows/release.yml' ||
    release.workflow_id !== releaseWorkflowId ||
    ci.event !== 'push' ||
    ci.name !== 'CI' ||
    ci.path !== '.github/workflows/ci.yml' ||
    ci.workflow_id !== ciWorkflowId ||
    ci.head_branch !== 'develop' ||
    ci.head_sha !== expectedCommit ||
    String(ci.id) !== candidate.verifiedRunId
  )
    invalid();
  return candidate;
}

export function replaceReleaseConfig(text, candidate) {
  if (!imagePattern.test(candidate.image) || !commitPattern.test(candidate.commit))
    throw new Error('Invalid backend release fields.');
  let result = text;
  for (const [key, value] of [
    ['LIFTORY_API_IMAGE', candidate.image],
    ['LIFTORY_API_COMMIT', candidate.commit],
  ]) {
    const expression = new RegExp(String.raw`^(?:export[ \t]+)?${key}[ \t]*=.*$`, 'gm');
    if ([...result.matchAll(expression)].length !== 1)
      throw new Error('Backend release fields must occur exactly once.');
    result = result.replace(expression, `${key}=${value}`);
  }
  validateBackendConfig(parseEnv(result), 'dev');
  return result;
}

export function baselineDecision(control, state, current, configHash) {
  if (!control.enabled) return 'paused';
  if (state.inFlight) return 'unknown_previous_operation';
  if (!state.baseline || state.baseline.generation !== control.generation) return 'needs_enable';
  if (!current || !current.running || current.health !== 'healthy') return 'stopped_or_unhealthy';
  if (
    current.id !== state.baseline.containerId ||
    current.image !== state.baseline.image ||
    configHash !== state.baseline.configHash
  )
    return 'manual_change';
  return 'ready';
}

export function pauseDelivery(paths) {
  initializeDelivery(paths);
  writeJson(paths.control, { schema: 1, enabled: false, generation: randomUUID() });
  return { status: 'paused' };
}

export async function enableDelivery(paths, adapter) {
  initializeDelivery(paths);
  return withDeliveryLock(paths, () =>
    withBackendLock(paths.config, async () => {
      const config = readConfig(paths);
      const current = await adapter.inspect();
      if (
        !current ||
        !current.running ||
        current.health !== 'healthy' ||
        current.image !== config.values.LIFTORY_API_IMAGE
      )
        throw new Error('Enable requires the manually verified healthy backend.');
      await adapter.verify(config.values);
      const generation = randomUUID();
      writeJson(paths.state, {
        schema: 1,
        baseline: {
          generation,
          configHash: config.hash,
          containerId: current.id,
          image: current.image,
          commit: config.values.LIFTORY_API_COMMIT,
        },
        inFlight: null,
        attempts: null,
        lastResult: 'enabled',
      });
      writeJson(paths.control, { schema: 1, enabled: true, generation });
      return { status: 'enabled' };
    }),
  );
}

export function deliveryStatus(paths) {
  initializeDelivery(paths);
  const control = controlAt(paths);
  const state = readJson(paths.state);
  return {
    enabled: control.enabled,
    lastResult: state.lastResult ?? 'not_run',
    commit: state.baseline?.commit ?? null,
    unknownOperation: Boolean(state.inFlight),
    attempts: state.attempts?.count ?? 0,
    lastError: existsSync(paths.error) ? readJson(paths.error) : null,
  };
}

export function recordDeliveryError(paths, now = Date.now()) {
  initializeDelivery(paths);
  writeJson(paths.error, { schema: 1, code: 'controller_failed', at: now });
}

export async function deliveryTick(paths, adapter, now = Date.now()) {
  initializeDelivery(paths);
  if (!controlAt(paths).enabled) return { status: 'paused' };
  try {
    return await withDeliveryLock(paths, async () => {
      const control = controlAt(paths);
      let state = readJson(paths.state);
      let commit = state.attempts?.commit ?? 'preflight';
      const finish = (status) => {
        state.lastResult = status;
        writeJson(paths.state, state);
        return { status };
      };
      try {
        if (!control.enabled) return finish('paused');
        if (state.attempts?.commit === 'preflight') {
          if (state.attempts.count >= 3) return finish('attempts_exhausted');
          if (state.attempts.retryAt > now) return finish('retry_later');
        }
        const config = readConfig(paths);
        const decision = baselineDecision(control, state, await adapter.inspect(), config.hash);
        if (decision !== 'ready') return finish(decision);
        if (state.attempts?.retryAt > now) return finish('retry_later');
        const branchCommit = await adapter.branchHead();
        if (!commitPattern.test(branchCommit)) throw new Error('Invalid branch head.');
        commit = branchCommit;
        if (state.attempts?.commit === commit) {
          if (state.attempts.count >= 3) return finish('attempts_exhausted');
        }
        const source = await adapter.candidate(commit);
        if (!source) return finish('no_verified_release');
        const candidate = validateCandidate(source.candidate, source, commit);
        if (
          candidate.image === config.values.LIFTORY_API_IMAGE &&
          commit === config.values.LIFTORY_API_COMMIT
        )
          return finish('already_current');
        return await withBackendLock(paths.config, async () => {
          const latestControl = controlAt(paths);
          if (!latestControl.enabled || latestControl.generation !== control.generation)
            return finish('paused_before_apply');
          const currentConfig = readConfig(paths);
          const lastDecision = baselineDecision(
            latestControl,
            state,
            await adapter.inspect(),
            currentConfig.hash,
          );
          if (lastDecision !== 'ready') return finish(lastDecision);
          if ((await adapter.branchHead()) !== commit) return finish('stale_release');
          const text = replaceReleaseConfig(currentConfig.text, candidate);
          state.attempts = {
            commit,
            count: state.attempts?.commit === commit ? state.attempts.count + 1 : 1,
            retryAt: now + 60000,
          };
          state.inFlight = { commit, image: candidate.image, startedAt: now };
          writeJson(paths.state, state);
          atomicPrivateWrite(paths.config, text);
          await adapter.apply(validateBackendConfig(parseEnv(text), 'dev'), paths.config);
          const current = await adapter.inspect();
          if (
            !current?.running ||
            current.health !== 'healthy' ||
            current.image !== candidate.image
          )
            throw new Error('Expected backend did not become healthy.');
          state.baseline = {
            generation: control.generation,
            configHash: hash(text),
            containerId: current.id,
            image: candidate.image,
            commit,
          };
          state.inFlight = null;
          state.attempts = null;
          return finish('applied');
        });
      } catch {
        if (state.inFlight) return finish('unknown_operation');
        const count = state.attempts?.commit === commit ? state.attempts.count + 1 : 1;
        state.attempts = {
          commit,
          count,
          retryAt: now + Math.min(900000, 60000 * 2 ** (count - 1)),
        };
        return finish('preflight_failed');
      }
    });
  } catch (error) {
    if (error.code === 'EEXIST') return { status: 'locked' };
    throw error;
  }
}
