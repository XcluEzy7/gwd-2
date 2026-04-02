/**
 * Tests for slash-command-handlers.ts dispatchSlashCommand.
 *
 * Verifies that:
 * - Built-in commands are handled correctly
 * - Extension commands are allowed to flow through (not shown as "unknown")
 * - Truly unknown commands show the appropriate error
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dispatchSlashCommand, type SlashCommandContext } from "./slash-command-handlers.js";
import type { ExtensionRunner } from "../../core/extensions/runner.js";
import type { AgentSession } from "../../core/agent-session.js";
import type { SessionManager } from "../../core/session-manager.js";
import type { SettingsManager } from "../../core/settings-manager.js";
import type { KeybindingsManager } from "../../core/keybindings.js";
import type { TUI } from "@gsd/pi-tui";

describe("dispatchSlashCommand", () => {
	// Helper to create minimal mock context
	function createMockContext(options?: {
		extensionCommands?: string[];
		onShowError?: (msg: string) => void;
		onShowStatus?: (msg: string) => void;
	}): SlashCommandContext {
		const commands = new Map<string, { handler: () => Promise<void> }>();
		(options?.extensionCommands ?? []).forEach((name) => {
			commands.set(name, { handler: async () => {} });
		});

		const mockExtensionRunner = {
			getCommand: (name: string) => commands.get(name),
		} as unknown as ExtensionRunner;

		return {
			session: {} as AgentSession,
			ui: {} as TUI,
			keybindings: {} as KeybindingsManager,
			chatContainer: {} as any,
			statusContainer: {} as any,
			editorContainer: {} as any,
			headerContainer: {} as any,
			pendingMessagesContainer: {} as any,
			editor: {} as any,
			defaultEditor: {} as any,
			sessionManager: {} as SessionManager,
			settingsManager: {} as SettingsManager,
			extensionRunner: mockExtensionRunner,
			invalidateFooter: () => {},
			showStatus: options?.onShowStatus ?? (() => {}),
			showError: options?.onShowError ?? (() => {}),
			showWarning: () => {},
			showSelector: () => {},
			updateEditorBorderColor: () => {},
			getMarkdownThemeWithSettings: () => ({} as any),
			requestRender: () => {},
			updateTerminalTitle: () => {},
			showSettingsSelector: () => {},
			showModelsSelector: async () => {},
			handleModelCommand: async () => {},
			showUserMessageSelector: () => {},
			showTreeSelector: () => {},
			showProviderManager: () => {},
			showOAuthSelector: async () => {},
			showSessionSelector: () => {},
			handleClearCommand: async () => {},
			handleReloadCommand: async () => {},
			handleDebugCommand: () => {},
			shutdown: async () => {},
			executeCompaction: async () => {},
			handleBashCommand: async () => {},
		};
	}

	describe("extension command detection", () => {
		test("extension command (e.g., /gsd) returns false to allow flow-through", async () => {
			let errorShown = false;
			const ctx = createMockContext({
				extensionCommands: ["gsd"],
				onShowError: () => {
					errorShown = true;
				},
			});

			const result = await dispatchSlashCommand("/gsd help", ctx);

			assert.equal(result, false, "Extension command should return false to allow flow-through");
			assert.equal(errorShown, false, "Should NOT show 'Unknown command' error for extension commands");
		});

		test("extension command with arguments returns false", async () => {
			let errorShown = false;
			const ctx = createMockContext({
				extensionCommands: ["gsd", "kill"],
				onShowError: () => {
					errorShown = true;
				},
			});

			const result = await dispatchSlashCommand("/gsd auto --verbose", ctx);

			assert.equal(result, false);
			assert.equal(errorShown, false);
		});

		test("multiple extension commands are all handled", async () => {
			const extensionCommands = ["gsd", "kill", "worktree"];
			let errorCount = 0;
			const ctx = createMockContext({
				extensionCommands,
				onShowError: () => {
					errorCount++;
				},
			});

			for (const cmd of extensionCommands) {
				const result = await dispatchSlashCommand(`/${cmd}`, ctx);
				assert.equal(result, false, `Command /${cmd} should return false`);
			}

			assert.equal(errorCount, 0, "No errors should be shown for valid extension commands");
		});
	});

	describe("unknown command error", () => {
		test("truly unknown command shows error", async () => {
			let errorMessage = "";
			const ctx = createMockContext({
				extensionCommands: ["gsd"],
				onShowError: (msg) => {
					errorMessage = msg;
				},
			});

			const result = await dispatchSlashCommand("/unknowncommand", ctx);

			assert.equal(result, true, "Unknown command should return true (handled)");
			assert.ok(errorMessage.includes("Unknown command"), "Should show 'Unknown command' error");
			assert.ok(errorMessage.includes("/unknowncommand"), "Error should include the command name");
		});

		test("error includes command name for unknown commands", async () => {
			let errorMessage = "";
			const ctx = createMockContext({
				onShowError: (msg) => {
					errorMessage = msg;
				},
			});

			await dispatchSlashCommand("/notacommand", ctx);

			assert.ok(errorMessage.includes("/notacommand"), "Error message should include the full command with slash");
		});

		test("empty extensionRunner shows error for all non-built-in commands", async () => {
			let errorShown = false;
			const ctx = createMockContext({
				extensionCommands: [],
				onShowError: () => {
					errorShown = true;
				},
			});

			const result = await dispatchSlashCommand("/something", ctx);

			assert.equal(result, true);
			assert.equal(errorShown, true);
		});
	});

	describe("built-in command handling", () => {
		test("built-in command /model returns true", async () => {
			const ctx = createMockContext({
				extensionCommands: ["gsd"],
			});

			const result = await dispatchSlashCommand("/model", ctx);

			assert.equal(result, true, "Built-in commands should return true when handled");
		});

		test("built-in command /settings returns true", async () => {
			const ctx = createMockContext({});

			const result = await dispatchSlashCommand("/settings", ctx);

			assert.equal(result, true);
		});
	});

	describe("edge cases", () => {
		test("undefined extensionRunner is handled gracefully", async () => {
			let errorShown = false;
			const ctx = createMockContext({
				onShowError: () => {
					errorShown = true;
				},
			});
			// Override extensionRunner to undefined
			(ctx as any).extensionRunner = undefined;

			const result = await dispatchSlashCommand("/test", ctx);

			assert.equal(result, true);
			assert.equal(errorShown, true, "Should show error when extensionRunner is undefined");
		});

		test("command with multiple spaces before args", async () => {
			let errorShown = false;
			const ctx = createMockContext({
				extensionCommands: ["gsd"],
				onShowError: () => {
					errorShown = true;
				},
			});

			const result = await dispatchSlashCommand("/gsd   status", ctx);

			assert.equal(result, false, "Should handle command with multiple spaces");
			assert.equal(errorShown, false);
		});
	});
});
