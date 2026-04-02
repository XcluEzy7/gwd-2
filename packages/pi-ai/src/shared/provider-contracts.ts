export type CanonicalProviderId = "nano-gpt" | "nano-gpt-payg" | "ollama-cloud";

export type ProviderAuthMode = "api-key";
export type ProviderProbeFailureKind =
	| "auth"
	| "endpoint"
	| "timeout"
	| "invalid_response"
	| "http"
	| "network";

export interface ProviderProbeDefinition {
	url: string;
	method: "GET" | "POST";
	timeoutMs: number;
	authHeader: "bearer" | "optional-bearer";
	redactInErrors: string[];
	expectedResponseShape: "openai-model-list";
}

export interface ProviderContract {
	id: CanonicalProviderId;
	envVar: string;
	sharedKeyGroup: string;
	authMode: ProviderAuthMode;
	runtimeApi: "openai-completions" | "ollama-chat";
	runtimeBaseUrl: string;
	discovery: {
		supported: boolean;
		targetUrl?: string;
		responseShape?: "openai-model-list";
		cacheTtlMs?: number;
	};
	probe?: ProviderProbeDefinition;
}

export interface ProviderProbeFailure {
	provider: CanonicalProviderId;
	kind: ProviderProbeFailureKind;
	status?: number;
	message: string;
	redactInErrors: string[];
}

const OLLAMA_CLOUD_BASE_URL = "https://ollama.com/api";
const NANOGPT_SUBSCRIPTION_BASE_URL =
	"https://nano-gpt.com/api/subscription/v1";
const NANOGPT_PAYG_BASE_URL = "https://nano-gpt.com/api/v1";

export const CANONICAL_PROVIDER_CONTRACTS: Record<
	CanonicalProviderId,
	ProviderContract
> = {
	"nano-gpt": {
		id: "nano-gpt",
		envVar: "NANOGPT_API_KEY",
		sharedKeyGroup: "nanogpt",
		authMode: "api-key",
		runtimeApi: "openai-completions",
		runtimeBaseUrl: NANOGPT_SUBSCRIPTION_BASE_URL,
		discovery: {
			supported: false,
		},
		probe: {
			url: `${NANOGPT_SUBSCRIPTION_BASE_URL}/models`,
			method: "GET",
			timeoutMs: 15_000,
			authHeader: "bearer",
			redactInErrors: ["authorization", "bearer", "nano-gpt", "api-key"],
			expectedResponseShape: "openai-model-list",
		},
	},
	"nano-gpt-payg": {
		id: "nano-gpt-payg",
		envVar: "NANOGPT_API_KEY",
		sharedKeyGroup: "nanogpt",
		authMode: "api-key",
		runtimeApi: "openai-completions",
		runtimeBaseUrl: NANOGPT_PAYG_BASE_URL,
		discovery: {
			supported: false,
		},
		probe: {
			url: `${NANOGPT_PAYG_BASE_URL}/models`,
			method: "GET",
			timeoutMs: 15_000,
			authHeader: "bearer",
			redactInErrors: ["authorization", "bearer", "nano-gpt", "api-key"],
			expectedResponseShape: "openai-model-list",
		},
	},
	"ollama-cloud": {
		id: "ollama-cloud",
		envVar: "OLLAMA_API_KEY",
		sharedKeyGroup: "ollama-cloud",
		authMode: "api-key",
		runtimeApi: "ollama-chat",
		runtimeBaseUrl: OLLAMA_CLOUD_BASE_URL,
		discovery: {
			supported: true,
			targetUrl: `${OLLAMA_CLOUD_BASE_URL}/v1/models`,
			responseShape: "openai-model-list",
			cacheTtlMs: 60 * 60 * 1000,
		},
		probe: {
			url: `${OLLAMA_CLOUD_BASE_URL}/v1/models`,
			method: "GET",
			timeoutMs: 15_000,
			authHeader: "optional-bearer",
			redactInErrors: ["authorization", "bearer", "ollama", "api-key"],
			expectedResponseShape: "openai-model-list",
		},
	},
} as const;

export function isCanonicalProviderId(
	value: string,
): value is CanonicalProviderId {
	return value in CANONICAL_PROVIDER_CONTRACTS;
}

export function getProviderContract(providerId: string): ProviderContract {
	if (!isCanonicalProviderId(providerId)) {
		throw new Error(`Unknown canonical provider contract: ${providerId}`);
	}
	return CANONICAL_PROVIDER_CONTRACTS[providerId];
}

export function getProviderRuntimeBaseUrl(
	providerId: CanonicalProviderId,
): string {
	return CANONICAL_PROVIDER_CONTRACTS[providerId].runtimeBaseUrl;
}

export function getProviderDiscoveryTarget(
	providerId: CanonicalProviderId,
): string {
	const target = CANONICAL_PROVIDER_CONTRACTS[providerId].discovery.targetUrl;
	if (!target) {
		throw new Error(`Provider ${providerId} has no discovery target URL`);
	}
	return target;
}

export function getProviderProbe(
	providerId: CanonicalProviderId,
): ProviderProbeDefinition {
	const probe = CANONICAL_PROVIDER_CONTRACTS[providerId].probe;
	if (!probe) {
		throw new Error(`Provider ${providerId} has no probe endpoint configured`);
	}
	return probe;
}

export function getProviderDiscoveryTtl(
	providerId: CanonicalProviderId,
): number | undefined {
	return CANONICAL_PROVIDER_CONTRACTS[providerId].discovery.cacheTtlMs;
}

export function classifyProbeFailure(
	providerId: CanonicalProviderId,
	input: {
		status?: number;
		timedOut?: boolean;
		malformed?: boolean;
		message?: string;
	},
): ProviderProbeFailure {
	const probe = getProviderProbe(providerId);
	if (input.timedOut) {
		return {
			provider: providerId,
			kind: "timeout",
			message: `${providerId} probe timed out after ${probe.timeoutMs}ms`,
			redactInErrors: probe.redactInErrors,
		};
	}
	if (input.malformed) {
		return {
			provider: providerId,
			kind: "invalid_response",
			message: `${providerId} probe returned an unexpected response shape`,
			redactInErrors: probe.redactInErrors,
		};
	}
	if (input.status === 401 || input.status === 403) {
		return {
			provider: providerId,
			kind: "auth",
			status: input.status,
			message: `${providerId} probe rejected credentials (${input.status})`,
			redactInErrors: probe.redactInErrors,
		};
	}
	if (input.status === 404) {
		return {
			provider: providerId,
			kind: "endpoint",
			status: input.status,
			message: `${providerId} probe endpoint was not found (404)`,
			redactInErrors: probe.redactInErrors,
		};
	}
	if (input.status !== undefined) {
		return {
			provider: providerId,
			kind: "http",
			status: input.status,
			message: `${providerId} probe returned HTTP ${input.status}`,
			redactInErrors: probe.redactInErrors,
		};
	}
	return {
		provider: providerId,
		kind: "network",
		message: input.message
			? `${providerId} probe failed: ${input.message}`
			: `${providerId} probe failed`,
		redactInErrors: probe.redactInErrors,
	};
}
