import { describe, expect, it, vi } from 'vitest';

import type { AssistantMessageEvent, Context, Model } from 'forge-ai';

vi.mock('@anthropic-ai/sdk', () => {
	class Anthropic {
		messages = {
			stream: () => {
				return {
					async *[Symbol.asyncIterator]() {
						yield {
							type: 'message_start',
							message: {
								usage: {
									input_tokens: 3,
									output_tokens: 0,
									cache_read_input_tokens: 0,
									cache_creation_input_tokens: 0,
								},
							},
						};
						yield {
							type: 'content_block_start',
							index: 0,
							content_block: { type: 'text', text: '' },
						};
						yield {
							type: 'content_block_delta',
							index: 0,
							delta: { type: 'text_delta', text: 'Hello' },
						};
						yield { type: 'content_block_stop', index: 0 };
						yield {
							type: 'message_delta',
							delta: { stop_reason: 'end_turn' },
							usage: {
								input_tokens: 3,
								output_tokens: 1,
								cache_read_input_tokens: 0,
								cache_creation_input_tokens: 0,
							},
						};
					},
				};
			},
		};

		constructor(_opts: unknown) {}
	}

	return { default: Anthropic };
});

describe('forge-ai Anthropic Messages stream parsing', () => {
	it('emits text events and a final done message', async () => {
		const { getModels, streamAnthropic } = await import('forge-ai');
		const models = getModels('anthropic');
		expect(models.length).toBeGreaterThan(0);
		const model = models[0] as Model<'anthropic-messages'>;

		const context: Context = {
			systemPrompt: 'You are helpful.',
			messages: [],
			tools: [],
		};

		const stream = streamAnthropic(model, context, { apiKey: 'sk-ant-test' });

		const events: AssistantMessageEvent[] = [];
		for await (const event of stream) {
			events.push(event);
		}

		expect(events.some((e) => e.type === 'text_start')).toBe(true);
		expect(events.some((e) => e.type === 'text_delta' && e.delta === 'Hello')).toBe(true);

		const done = events.find((e) => e.type === 'done');
		expect(done).toBeDefined();
		if (!done || done.type !== 'done') {
			throw new Error('Expected a done event');
		}
		expect(done.message.content[0]).toMatchObject({ type: 'text', text: 'Hello' });
	});
});
