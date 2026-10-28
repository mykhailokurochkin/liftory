import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';
import { applyBackend, verifyBackend } from './backend.mjs';
import {
  deliveryPaths,
  deliveryStatus,
  deliveryTick,
  enableDelivery,
  pauseDelivery,
  recordDeliveryError,
  repository,
} from './delivery-core.mjs';

const execute = promisify(execFile);

async function command(binary, args, binaryOutput = false) {
  const result = await execute(binary, args, {
    encoding: binaryOutput ? 'buffer' : 'utf8',
    maxBuffer: binaryOutput ? 262144 : 1048576,
    timeout: 30000,
  });
  return result.stdout;
}

const api = async (path) => JSON.parse(await command('gh', ['api', `repos/${repository}/${path}`]));

export async function inspectDevBackend() {
  const ids = (
    await command('docker', [
      'ps',
      '--all',
      '--quiet',
      '--filter',
      'label=com.docker.compose.project=personal-liftory-dev',
      '--filter',
      'label=com.docker.compose.service=api',
      '--filter',
      'label=com.docker.compose.oneoff=False',
    ])
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (ids.length !== 1 || !/^[a-f0-9]{12,64}$/.test(ids[0] ?? '')) return null;
  const template =
    '{"id":{{json .Id}},"image":{{json .Config.Image}},"running":{{json .State.Running}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}';
  return JSON.parse(await command('docker', ['inspect', '--format', template, ids[0]]));
}

async function readArtifact(paths, artifact) {
  if (
    !Number.isSafeInteger(artifact.id) ||
    artifact.id < 1 ||
    !Number.isSafeInteger(artifact.size_in_bytes) ||
    artifact.size_in_bytes < 1 ||
    artifact.size_in_bytes > 262144
  )
    throw new Error('Unexpected backend artifact metadata.');
  const directory = mkdtempSync(join(paths.directory, 'candidate-'));
  try {
    const archive = join(directory, 'release.zip');
    writeFileSync(
      archive,
      await command(
        'gh',
        ['api', `repos/${repository}/actions/artifacts/${artifact.id}/zip`],
        true,
      ),
      { mode: 0o600, flag: 'wx' },
    );
    const names = (await command('/usr/bin/unzip', ['-Z1', archive])).trim().split('\n');
    if (names.length !== 1 || names[0] !== 'backend-release.json')
      throw new Error('Unexpected files in backend artifact.');
    const text = await command('/usr/bin/unzip', ['-p', archive, 'backend-release.json']);
    if (Buffer.byteLength(text) > 16384) throw new Error('Backend artifact is too large.');
    return JSON.parse(text);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function liveDeliveryAdapter(paths, { request = api, loadArtifact = readArtifact } = {}) {
  return {
    inspect: inspectDevBackend,
    verify: verifyBackend,
    apply: applyBackend,
    async branchHead() {
      return (await request('git/ref/heads/develop')).object?.sha;
    },
    async candidate(commit) {
      const [releaseWorkflow, ciWorkflow, listing] = await Promise.all([
        request('actions/workflows/release.yml'),
        request('actions/workflows/ci.yml'),
        request('actions/workflows/release.yml/runs?event=workflow_run&status=success&per_page=10'),
      ]);
      if (
        releaseWorkflow.path !== '.github/workflows/release.yml' ||
        ciWorkflow.path !== '.github/workflows/ci.yml'
      )
        throw new Error('Unexpected workflow identity.');
      for (const release of listing.workflow_runs ?? []) {
        if (!Number.isSafeInteger(release.id) || release.id < 1) continue;
        const listing = await request(`actions/runs/${release.id}/artifacts?per_page=100`);
        const artifacts = (listing.artifacts ?? []).filter(
          (artifact) => !artifact.expired && artifact.name === `liftory-backend-${commit}`,
        );
        if (!artifacts.length) continue;
        if (artifacts.length !== 1) throw new Error('Ambiguous backend release artifacts.');
        const candidate = await loadArtifact(paths, artifacts[0]);
        if (candidate?.branch === 'main') continue;
        if (!/^[1-9][0-9]*$/.test(candidate.verifiedRunId))
          throw new Error('Invalid verified run ID.');
        const ci = await request(`actions/runs/${candidate.verifiedRunId}`);
        return {
          candidate,
          release,
          ci,
          releaseWorkflowId: releaseWorkflow.id,
          ciWorkflowId: ciWorkflow.id,
        };
      }
      return null;
    },
  };
}

async function main() {
  const { positionals } = parseArgs({ allowPositionals: true });
  if (positionals.length !== 1 || !['tick', 'status', 'enable', 'pause'].includes(positionals[0]))
    throw new Error('Use delivery.mjs tick|status|enable|pause; automatic delivery is dev-only.');
  const paths = deliveryPaths(homedir());
  const adapter = liveDeliveryAdapter(paths);
  const [action] = positionals;
  const result =
    action === 'status'
      ? deliveryStatus(paths)
      : action === 'pause'
        ? pauseDelivery(paths)
        : action === 'enable'
          ? await enableDelivery(paths, adapter)
          : await deliveryTick(paths, adapter);
  console.log(JSON.stringify({ event: 'liftory_delivery', ...result }));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(() => {
    try {
      recordDeliveryError(deliveryPaths(homedir()));
    } catch {
      // Keep failures private when the state directory itself is unavailable.
    }
    console.error(
      JSON.stringify({
        event: 'liftory_delivery_failed',
        message: 'Check private state, GitHub access, Docker and backend readiness.',
      }),
    );
    process.exitCode = 1;
  });
}
