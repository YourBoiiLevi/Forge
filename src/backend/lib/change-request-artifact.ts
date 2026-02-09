export type ChangeRequestStatus = 'pending' | 'approved' | 'rejected' | 'applied';

export interface ChangeRequestArtifactFrontmatter {
  id: string;
  title: string;
  emitted_by: string;
  emitted_at: string;
  status: ChangeRequestStatus;
  reason: string;
  affected_tasks: string[];
}

function stripQuotes(value: string): string {
  const v = value.trim();
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return v.slice(1, -1);
    }
  }
  return v;
}

function parseScalar(raw: string): string | number | boolean | null {
  const v = raw.trim();
  if (v === '' || v === 'null' || v === '~') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  return stripQuotes(v);
}

type FrontmatterBlock = {
  src: string;
  lines: string[];
  endIdx: number;
  frontmatterLines: string[];
};

function readFrontmatterBlock(markdown: string): FrontmatterBlock {
  const src = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!src.startsWith('---\n') && src.trimStart() !== src) {
    throw new Error('Change request artifact must start with YAML frontmatter');
  }

  const lines = src.split('\n');
  if (lines[0] !== '---') {
    throw new Error('Change request artifact must start with YAML frontmatter');
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i] === '---' || lines[i] === '...') {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    throw new Error('Unterminated YAML frontmatter');
  }

  const frontmatterLines = lines.slice(1, endIdx);
  return { src, lines, endIdx, frontmatterLines };
}

/**
 * Minimal YAML frontmatter parser for Forge change request artifacts.
 *
 * Supports the subset used in specs/08-artifact-schemas.md:
 * - top-of-file `---` ... `---` blocks
 * - `key: value` scalars (string/number/bool/null)
 * - `key:` followed by `- item` array entries (array of scalars)
 *
 * Intentionally does NOT implement full YAML (e.g. block scalars like `|`).
 */
export function parseChangeRequestArtifactFrontmatter(markdown: string): ChangeRequestArtifactFrontmatter {
  const { frontmatterLines } = readFrontmatterBlock(markdown);
  const kv: Record<string, unknown> = {};

  for (let i = 0; i < frontmatterLines.length; i += 1) {
    const line = frontmatterLines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    const mKeyOnly = /^([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (mKeyOnly) {
      const key = mKeyOnly[1];
      const arr: Array<string | number | boolean | null> = [];

      let j = i + 1;
      while (j < frontmatterLines.length) {
        const next = frontmatterLines[j];
        const mItem = /^\s*-\s*(.*)$/.exec(next);
        if (!mItem) break;
        arr.push(parseScalar(mItem[1]));
        j += 1;
      }

      kv[key] = arr;
      i = j - 1;
      continue;
    }

    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    kv[m[1]] = parseScalar(m[2]);
  }

  function reqString(key: string): string {
    const v = kv[key];
    if (typeof v !== 'string' || !v.trim()) {
      throw new Error(`Change request frontmatter must include non-empty ${key}`);
    }
    return v.trim();
  }

  const statusRaw = reqString('status');
  const status: ChangeRequestStatus =
    statusRaw === 'pending' || statusRaw === 'approved' || statusRaw === 'rejected' || statusRaw === 'applied'
      ? statusRaw
      : (() => {
          throw new Error('Change request frontmatter must include a valid status');
        })();

  const affectedRaw = kv.affected_tasks;
  const affected_tasks: string[] = Array.isArray(affectedRaw)
    ? affectedRaw
        .filter((t) => typeof t === 'string')
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  return {
    id: reqString('id'),
    title: reqString('title'),
    emitted_by: reqString('emitted_by'),
    emitted_at: reqString('emitted_at'),
    status,
    reason: reqString('reason'),
    affected_tasks,
  };
}

export function setYamlFrontmatterScalar(markdown: string, key: string, value: string): string {
  const { lines, endIdx } = readFrontmatterBlock(markdown);
  const needle = new RegExp(`^${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*.*$`);

  let replaced = false;
  for (let i = 1; i < endIdx; i += 1) {
    if (needle.test(lines[i])) {
      lines[i] = `${key}: ${value}`;
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    lines.splice(endIdx, 0, `${key}: ${value}`);
  }

  return lines.join('\n');
}
