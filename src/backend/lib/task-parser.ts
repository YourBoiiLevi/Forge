import Ajv from 'ajv';
import { Type, type Static } from '@sinclair/typebox';

import type { TaskStatus, TaskType } from './task-artifact';

export type TaskEstimatedComplexity = 'small' | 'medium' | 'large';

export type TaskDocumentFrontmatter = {
  id: string;
  title: string;
  type: TaskType;
  dependencies: string[];
  acceptance_criteria: string[];
  estimated_complexity: TaskEstimatedComplexity;
  status: TaskStatus;
  branch: string | null;
  attemptId: string | null;
  // Allow Captain/Executor extensions.
  [k: string]: unknown;
};

export type ParsedTaskDocument = {
  frontmatter: TaskDocumentFrontmatter;
  /** Markdown body after YAML frontmatter, with newlines normalized to `\n`. */
  body: string;
};

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
    throw new Error('Task document must start with YAML frontmatter');
  }

  const lines = src.split('\n');
  if (lines[0] !== '---') {
    throw new Error('Task document must start with YAML frontmatter');
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

function parseYamlFrontmatter(frontmatterLines: string[]): Record<string, unknown> {
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

  return kv;
}

const TaskFrontmatterSchema = Type.Object(
  {
    id: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1 }),
    type: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3), Type.Literal('refinery')]),
    dependencies: Type.Array(Type.String({ minLength: 1 })),
    acceptance_criteria: Type.Array(Type.String({ minLength: 1 })),
    estimated_complexity: Type.Union([Type.Literal('small'), Type.Literal('medium'), Type.Literal('large')]),
    status: Type.Union([
      Type.Literal('PENDING'),
      Type.Literal('RUNNING'),
      Type.Literal('DONE'),
      Type.Literal('MERGE_READY'),
      Type.Literal('MERGED'),
      Type.Literal('FAILED'),
      Type.Literal('STALE'),
    ]),
    branch: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    attemptId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
  },
  { additionalProperties: true },
);

type TaskFrontmatterSchemaType = Static<typeof TaskFrontmatterSchema>;

const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
const validateTaskFrontmatter = ajv.compile(TaskFrontmatterSchema);

function formatAjvErrors(errors: NonNullable<typeof validateTaskFrontmatter.errors>): string {
  return errors
    .map((e) => {
      const where = e.instancePath ? e.instancePath : e.params && 'missingProperty' in e.params ? '' : '';
      const msg = e.message ?? 'invalid';
      if (e.keyword === 'required' && typeof (e.params as { missingProperty?: unknown }).missingProperty === 'string') {
        return `missing required field ${(e.params as { missingProperty: string }).missingProperty}`;
      }
      if (where) return `${where}: ${msg}`;
      return msg;
    })
    .join('; ');
}

function normalizeFrontmatter(fm: TaskFrontmatterSchemaType): TaskDocumentFrontmatter {
  return {
    ...fm,
    id: fm.id.trim(),
    title: fm.title.trim(),
    dependencies: fm.dependencies.map((d) => d.trim()).filter(Boolean),
    acceptance_criteria: fm.acceptance_criteria.map((c) => c.trim()).filter(Boolean),
    branch: fm.branch === null ? null : fm.branch.trim(),
    attemptId: fm.attemptId === null ? null : fm.attemptId.trim(),
  };
}

function assertBodyHasRequiredSections(body: string): void {
  const required = ['## Description', '## Context', '## Instructions'];
  for (const heading of required) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`(^|\\n)${escaped}\\s*(\\n|$)`).test(body)) {
      throw new Error(`Task body must include a ${heading} section`);
    }
  }
}

/**
 * Parse a Forge task markdown document per specs/07-task-dag.md.
 *
 * - Validates YAML frontmatter against the task schema subset.
 * - Preserves the markdown body (with CRLF normalized to LF).
 */
export function parseTaskDocument(markdown: string): ParsedTaskDocument {
  const { lines, endIdx, frontmatterLines } = readFrontmatterBlock(markdown);
  const raw = parseYamlFrontmatter(frontmatterLines);

  if (!validateTaskFrontmatter(raw)) {
    const msg = validateTaskFrontmatter.errors ? formatAjvErrors(validateTaskFrontmatter.errors) : 'invalid';
    throw new Error(`Invalid task frontmatter: ${msg}`);
  }

  const frontmatter = normalizeFrontmatter(raw as TaskFrontmatterSchemaType);
  const body = lines.slice(endIdx + 1).join('\n');

  assertBodyHasRequiredSections(body);

  return { frontmatter, body };
}
