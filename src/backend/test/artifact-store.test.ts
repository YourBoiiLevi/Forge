import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ArtifactStore, atomicWriteFile } from '../lib/artifact-store';

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'forge-artifacts-'));
}

describe('artifact-store', () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      tmpDirs.splice(0, tmpDirs.length).map(async (dir) => fs.rm(dir, { recursive: true, force: true })),
    );
  });

  it('creates the run directory structure', async () => {
    const baseDir = await makeTempDir();
    tmpDirs.push(baseDir);
    const store = new ArtifactStore({ baseDir });

    await store.ensureRunInitialized('run-001');

    await expect(fs.stat(path.join(baseDir, 'run-001'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(baseDir, 'run-001', 'specs'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(baseDir, 'run-001', 'tasks'))).resolves.toBeTruthy();
    await expect(fs.stat(path.join(baseDir, 'run-001', 'change-requests'))).resolves.toBeTruthy();
  });

  it('writes atomically (readers see old or new, never partial)', async () => {
    const baseDir = await makeTempDir();
    tmpDirs.push(baseDir);
    const destPath = path.join(baseDir, 'file.txt');

    await fs.writeFile(destPath, 'old', 'utf8');

    await atomicWriteFile(destPath, 'new', {
      hooks: {
        beforeRename: async ({ tmpPath }) => {
          // While the tmp file exists (fully written), the destination should still be the old content.
          await expect(fs.stat(tmpPath)).resolves.toBeTruthy();

          const reads = await Promise.all(
            Array.from({ length: 25 }, async () => fs.readFile(destPath, 'utf8')),
          );
          for (const v of reads) {
            expect(v).toBe('old');
          }
        },
      },
    });

    await expect(fs.readFile(destPath, 'utf8')).resolves.toBe('new');
  });

  it('reads/writes run-scoped artifacts and prevents path traversal', async () => {
    const baseDir = await makeTempDir();
    tmpDirs.push(baseDir);
    const store = new ArtifactStore({ baseDir });

    await store.writeText('run-123', 'specs/architecture.md', '# Arch\n');
    await expect(store.readText('run-123', 'specs/architecture.md')).resolves.toBe('# Arch\n');
    await expect(store.exists('run-123', 'specs/architecture.md')).resolves.toBe(true);
    await expect(store.exists('run-123', 'specs/missing.md')).resolves.toBe(false);

    await store.writeRunState('run-123', { runId: 'run-123', status: 'planning' });
    await expect(store.readRunState<{ runId: string; status: string }>('run-123')).resolves.toEqual({
      runId: 'run-123',
      status: 'planning',
    });

    await store.writeDag('run-123', { nodes: [] });
    await expect(store.readDag<{ nodes: unknown[] }>('run-123')).resolves.toEqual({ nodes: [] });

    await store.writeDagStatus('run-123', { runId: 'run-123', nodes: {} });
    await expect(store.readDagStatus<{ runId: string; nodes: Record<string, unknown> }>('run-123'))
      .resolves.toEqual({ runId: 'run-123', nodes: {} });

    await store.writeWalkthrough('run-123', 'task-001', 'attempt-1', '---\n---\n\n# Summary\n');
    await expect(store.readWalkthrough('run-123', 'task-001', 'attempt-1')).resolves.toContain(
      '# Summary',
    );

    expect(() => store.resolveRunArtifactPath('run-123', '../escape.txt')).toThrow(/segments/);
    expect(() => store.resolveRunArtifactPath('run-123', '/absolute.txt')).toThrow(/relative/);
    expect(() => store.resolveRunArtifactPath('run-123', 'tasks/../x.md')).toThrow(/segments/);
  });
});
