import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SettingsManager, type SettingsStorage } from "./settings-manager.js";

class MemoryStorage implements SettingsStorage {
	constructor(
		private values: Partial<Record<"global" | "project", string>> = {},
		private failWritesFor: Set<"global" | "project"> = new Set(),
	) {}

	withLock(
		scope: "global" | "project",
		fn: (current: string | undefined) => string | undefined,
	): void {
		const next = fn(this.values[scope]);
		if (next === undefined) {
			return;
		}
		if (this.failWritesFor.has(scope)) {
			throw new Error(`write failed for ${scope}`);
		}
		this.values[scope] = next;
	}

	read(scope: "global" | "project"): Record<string, unknown> {
		return this.values[scope] ? JSON.parse(this.values[scope]!) : {};
	}
}

describe("SettingsManager NanoGPT tier policy", () => {
	it("defaults to both when missing and persists independently from enabledModels", async () => {
		const storage = new MemoryStorage();
		const manager = SettingsManager.fromStorage(storage);

		assert.equal(manager.getNanoGptTierPolicy(), "both");
		manager.setEnabledModels(["openai/gpt-5.4"]);
		manager.setNanoGptTierPolicy("payg_only");
		await manager.flush();

		const reloaded = SettingsManager.fromStorage(storage);
		assert.deepEqual(reloaded.getEnabledModels(), ["openai/gpt-5.4"]);
		assert.equal(reloaded.getNanoGptTierPolicy(), "payg_only");
	});

	it("normalizes malformed persisted policy values back to both without mutating enabled models", () => {
		const storage = new MemoryStorage({
			global: JSON.stringify({
				enabledModels: ["nano-gpt/model-a"],
				nanoGptTierPolicy: "bad-value",
			}),
		});
		const manager = SettingsManager.fromStorage(storage);

		assert.deepEqual(manager.getEnabledModels(), ["nano-gpt/model-a"]);
		assert.equal(manager.getNanoGptTierPolicy(), "both");
	});

	it("reloads persisted NanoGPT tier policy from storage", async () => {
		const storage = new MemoryStorage();
		const manager = SettingsManager.fromStorage(storage);
		manager.setNanoGptTierPolicy("subscription_only");
		await manager.flush();

		storage.withLock("global", () =>
			JSON.stringify({ nanoGptTierPolicy: "payg_only" }, null, 2),
		);
		manager.reload();

		assert.equal(manager.getNanoGptTierPolicy(), "payg_only");
	});

	it("persists enabled models and NanoGPT tier policy together without partial file writes", async () => {
		const storage = new MemoryStorage(
			{
				global: JSON.stringify({
					enabledModels: ["openai/gpt-5.4"],
					nanoGptTierPolicy: "both",
				}),
			},
			new Set(["global"]),
		);
		const manager = SettingsManager.fromStorage(storage);

		manager.setScopedModelPersistence({
			enabledModels: ["nano-gpt/model-a"],
			nanoGptTierPolicy: "subscription_only",
		});
		await manager.flush();

		assert.deepEqual(storage.read("global"), {
			enabledModels: ["openai/gpt-5.4"],
			nanoGptTierPolicy: "both",
		});
		assert.equal(manager.drainErrors().length > 0, true);
	});
});
