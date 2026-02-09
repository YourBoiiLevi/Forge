import { describe, expect, it } from 'vitest';

import type { Usage } from 'forge-ai';
import { calculateCost, getModels, getProviders } from 'forge-ai';

describe('forge-ai model registry', () => {
	it('exposes known providers and models', () => {
		const providers = getProviders();
		expect(providers.length).toBeGreaterThan(5);
		expect(providers).toContain('openai');
		expect(providers).toContain('anthropic');

		for (const provider of providers) {
			const models = getModels(provider);
			expect(models.length).toBeGreaterThan(0);
		}
	});

	it('calculates cost without throwing for every registered model', () => {
		const providers = getProviders();
		for (const provider of providers) {
			const models = getModels(provider);
			for (const model of models) {
				const usage: Usage = {
					input: 1,
					output: 1,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 2,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				};

				const cost = calculateCost(model, usage);
				expect(cost.total).toBe(cost.input + cost.output + cost.cacheRead + cost.cacheWrite);
				expect(Number.isFinite(cost.total)).toBe(true);
			}
		}
	});
});
