/**
 * Usage tracking service for Ollama Cloud.
 *
 * Extracts token usage from streaming responses and provides
 * a placeholder for hourly/weekly remaining usage when the
 * API endpoint is confirmed.
 *
 * Current implementation:
 * - Tracks cumulative token usage per session
 * - Extracts usage from final streaming chunks (prompt_eval_count, eval_count)
 *
 * TODO: When Ollama Cloud publishes usage API:
 * - Poll GET /v1/usage or similar endpoint
 * - Parse hourly/weekly remaining quotas
 * - Display in TUI footer and provider manager
 */

import type { Model } from "@gsd/pi-ai";

export interface OllamaCloudUsage {
	/** Total input tokens this session */
	sessionInputTokens: number;
	/** Total output tokens this session */
	sessionOutputTokens: number;
	/** Last request timestamp */
	lastRequestTime: number | null;
	/** Hourly remaining (if API supports) */
	hourlyRemaining: number | null;
	/** Weekly remaining (if API supports) */
	weeklyRemaining: number | null;
}

const USAGE_KEY = "ollama-cloud-usage";

/**
 * Get current usage state from in-memory storage.
 * In a future implementation, this would poll the Ollama Cloud API.
 */
export function getOllamaCloudUsage(): OllamaCloudUsage {
	// Return cached usage if available
	const cached = globalThis[USAGE_KEY] as OllamaCloudUsage | undefined;
	if (cached) return cached;

	// Initialize default
	const initial: OllamaCloudUsage = {
		sessionInputTokens: 0,
		sessionOutputTokens: 0,
		lastRequestTime: null,
		hourlyRemaining: null,
		weeklyRemaining: null,
	};
	globalThis[USAGE_KEY] = initial;
	return initial;
}

/**
 * Update usage after a streaming response completes.
 * Called by the ollama-chat provider when final chunk is received.
 */
export function updateOllamaCloudUsage(
	inputTokens: number,
	outputTokens: number,
): OllamaCloudUsage {
	const current = getOllamaCloudUsage();
	const updated: OllamaCloudUsage = {
		sessionInputTokens: current.sessionInputTokens + inputTokens,
		sessionOutputTokens: current.sessionOutputTokens + outputTokens,
		lastRequestTime: Date.now(),
		hourlyRemaining: current.hourlyRemaining,
		weeklyRemaining: current.weeklyRemaining,
	};
	globalThis[USAGE_KEY] = updated;
	return updated;
}

/**
 * Format usage for display in TUI footer.
 */
export function formatOllamaCloudUsage(usage: OllamaCloudUsage): string {
	const inputK = Math.round(usage.sessionInputTokens / 1000);
	const outputK = Math.round(usage.sessionOutputTokens / 1000);

	if (usage.hourlyRemaining !== null && usage.weeklyRemaining !== null) {
		return `Ollama: ${inputK}k/${outputK}k — ${usage.hourlyRemaining}/${usage.weeklyRemaining} remaining`;
	}

	return `Ollama: ${inputK}k in / ${outputK}k out`;
}

/**
 * Fetch hourly/weekly remaining usage from Ollama Cloud API.
 *
 * NOTE: This endpoint is not yet documented. When Ollama publishes
 * the usage API, implement the actual fetch here.
 *
 * Expected endpoint: GET /v1/usage or similar
 * Expected response: { hourly_remaining: number, weekly_remaining: number }
 */
export async function fetchOllamaCloudQuota(
	apiKey: string,
	baseUrl: string = "https://ollama.com/api",
): Promise<{ hourlyRemaining: number; weeklyRemaining: number } | null> {
	// Placeholder: Once the real endpoint is known, implement:
	// const response = await fetch(`${baseUrl}/v1/usage`, {
	//   headers: { Authorization: `Bearer ${apiKey}` },
	// });
	// const data = await response.json();
	// return {
	//   hourlyRemaining: data.hourly_remaining,
	//   weeklyRemaining: data.weekly_remaining,
	// };

	// For now, return null to indicate quota info unavailable
	return null;
}
