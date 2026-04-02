import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	getProviderContract,
	getProviderDiscoveryTarget,
	getProviderDiscoveryTtl,
} from "../../../../src/resources/extensions/shared/provider-contracts.ts";
import {
	DISCOVERY_TTLS,
	getDefaultTTL,
	getDiscoverableProviders,
	getDiscoveryAdapter,
} from "./model-discovery.ts";

// ─── getDiscoveryAdapter ─────────────────────────────────────────────────────

describe("getDiscoveryAdapter", () => {
	it("returns an adapter for openai", () => {
		const adapter = getDiscoveryAdapter("openai");
		assert.equal(adapter.provider, "openai");
		assert.equal(adapter.supportsDiscovery, true);
	});

	it("returns an adapter for ollama", () => {
		const adapter = getDiscoveryAdapter("ollama");
		assert.equal(adapter.provider, "ollama");
		assert.equal(adapter.supportsDiscovery, true);
	});

	it("returns an adapter for openrouter", () => {
		const adapter = getDiscoveryAdapter("openrouter");
		assert.equal(adapter.provider, "openrouter");
		assert.equal(adapter.supportsDiscovery, true);
	});

	it("returns an adapter for google", () => {
		const adapter = getDiscoveryAdapter("google");
		assert.equal(adapter.provider, "google");
		assert.equal(adapter.supportsDiscovery, true);
	});

	it("returns an adapter for ollama-cloud", () => {
		const adapter = getDiscoveryAdapter("ollama-cloud");
		assert.equal(adapter.provider, "ollama-cloud");
		assert.equal(adapter.supportsDiscovery, true);
	});

	it("returns a static adapter for anthropic", () => {
		const adapter = getDiscoveryAdapter("anthropic");
		assert.equal(adapter.provider, "anthropic");
		assert.equal(adapter.supportsDiscovery, false);
	});

	it("returns a static adapter for bedrock", () => {
		const adapter = getDiscoveryAdapter("bedrock");
		assert.equal(adapter.provider, "bedrock");
		assert.equal(adapter.supportsDiscovery, false);
	});

	it("returns a static adapter for unknown providers", () => {
		const adapter = getDiscoveryAdapter("unknown-provider");
		assert.equal(adapter.provider, "unknown-provider");
		assert.equal(adapter.supportsDiscovery, false);
	});

	it("static adapter fetchModels returns empty array", async () => {
		const adapter = getDiscoveryAdapter("anthropic");
		const models = await adapter.fetchModels("key");
		assert.deepEqual(models, []);
	});
});

// ─── getDiscoverableProviders ────────────────────────────────────────────────

describe("getDiscoverableProviders", () => {
	it("returns only providers that support discovery", () => {
		const providers = getDiscoverableProviders();
		assert.ok(providers.includes("openai"));
		assert.ok(providers.includes("ollama"));
		assert.ok(providers.includes("ollama-cloud"));
		assert.ok(providers.includes("openrouter"));
		assert.ok(providers.includes("google"));
		assert.ok(!providers.includes("anthropic"));
		assert.ok(!providers.includes("bedrock"));
	});

	it("returns an array of strings", () => {
		const providers = getDiscoverableProviders();
		assert.ok(Array.isArray(providers));
		for (const p of providers) {
			assert.equal(typeof p, "string");
		}
	});
});

// ─── getDefaultTTL ───────────────────────────────────────────────────────────

describe("getDefaultTTL", () => {
	it("returns 5 minutes for ollama", () => {
		assert.equal(getDefaultTTL("ollama"), 5 * 60 * 1000);
	});

	it("returns contract ttl for ollama-cloud", () => {
		assert.equal(
			getDefaultTTL("ollama-cloud"),
			getProviderDiscoveryTtl("ollama-cloud"),
		);
	});

	it("returns 1 hour for openai", () => {
		assert.equal(getDefaultTTL("openai"), 60 * 60 * 1000);
	});

	it("returns 1 hour for google", () => {
		assert.equal(getDefaultTTL("google"), 60 * 60 * 1000);
	});

	it("returns 1 hour for openrouter", () => {
		assert.equal(getDefaultTTL("openrouter"), 60 * 60 * 1000);
	});

	it("returns 24 hours for unknown providers", () => {
		assert.equal(getDefaultTTL("some-custom"), 24 * 60 * 60 * 1000);
	});
});

// ─── DISCOVERY_TTLS ──────────────────────────────────────────────────────────

describe("DISCOVERY_TTLS", () => {
	it("has expected keys", () => {
		assert.ok("ollama" in DISCOVERY_TTLS);
		assert.ok("openai" in DISCOVERY_TTLS);
		assert.ok("google" in DISCOVERY_TTLS);
		assert.ok("openrouter" in DISCOVERY_TTLS);
		assert.ok("default" in DISCOVERY_TTLS);
	});

	it("all values are positive numbers", () => {
		for (const [, value] of Object.entries(DISCOVERY_TTLS)) {
			assert.equal(typeof value, "number");
			assert.ok(value > 0);
		}
	});

	it("pins ollama-cloud discovery target, ttl, and auth mode to the canonical contract", () => {
		const contract = getProviderContract("ollama-cloud");
		assert.equal(contract.authMode, "api-key");
		assert.equal(
			getProviderDiscoveryTarget("ollama-cloud"),
			contract.discovery.targetUrl,
		);
		assert.equal(
			getProviderDiscoveryTtl("ollama-cloud"),
			DISCOVERY_TTLS["ollama-cloud"],
		);
		assert.equal(contract.discovery.responseShape, "openai-model-list");
	});

	it("throws for providers without discovery targets", () => {
		assert.throws(
			() => getProviderDiscoveryTarget("nano-gpt"),
			/no discovery target URL/,
		);
		assert.throws(
			() => getProviderContract("unknown-provider"),
			/Unknown canonical provider contract/,
		);
	});
});

// ─── Ollama Cloud auth/header behavior ───────────────────────────────────────

describe("ollama-cloud discovery adapter", () => {
	it("sends bearer auth for real API keys and uses the canonical discovery URL", async () => {
		const adapter = getDiscoveryAdapter("ollama-cloud");
		const originalFetch = globalThis.fetch;
		let requestUrl = "";
		let requestHeaders: HeadersInit | undefined;

		globalThis.fetch = (async (input, init) => {
			requestUrl = String(input);
			requestHeaders = init?.headers;
			return new Response(JSON.stringify({ data: [{ id: "qwen3:32b" }] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as typeof fetch;

		try {
			const models = await adapter.fetchModels("sk-real-key");
			assert.deepEqual(models, [
				{ id: "qwen3:32b", name: "qwen3:32b", input: ["text", "image"] },
			]);
			assert.equal(requestUrl, getProviderDiscoveryTarget("ollama-cloud"));
			assert.deepEqual(requestHeaders, {
				Authorization: "Bearer sk-real-key",
			});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("omits Authorization when no API key is available", async () => {
		const adapter = getDiscoveryAdapter("ollama-cloud");
		const originalFetch = globalThis.fetch;
		let requestHeaders: HeadersInit | undefined;

		globalThis.fetch = (async (_input, init) => {
			requestHeaders = init?.headers;
			return new Response(JSON.stringify({ data: [] }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}) as typeof fetch;

		try {
			const models = await adapter.fetchModels("");
			assert.deepEqual(models, []);
			assert.deepEqual(requestHeaders ?? {}, {});
		} finally {
			globalThis.fetch = originalFetch;
		}
	});
});
