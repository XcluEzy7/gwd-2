import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Key } from "@gsd/pi-tui";
import { SettingsManager } from "../../../core/settings-manager.js";
import { ScopedModelsSelectorComponent } from "../components/scoped-models-selector.js";
import { initTheme } from "../theme/theme.js";
import {
	findExactModelMatch,
	prepareModelCandidates,
	updateAvailableProviderCount,
} from "./model-controller.js";

function createModel(provider: string, id: string) {
	return {
		provider,
		id,
		name: id,
		api: "openai",
		baseUrl: "",
		reasoning: false,
		input: ["text"] as const satisfies readonly ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128000,
		maxTokens: 16384,
	};
}

describe("model-controller", () => {
	it("returns scoped session models without touching registry refresh", async () => {
		const scopedModel = createModel("openai", "scoped-model");
		let refreshCalls = 0;
		const host = {
			session: {
				scopedModels: [{ model: scopedModel }],
				modelRegistry: {
					async prepareDiscoveryRefresh() {
						refreshCalls += 1;
					},
					getAllWithDiscovered() {
						return [];
					},
					isProviderRequestReady() {
						return true;
					},
				},
			},
		};

		const models = await prepareModelCandidates(host);
		assert.deepEqual(models, [scopedModel]);
		assert.equal(refreshCalls, 0);
	});

	it("finds newly discovered exact matches after shared candidate preparation", async () => {
		const discoveredModel = createModel("openai", "gpt-fresh");
		let refreshCalls = 0;
		let lastRefreshOptions: Record<string, unknown> | undefined;
		const host = {
			settingsManager: SettingsManager.inMemory({
				modelDiscovery: { ttlMinutes: Number.NaN },
			}),
			session: {
				scopedModels: [],
				modelRegistry: {
					async prepareDiscoveryRefresh(options: Record<string, unknown>) {
						refreshCalls += 1;
						lastRefreshOptions = options;
					},
					getAllWithDiscovered() {
						return [discoveredModel];
					},
					isProviderRequestReady(provider: string) {
						return provider === "openai";
					},
				},
			},
		};

		const model = await findExactModelMatch(host, "openai/gpt-fresh");
		assert.equal(model, discoveredModel);
		assert.equal(refreshCalls, 1);
		assert.equal(lastRefreshOptions?.minTimeSinceLastFetchMs, 15 * 60 * 1000);
	});

	it("returns undefined for unknown exact matches when candidate set is empty", async () => {
		const host = {
			session: {
				scopedModels: [],
				modelRegistry: {
					async prepareDiscoveryRefresh() {},
					getAllWithDiscovered() {
						return [];
					},
					isProviderRequestReady() {
						return true;
					},
				},
			},
		};

		const model = await findExactModelMatch(host, "openai/missing-model");
		assert.equal(model, undefined);
	});

	it("keeps provider counts in sync with discovered candidates", async () => {
		const host = {
			session: {
				scopedModels: [],
				modelRegistry: {
					async prepareDiscoveryRefresh() {},
					getAllWithDiscovered() {
						return [
							createModel("openai", "gpt-4.1"),
							createModel("openai", "gpt-fresh"),
							createModel("ollama-cloud", "qwen3:32b"),
						];
					},
					isProviderRequestReady() {
						return true;
					},
				},
			},
			footerDataProvider: {
				count: -1,
				setAvailableProviderCount(count: number) {
					this.count = count;
				},
			},
		};

		await updateAvailableProviderCount(host);
		assert.equal(host.footerDataProvider.count, 2);
	});

	it("falls back to an empty candidate set when discovery preparation errors", async () => {
		const host = {
			session: {
				scopedModels: [],
				modelRegistry: {
					async prepareDiscoveryRefresh() {
						throw new Error("boom");
					},
					getAllWithDiscovered() {
						return [createModel("openai", "should-not-leak")];
					},
					isProviderRequestReady() {
						return true;
					},
				},
			},
		};

		const models = await prepareModelCandidates(host, {
			includeScopedSessionModels: false,
		});
		assert.deepEqual(models, []);
	});

	it("persists NanoGPT tier policy alongside enabled models from the selector", () => {
		initTheme(undefined, false);
		const persisted: {
			enabledIds?: string[];
			nanoGptTierPolicy?: "both" | "subscription_only" | "payg_only";
		} = {};
		const selector = new ScopedModelsSelectorComponent(
			{
				allModels: [
					createModel("nano-gpt", "sub-model"),
					createModel("nano-gpt-payg", "payg-model"),
				],
				enabledModelIds: new Set(["nano-gpt/sub-model"]),
				hasEnabledModelsFilter: true,
				nanoGptTierPolicy: "both",
			},
			{
				onModelToggle() {},
				onPersist(enabledIds, nanoGptTierPolicy) {
					persisted.enabledIds = enabledIds;
					persisted.nanoGptTierPolicy = nanoGptTierPolicy;
				},
				onEnableAll() {},
				onClearAll() {},
				onToggleProvider() {},
				onCancel() {},
			},
		);

		selector.handleInput("\u0014");
		selector["callbacks"].onPersist(
			selector["enabledIds"] ?? selector["allIds"],
			selector["nanoGptTierPolicy"],
		);

		assert.deepEqual(persisted.enabledIds, ["nano-gpt/sub-model"]);
		assert.equal(persisted.nanoGptTierPolicy, "subscription_only");
	});
});
