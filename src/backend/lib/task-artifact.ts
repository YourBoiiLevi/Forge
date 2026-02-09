export type TaskStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'DONE'
  | 'MERGE_READY'
  | 'MERGED'
  | 'FAILED'
  | 'STALE';

export type TaskType = 1 | 2 | 3 | 'refinery';

export interface TaskArtifactFrontmatter {
  id?: string;
  title: string;
  type: TaskType;
  dependencies: string[];
  branch?: string | null;
  attemptId?: string | null;
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

  // Only parse integers; task schemas use integers for `type`.
  if (/^-?\d+$/.test(v)) return Number(v);

  return stripQuotes(v);
}

/**
 * Minimal YAML frontmatter parser for Forge task artifacts.
 *
 * Supports:
 * - top-of-file `---` ... `---` blocks
 * - `key: value` scalars (string/number/bool/null)
 * - `key:` followed by `- item` array entries (array of scalars)
 *
 * Intentionally does NOT implement full YAML.
 */
export function parseTaskArtifactFrontmatter(markdown: string): TaskArtifactFrontmatter {
  const src = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (!src.startsWith('---\n') && src.trimStart() !== src) {
    // If the file has leading whitespace, treat it as no frontmatter.
    throw new Error('Task artifact must start with YAML frontmatter');
  }

  const lines = src.split('\n');
  if (lines[0] !== '---') {
    throw new Error('Task artifact must start with YAML frontmatter');
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
  const kv: Record<string, unknown> = {};

  for (let i = 0; i < frontmatterLines.length; i += 1) {
    const line = frontmatterLines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;

    const mKeyOnly = /^([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (mKeyOnly) {
      const key = mKeyOnly[1];
      const arr: Array<string | number | boolean | null> = [];

      // Consume subsequent `- item` lines.
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
    const key = m[1];
    const rawVal = m[2];
    kv[key] = parseScalar(rawVal);
  }

  const title = kv.title;
  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('Task frontmatter must include non-empty title');
  }

  const type = kv.type;
  const parsedType: TaskType =
    type === 'refinery' || type === 'Refinery'
      ? 'refinery'
      : type === 1 || type === 2 || type === 3
        ? type
        : typeof type === 'string' && /^(1|2|3)$/.test(type)
          ? (Number(type) as 1 | 2 | 3)
          : (() => {
              throw new Error('Task frontmatter must include a valid type');
            })();

  const depsRaw = kv.dependencies;
  const dependencies: string[] = Array.isArray(depsRaw)
    ? depsRaw
        .filter((d) => typeof d === 'string')
        .map((d) => d.trim())
        .filter(Boolean)
    : [];

  const branch = kv.branch;
  const attemptId = kv.attemptId;

  return {
    id: typeof kv.id === 'string' ? kv.id : undefined,
    title: title.trim(),
    type: parsedType,
    dependencies,
    branch: typeof branch === 'string' ? branch : branch === null ? null : undefined,
    attemptId: typeof attemptId === 'string' ? attemptId : attemptId === null ? null : undefined,
  };
}
