import { describe, expect, it } from 'vitest';

import { parseTaskDocument } from '../lib/task-parser';

function taskDoc(overrides?: Partial<{ body: string }>): string {
  const body =
    overrides?.body ??
    [
      '',
      '## Description',
      'Do the thing.',
      '',
      '## Context',
      'Some background.',
      '',
      '## Instructions',
      '1. Step one',
      '2. Step two',
      '',
    ].join('\n');

  return [
    '---',
    'id: task-001',
    'title: "Implement user authentication API"',
    'type: 2',
    'dependencies:',
    '  - task-000',
    'acceptance_criteria:',
    '  - "POST /api/auth/register creates a new user"',
    '  - "Invalid credentials return 401"',
    'estimated_complexity: medium',
    'status: PENDING',
    'branch: null',
    'attemptId: null',
    '---',
    body,
  ].join('\n');
}

describe('task-parser (Task 3.2)', () => {
  it('parses valid task markdown and preserves the markdown body', () => {
    const src = taskDoc();
    const parsed = parseTaskDocument(src);

    expect(parsed.frontmatter).toMatchObject({
      id: 'task-001',
      title: 'Implement user authentication API',
      type: 2,
      dependencies: ['task-000'],
      acceptance_criteria: ['POST /api/auth/register creates a new user', 'Invalid credentials return 401'],
      estimated_complexity: 'medium',
      status: 'PENDING',
      branch: null,
      attemptId: null,
    });

    // Body includes everything after the closing frontmatter delimiter.
    expect(parsed.body).toContain('## Description');
    expect(parsed.body).toContain('## Context');
    expect(parsed.body).toContain('## Instructions');
    expect(parsed.body.endsWith('\n')).toBe(true);
  });

  it('rejects tasks with missing required frontmatter fields', () => {
    const bad = [
      '---',
      'id: task-001',
      'title: "x"',
      'type: 2',
      'dependencies:',
      // acceptance_criteria missing
      'estimated_complexity: small',
      'status: PENDING',
      'branch: null',
      'attemptId: null',
      '---',
      '',
      '## Description',
      'x',
      '',
      '## Context',
      'x',
      '',
      '## Instructions',
      'x',
      '',
    ].join('\n');

    expect(() => parseTaskDocument(bad)).toThrow(/Invalid task frontmatter/i);
    expect(() => parseTaskDocument(bad)).toThrow(/acceptance_criteria|missing required field/i);
  });

  it('rejects tasks whose body is missing required sections', () => {
    const src = taskDoc({
      body: ['','## Description','x',''].join('\n'),
    });

    expect(() => parseTaskDocument(src)).toThrow(/must include a ## Context section/i);
  });
});
