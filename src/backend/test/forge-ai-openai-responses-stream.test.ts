import { describe, expect, it, vi } from 'vitest';

import type { AssistantMessageEvent, Context, Model } from 'forge-ai';

vi.mock('openai', () => {
	class OpenAI {
		responses = {
			create: async () => {
				return {
					async *[Symbol.asyncIterator]() {
						yield {
							type: 'response.output_item.added',
							item: { type: 'message', id: 'msg_1', role: 'assistant', content: [], status: 'in_progress' },
						};
						yield {
							type: 'response.content_part.added',
							part: { type: 'output_text', text: '', annotations: [] },
						};
						yield { type: 'response.output_text.delta', delta: 'Hello' };
						yield {
							type: 'response.output_item.done',
							item: {
								type: 'message',
								id: 'msg_1',
								role: 'assistant',
								status: 'completed',
								content: [{ type: 'output_text', text: 'Hello', annotations: [] }],
							},
						};
						yield {
							type: 'response.completed',
							response: {
								status: 'completed',
								usage: {
									input_tokens: 5,
									output_tokens: 2,
									total_tokens: 7,
									input_tokens_details: { cached_tokens: 0 },
								},
							},
						};
					},
				};
			},
		};

		constructor(_opts: unknown) {}
	}

	return { default: OpenAI };
});

describe('forge-ai OpenAI Responses stream parsing', () => {
	it('emits text events and a final done message', async () => {
		const { getModels, streamOpenAIResponses } = await import('forge-ai');
		const found = getModels('openai').find((m) => m.api === 'openai-responses');
		expect(found).toBeTruthy();
		const model = found as Model<'openai-responses'>;

		const context: Context = {
			systemPrompt: 'You are helpful.',
			messages: [],
		};

		const stream = streamOpenAIResponses(model, context, { apiKey: 'sk-test' });

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
