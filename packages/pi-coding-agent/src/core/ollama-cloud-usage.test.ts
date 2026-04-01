import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import {
	getOllamaCloudUsage,
	updateOllamaCloudUsage,
	formatOllamaCloudUsage,
	type OllamaCloudUsage,
} from "./ollama-cloud-usage.js";

const USAGE_KEY = "ollama-cloud-usage";

describe("OllamaCloudUsage", () => {
	beforeEach(() => {
		// Reset global state before each test
		delete globalThis[USAGE_KEY];
	});

	describe("getOllamaCloudUsage", () => {
		it("returns default values when no usage recorded", () => {
			const usage = getOllamaCloudUsage();
			assert.equal(usage.sessionInputTokens, 0);
			assert.equal(usage.sessionOutputTokens, 0);
			assert.equal(usage.lastRequestTime, null);
			assert.equal(usage.hourlyRemaining, null);
			assert.equal(usage.weeklyRemaining, null);
		});

		it("returns cached usage after update", () => {
			updateOllamaCloudUsage(100, 50);
			const usage = getOllamaCloudUsage();
			assert.equal(usage.sessionInputTokens, 100);
			assert.equal(usage.sessionOutputTokens, 50);
			assert.ok(usage.lastRequestTime !== null);
		});
	});

	describe("updateOllamaCloudUsage", () => {
		it("accumulates token counts across calls", () => {
			updateOllamaCloudUsage(100, 50);
			updateOllamaCloudUsage(200, 75);
			const usage = getOllamaCloudUsage();
			assert.equal(usage.sessionInputTokens, 300);
			assert.equal(usage.sessionOutputTokens, 125);
		});

		it("updates lastRequestTime on each call", () => {
			updateOllamaCloudUsage(100, 50);
			const firstTime = getOllamaCloudUsage().lastRequestTime;

			// Small delay to ensure different timestamp
			const start = Date.now();
			while (Date.now() === start) {}

			updateOllamaCloudUsage(50, 25);
			const secondTime = getOllamaCloudUsage().lastRequestTime;
			assert.ok(secondTime! > firstTime!);
		});

		it("preserves quota values if set", () => {
			// Manually set quota values
			const usage = getOllamaCloudUsage();
			Object.assign(usage, { hourlyRemaining: 100, weeklyRemaining: 1000 });
			globalThis[USAGE_KEY] = usage;

			updateOllamaCloudUsage(50, 25);
			const updated = getOllamaCloudUsage();
			assert.equal(updated.hourlyRemaining, 100);
			assert.equal(updated.weeklyRemaining, 1000);
		});
	});

	describe("formatOllamaCloudUsage", () => {
		it("formats basic usage without quota", () => {
			const usage: OllamaCloudUsage = {
				sessionInputTokens: 5000,
				sessionOutputTokens: 2500,
				lastRequestTime: Date.now(),
				hourlyRemaining: null,
				weeklyRemaining: null,
			};
			const formatted = formatOllamaCloudUsage(usage);
			assert.equal(formatted, "Ollama: 5k in / 3k out");
		});

		it("formats usage with quota info", () => {
			const usage: OllamaCloudUsage = {
				sessionInputTokens: 1000,
				sessionOutputTokens: 500,
				lastRequestTime: Date.now(),
				hourlyRemaining: 50,
				weeklyRemaining: 500,
			};
			const formatted = formatOllamaCloudUsage(usage);
			assert.equal(formatted, "Ollama: 1k/1k — 50/500 remaining");
		});

		it("handles zero tokens", () => {
			const usage: OllamaCloudUsage = {
				sessionInputTokens: 0,
				sessionOutputTokens: 0,
				lastRequestTime: null,
				hourlyRemaining: null,
				weeklyRemaining: null,
			};
			const formatted = formatOllamaCloudUsage(usage);
			assert.equal(formatted, "Ollama: 0k in / 0k out");
		});
	});
});
