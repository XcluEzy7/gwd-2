import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { AuthStorage } from "./auth-storage.js";
import { ModelDiscoveryCache } from "./discovery-cache.js";
import {
	getDefaultTTL,
	getDiscoverableProviders,
	getDiscoveryAdapter,
} from "./model-discovery.js";
import { ModelRegistry } from "./model-registry.js";

let testDir: string;

beforeEach(() => {
	testDir = join(
		tmpdir(),
		`model-registry-discovery-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
	try {
		rmSync(testDir, { recursive: true, force: true });
	} catch {
		// Cleanup best-effort
	}
});

function createRegistry(options?: {
	auth?: Record<string, { type: "api_key"; key: string }>;
}): { registry: ModelRegistry; cache: ModelDiscoveryCache } {
	const cache = new ModelDiscoveryCache(join(testDir, "discovery-cache.json"));
	const authStorage = AuthStorage.inMemory(options?.auth ?? {});
	const registry = new ModelRegistry(authStorage, undefined, {
		discoveryCache: cache,
	});
	return { registry, cache };
}

function markEntryStale(cache: ModelDiscoveryCache, provider: string): void {
	const entry = cache.get(provider);
	assert.ok(entry, `expected cache entry for ${provider}`);
	entry.fetchedAt = Date.now() - entry.ttlMs - 10;
}

async function withStubbedFetch<T>(
	stub: typeof globalThis.fetch,
	fn: () => Promise<T>,
): Promise<T> {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = stub;
	try {
		return await fn();
	} finally {
		globalThis.fetch = originalFetch;
	}
}

// ─── discovery cache integration ─────────────────────────────────────────────

describe("ModelDiscoveryCache — integration with discovery", () => {
	it("cache respects provider-specific TTLs", () => {
		const cachePath = join(testDir, "cache.json");
		const cache = new ModelDiscoveryCache(cachePath);

		cache.set("ollama", [{ id: "llama2" }]);
		const entry = cache.get("ollama");
		assert.ok(entry);
		assert.equal(entry.ttlMs, getDefaultTTL("ollama"));
	});

	it("cache uses custom TTL when provided", () => {
		const cachePath = join(testDir, "cache.json");
		const cache = new ModelDiscoveryCache(cachePath);

		cache.set("openai", [{ id: "gpt-4o" }], 999);
		const entry = cache.get("openai");
		assert.ok(entry);
		assert.equal(entry.ttlMs, 999);
	});
});

// ─── registry discovery orchestration ────────────────────────────────────────

describe("ModelRegistry — discovery preparation", () => {
	it("skips rediscovery when cache is fresh and exposes cached discovered models", async () => {
		const { registry, cache } = createRegistry({
			auth: { openai: { type: "api_key", key: "sk-test" } },
		});
		cache.set("openai", [{ id: "cached-model", name: "Cached Model" }], 60_000);

		await withStubbedFetch(
			(async () => {
				throw new Error("fetch should not run for fresh cache");
			}) as typeof globalThis.fetch,
			async () => {
				const results = await registry.prepareDiscoveryRefresh({
					providers: ["openai"],
				});
				assert.equal(results.length, 1);
				assert.equal(results[0].source, "fresh-cache");
				assert.equal(results[0].models[0].id, "cached-model");

				const discovered = registry
					.getAllWithDiscovered()
					.find(
						(model) =>
							model.provider === "openai" && model.id === "cached-model",
					);
				assert.ok(discovered);
				assert.equal(registry.isDiscovered(discovered), true);
			},
		);
	});

	it("rediscoveries stale cache entries and updates visible discovered models", async () => {
		const { registry, cache } = createRegistry({
			auth: { openai: { type: "api_key", key: "sk-test" } },
		});
		cache.set("openai", [{ id: "stale-model" }], 1);
		markEntryStale(cache, "openai");

		let fetchCalls = 0;
		await withStubbedFetch(
			(async () => {
				fetchCalls += 1;
				return new Response(
					JSON.stringify({ data: [{ id: "rediscovered-model" }] }),
					{ status: 200, headers: { "content-type": "application/json" } },
				);
			}) as typeof globalThis.fetch,
			async () => {
				const results = await registry.prepareDiscoveryRefresh({
					providers: ["openai"],
				});
				assert.equal(fetchCalls, 1);
				assert.equal(results[0].source, "rediscovered");
				assert.equal(results[0].models[0].id, "rediscovered-model");
				assert.equal(cache.get("openai")?.models[0].id, "rediscovered-model");

				const visible = registry
					.getAllWithDiscovered()
					.find(
						(model) =>
							model.provider === "openai" && model.id === "rediscovered-model",
					);
				assert.ok(visible);
			},
		);
	});

	it("keeps stale cache entries cheap while they are still inside the refresh cadence window", async () => {
		const { registry, cache } = createRegistry({
			auth: { openai: { type: "api_key", key: "sk-test" } },
		});
		cache.set("openai", [{ id: "stale-model" }], 1);
		markEntryStale(cache, "openai");
		const cachedEntry = cache.get("openai");
		assert.ok(cachedEntry);
		cachedEntry.fetchedAt = Date.now() - 2 * 60 * 1000;

		await withStubbedFetch(
			(async () => {
				throw new Error("fetch should not run inside cadence window");
			}) as typeof globalThis.fetch,
			async () => {
				const results = await registry.prepareDiscoveryRefresh({
					providers: ["openai"],
					minTimeSinceLastFetchMs: 15 * 60 * 1000,
				});
				assert.equal(results.length, 1);
				assert.equal(results[0].source, "fresh-cache");
				assert.equal(results[0].models[0].id, "stale-model");
			},
		);
	});

	it("forced refresh bypasses fresh cache and replaces discovered visibility immediately", async () => {
		const { registry, cache } = createRegistry({
			auth: { openai: { type: "api_key", key: "sk-test" } },
		});
		cache.set("openai", [{ id: "old-model" }], 60_000);

		let fetchCalls = 0;
		await withStubbedFetch(
			(async () => {
				fetchCalls += 1;
				return new Response(JSON.stringify({ data: [{ id: "new-model" }] }), {
					status: 200,
					headers: { "content-type": "application/json" },
				});
			}) as typeof globalThis.fetch,
			async () => {
				const results = await registry.prepareDiscoveryRefresh({
					providers: ["openai"],
					force: true,
				});
				assert.equal(fetchCalls, 1);
				assert.equal(results[0].source, "rediscovered");

				const models = registry.getAllWithDiscovered();
				assert.equal(
					models.some(
						(model) => model.provider === "openai" && model.id === "new-model",
					),
					true,
				);
				assert.equal(
					models.some(
						(model) => model.provider === "openai" && model.id === "old-model",
					),
					false,
				);
			},
		);
	});

	it("returns skipped results for unknown providers, providers without discovery, and missing auth", async () => {
		const { registry } = createRegistry();

		await withStubbedFetch(
			(async () => {
				throw new Error("fetch should not run for skipped providers");
			}) as typeof globalThis.fetch,
			async () => {
				const results = await registry.prepareDiscoveryRefresh({
					providers: ["unknown-provider", "anthropic", "openai"],
				});
				assert.deepEqual(
					results.map((result) => [result.provider, result.source]),
					[
						["unknown-provider", "skipped"],
						["anthropic", "skipped"],
						["openai", "skipped"],
					],
				);
			},
		);
	});

	it("returns empty results for an empty provider scope", async () => {
		const { registry } = createRegistry();
		const results = await registry.prepareDiscoveryRefresh({ providers: [] });
		assert.deepEqual(results, []);
		assert.equal(
			registry.getAllWithDiscovered().length,
			registry.getAll().length,
		);
	});

	it("records adapter failures as errors and keeps broken discoveries out of merged models", async () => {
		const { registry } = createRegistry({
			auth: { openai: { type: "api_key", key: "sk-test" } },
		});

		await withStubbedFetch(
			(async () => {
				throw new Error("boom");
			}) as typeof globalThis.fetch,
			async () => {
				const results = await registry.prepareDiscoveryRefresh({
					providers: ["openai"],
				});
				assert.equal(results.length, 1);
				assert.equal(results[0].source, "error");
				assert.match(results[0].error ?? "", /boom/);
				assert.equal(
					registry
						.getAllWithDiscovered()
						.some(
							(model) =>
								model.provider === "openai" && model.id === "broken-model",
						),
					false,
				);
			},
		);
	});
});

// ─── adapter resolution ─────────────────────────────────────────────────────

describe("Discovery adapter resolution", () => {
	it("all discoverable providers have adapters", () => {
		const providers = getDiscoverableProviders();
		for (const provider of providers) {
			const adapter = getDiscoveryAdapter(provider);
			assert.equal(
				adapter.supportsDiscovery,
				true,
				`${provider} should support discovery`,
			);
		}
	});

	it("static adapters return empty model lists", async () => {
		const staticProviders = [
			"anthropic",
			"bedrock",
			"azure-openai",
			"groq",
			"cerebras",
		];
		for (const provider of staticProviders) {
			const adapter = getDiscoveryAdapter(provider);
			assert.equal(
				adapter.supportsDiscovery,
				false,
				`${provider} should not support discovery`,
			);
			const models = await adapter.fetchModels("dummy-key");
			assert.deepEqual(models, [], `${provider} should return empty models`);
		}
	});
});

// ─── AuthStorage hasAuth for discovery ───────────────────────────────────────

describe("AuthStorage — hasAuth for discovery providers", () => {
	it("returns false for providers without auth", () => {
		const originalOpenAi = process.env.OPENAI_API_KEY;
		const originalOllama = process.env.OLLAMA_API_KEY;
		delete process.env.OPENAI_API_KEY;
		delete process.env.OLLAMA_API_KEY;
		try {
			const storage = AuthStorage.inMemory({});
			assert.equal(storage.hasAuth("openai"), false);
			assert.equal(storage.hasAuth("ollama"), false);
		} finally {
			if (originalOpenAi === undefined) delete process.env.OPENAI_API_KEY;
			else process.env.OPENAI_API_KEY = originalOpenAi;
			if (originalOllama === undefined) delete process.env.OLLAMA_API_KEY;
			else process.env.OLLAMA_API_KEY = originalOllama;
		}
	});

	it("returns true for providers with stored keys", () => {
		const originalOpenAi = process.env.OPENAI_API_KEY;
		const originalOllama = process.env.OLLAMA_API_KEY;
		delete process.env.OPENAI_API_KEY;
		delete process.env.OLLAMA_API_KEY;
		try {
			const storage = AuthStorage.inMemory({
				openai: { type: "api_key" as const, key: "sk-test" },
			});
			assert.equal(storage.hasAuth("openai"), true);
			assert.equal(storage.hasAuth("ollama"), false);
		} finally {
			if (originalOpenAi === undefined) delete process.env.OPENAI_API_KEY;
			else process.env.OPENAI_API_KEY = originalOpenAi;
			if (originalOllama === undefined) delete process.env.OLLAMA_API_KEY;
			else process.env.OLLAMA_API_KEY = originalOllama;
		}
	});
});

// ─── cache persistence across instances ──────────────────────────────────────

describe("ModelDiscoveryCache — persistence", () => {
	it("data survives across cache instances", () => {
		const cachePath = join(testDir, "persist.json");

		const cache1 = new ModelDiscoveryCache(cachePath);
		cache1.set("openai", [
			{ id: "gpt-4o", name: "GPT-4o", contextWindow: 128000 },
			{ id: "gpt-4o-mini", name: "GPT-4o Mini" },
		]);

		const cache2 = new ModelDiscoveryCache(cachePath);
		const entry = cache2.get("openai");
		assert.ok(entry);
		assert.equal(entry.models.length, 2);
		assert.equal(entry.models[0].contextWindow, 128000);
	});

	it("clear persists across instances", () => {
		const cachePath = join(testDir, "clear.json");

		const cache1 = new ModelDiscoveryCache(cachePath);
		cache1.set("openai", [{ id: "gpt-4o" }]);
		cache1.clear("openai");

		const cache2 = new ModelDiscoveryCache(cachePath);
		assert.equal(cache2.get("openai"), undefined);
	});
});

// ─── discovery TTL values ────────────────────────────────────────────────────

describe("Discovery TTL configuration", () => {
	it("ollama has shortest TTL (local models change often)", () => {
		const ollamaTTL = getDefaultTTL("ollama");
		const openaiTTL = getDefaultTTL("openai");
		assert.ok(
			ollamaTTL < openaiTTL,
			"ollama TTL should be shorter than openai",
		);
	});

	it("unknown providers get default TTL", () => {
		const customTTL = getDefaultTTL("my-custom-provider");
		const defaultTTL = getDefaultTTL("default");
		assert.equal(customTTL, defaultTTL);
	});
});
