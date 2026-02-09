import { describe, expect, it } from 'vitest';

import type { Tool, ToolCall } from 'forge-ai';
import { Type, validateToolArguments, validateToolCall } from 'forge-ai';

describe('forge-ai tool validation', () => {
	it('validates tool arguments via TypeBox (happy path)', () => {
		const tool: Tool = {
			name: 'add',
			description: 'Add two numbers',
			parameters: Type.Object({ a: Type.Number(), b: Type.Number() }),
		};

		const toolCall: ToolCall = {
			type: 'toolCall',
			id: 'call_1',
			name: 'add',
			arguments: { a: 1, b: 2 },
		};

		const args = validateToolArguments(tool, toolCall);
		expect(args).toEqual({ a: 1, b: 2 });

		const args2 = validateToolCall([tool], toolCall);
		expect(args2).toEqual({ a: 1, b: 2 });
	});

	it('throws a useful error when validation fails', () => {
		const tool: Tool = {
			name: 'add',
			description: 'Add two numbers',
			parameters: Type.Object({ a: Type.Number(), b: Type.Number() }),
		};

		const badToolCall: ToolCall = {
			type: 'toolCall',
			id: 'call_2',
			name: 'add',
			arguments: { a: 'nope', b: 2 },
		};

		expect(() => validateToolArguments(tool, badToolCall)).toThrow(/a/i);
	});
});
