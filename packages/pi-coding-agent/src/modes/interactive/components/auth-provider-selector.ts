/**
 * Unified auth provider selector - combines OAuth and API-key providers.
 *
 * Replaces OAuthSelectorComponent for /login, offering:
 * - All registered OAuth providers (Anthropic, GitHub Copilot, etc.)
 * - API-key providers with special flows (ollama-cloud: signin or API key)
 * - Generic API-key entry for any provider
 */

import type { OAuthProviderInterface } from "@gsd/pi-ai";
import { getOAuthProviders } from "@gsd/pi-ai/oauth";
import { Container, getEditorKeybindings, Spacer, TruncatedText } from "@gsd/pi-tui";
import type { AuthStorage } from "../../../core/auth-storage.js";
import { theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

export type AuthProviderType = "oauth" | "api-key" | "ollama-cloud-signin";

export interface AuthProviderOption {
	id: string;
	name: string;
	type: AuthProviderType;
	hint?: string;
}

/**
 * Component that renders a unified auth provider selector
 */
export class AuthProviderSelectorComponent extends Container {
	private listContainer: Container;
	private allOptions: AuthProviderOption[] = [];
	private selectedIndex: number = 0;
	private mode: "login" | "logout";
	private authStorage: AuthStorage;
	private onSelectCallback: (option: AuthProviderOption) => void;
	private onCancelCallback: () => void;

	constructor(
		mode: "login" | "logout",
		authStorage: AuthStorage,
		onSelect: (option: AuthProviderOption) => void,
		onCancel: () => void,
	) {
		super();

		this.mode = mode;
		this.authStorage = authStorage;
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;

		// Build the provider list
		this.loadProviders();

		// Add top border
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));

		// Add title
		const title = mode === "login" ? "Select provider to login:" : "Select provider to logout:";
		this.addChild(new TruncatedText(theme.bold(title)));
		this.addChild(new Spacer(1));

		// Create list container
		this.listContainer = new Container();
		this.addChild(this.listContainer);

		this.addChild(new Spacer(1));

		// Add bottom border
		this.addChild(new DynamicBorder());

		// Initial render
		this.updateList();
	}

	private loadProviders(): void {
		// Start with OAuth providers
		const oauthProviders = getOAuthProviders();

		for (const provider of oauthProviders) {
			this.allOptions.push({
				id: provider.id,
				name: provider.name || provider.id,
				type: "oauth",
			});
		}

		// Add Ollama Cloud with special auth methods
		this.allOptions.push({
			id: "ollama-cloud",
			name: "Ollama Cloud",
			type: "ollama-cloud-signin",
			hint: "signin or API key",
		});

		// Add generic API-key providers (expand as needed)
		this.allOptions.push({
			id: "openai",
			name: "OpenAI",
			type: "api-key",
		});

		this.allOptions.push({
			id: "groq",
			name: "Groq",
			type: "api-key",
		});

		this.allOptions.push({
			id: "xai",
			name: "xAI (Grok)",
			type: "api-key",
		});

		this.allOptions.push({
			id: "openrouter",
			name: "OpenRouter",
			type: "api-key",
		});

		this.allOptions.push({
			id: "mistral",
			name: "Mistral",
			type: "api-key",
		});

		// Filter for logout mode - only show logged-in providers
		if (this.mode === "logout") {
			this.allOptions = this.allOptions.filter((opt) => this.authStorage.hasAuth(opt.id));
		}
	}

	private updateList(): void {
		this.listContainer.clear();

		for (let i = 0; i < this.allOptions.length; i++) {
			const option = this.allOptions[i];
			if (!option) continue;

			const isSelected = i === this.selectedIndex;

			// Check if user is logged in for this provider
			const hasAuth = this.authStorage.hasAuth(option.id);
			const credentials = this.authStorage.get(option.id);
			const isOAuth = credentials?.type === "oauth";
			const statusIndicator = hasAuth
				? theme.fg("success", ` ✓ ${isOAuth ? "OAuth" : "API key"}`)
				: "";

			let line = "";
			if (isSelected) {
				const prefix = theme.fg("accent", "→ ");
				const text = theme.fg("accent", option.name);
				const hint = option.hint ? theme.fg("dim", ` (${option.hint})`) : "";
				line = prefix + text + hint + statusIndicator;
			} else {
				const text = `  ${option.name}`;
				const hint = option.hint ? ` (${option.hint})` : "";
				line = text + hint + statusIndicator;
			}

			this.listContainer.addChild(new TruncatedText(line, 0, 0));
		}

		// Show "no providers" if empty
		if (this.allOptions.length === 0) {
			const message =
				this.mode === "login"
					? "No auth providers available"
					: "No providers logged in. Use /login first.";
			this.listContainer.addChild(new TruncatedText(theme.fg("muted", `  ${message}`), 0, 0));
		}
	}

	handleInput(keyData: string): void {
		const kb = getEditorKeybindings();
		// Up arrow
		if (kb.matches(keyData, "selectUp")) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.updateList();
		}
		// Down arrow
		else if (kb.matches(keyData, "selectDown")) {
			this.selectedIndex = Math.min(this.allOptions.length - 1, this.selectedIndex + 1);
			this.updateList();
		}
		// Enter
		else if (kb.matches(keyData, "selectConfirm")) {
			const selectedOption = this.allOptions[this.selectedIndex];
			if (selectedOption) {
				this.onSelectCallback(selectedOption);
			}
		}
		// Escape or Ctrl+C
		else if (kb.matches(keyData, "selectCancel")) {
			this.onCancelCallback();
		}
	}
}
