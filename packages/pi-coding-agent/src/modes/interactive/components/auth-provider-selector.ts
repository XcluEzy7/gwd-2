/**
 * Unified auth provider selector - combines OAuth and API-key providers.
 *
 * Replaces OAuthSelectorComponent for /login, offering:
 * - All registered OAuth providers (Anthropic, GitHub Copilot, etc.)
 * - API-key providers
 * - Generic API-key entry for any provider
 */

import { getOAuthProviders } from "@gsd/pi-ai/oauth";
import {
	Container,
	getEditorKeybindings,
	Spacer,
	TruncatedText,
} from "@gsd/pi-tui";
import type { AuthStorage } from "../../../core/auth-storage.js";
import { theme } from "../theme/theme.js";
import { DynamicBorder } from "./dynamic-border.js";

export type AuthProviderType = "oauth" | "api-key";

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
	private selectedIndex = 0;
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

		this.loadProviders();

		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));

		const title =
			mode === "login"
				? "Select provider to login:"
				: "Select provider to logout:";
		this.addChild(new TruncatedText(theme.bold(title)));
		this.addChild(new Spacer(1));

		this.listContainer = new Container();
		this.addChild(this.listContainer);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());

		this.updateList();
	}

	private loadProviders(): void {
		for (const provider of getOAuthProviders()) {
			this.allOptions.push({
				id: provider.id,
				name: provider.name || provider.id,
				type: "oauth",
			});
		}

		for (const provider of [
			{ id: "ollama-cloud", name: "Ollama Cloud" },
			{ id: "openai", name: "OpenAI" },
			{ id: "groq", name: "Groq" },
			{ id: "xai", name: "xAI (Grok)" },
			{ id: "openrouter", name: "OpenRouter" },
			{ id: "mistral", name: "Mistral" },
		]) {
			this.allOptions.push({
				...provider,
				type: "api-key",
			});
		}

		if (this.mode === "logout") {
			this.allOptions = this.allOptions.filter((opt) =>
				this.authStorage.hasAuth(opt.id),
			);
		}
	}

	private updateList(): void {
		this.listContainer.clear();

		for (let i = 0; i < this.allOptions.length; i++) {
			const option = this.allOptions[i];
			if (!option) continue;

			const isSelected = i === this.selectedIndex;
			const hasAuth = this.authStorage.hasAuth(option.id);
			const credentials = this.authStorage.get(option.id);
			const isOAuth = credentials?.type === "oauth";
			const statusIndicator = hasAuth
				? theme.fg("success", ` ✓ ${isOAuth ? "OAuth" : "API key"}`)
				: "";

			const prefix = isSelected ? theme.fg("accent", "→ ") : "  ";
			const text = isSelected ? theme.fg("accent", option.name) : option.name;
			const hint = option.hint ? theme.fg("dim", ` (${option.hint})`) : "";
			this.listContainer.addChild(
				new TruncatedText(`${prefix}${text}${hint}${statusIndicator}`, 0, 0),
			);
		}

		if (this.allOptions.length === 0) {
			const message =
				this.mode === "login"
					? "No auth providers available"
					: "No providers logged in. Use /login first.";
			this.listContainer.addChild(
				new TruncatedText(theme.fg("muted", `  ${message}`), 0, 0),
			);
		}
	}

	handleInput(keyData: string): void {
		const kb = getEditorKeybindings();
		if (kb.matches(keyData, "selectUp")) {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
			this.updateList();
		} else if (kb.matches(keyData, "selectDown")) {
			this.selectedIndex = Math.min(
				this.allOptions.length - 1,
				this.selectedIndex + 1,
			);
			this.updateList();
		} else if (kb.matches(keyData, "selectConfirm")) {
			const selectedOption = this.allOptions[this.selectedIndex];
			if (selectedOption) {
				this.onSelectCallback(selectedOption);
			}
		} else if (kb.matches(keyData, "selectCancel")) {
			this.onCancelCallback();
		}
	}
}
