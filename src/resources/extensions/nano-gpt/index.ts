/**
 * NanoGPT Provider Extension
 *
 * Registers NanoGPT as a model provider via the native pi.registerProvider() API.
 * NanoGPT is an OpenAI-compatible API aggregator offering access to multiple LLM
 * providers through a unified interface.
 *
 * Two provider tiers:
 * - nano-gpt: Subscription tier (models included in NanoGPT subscription)
 * - nano-gpt-payg: Pay-as-you-go tier (premium models, charged per token)
 *
 * Both tiers share the same API key (NANOGPT_API_KEY).
 */

import type { ExtensionAPI } from "@gsd/pi-coding-agent";
import { getProviderContract } from "../shared/provider-contracts.js";
import { NANOGPT_PAID_MODELS, NANOGPT_SUBSCRIPTION_MODELS } from "./models.js";

export default function nanoGpt(pi: ExtensionAPI) {
	const subscriptionContract = getProviderContract("nano-gpt");
	const paygContract = getProviderContract("nano-gpt-payg");

	// Register subscription-tier provider (models included in NanoGPT subscription)
	pi.registerProvider("nano-gpt", {
		apiKey: subscriptionContract.envVar,
		api: subscriptionContract.runtimeApi,
		baseUrl: subscriptionContract.runtimeBaseUrl,
		models: NANOGPT_SUBSCRIPTION_MODELS,
	});

	// Register pay-as-you-go tier (premium models, charged per token)
	pi.registerProvider("nano-gpt-payg", {
		apiKey: paygContract.envVar,
		api: paygContract.runtimeApi,
		baseUrl: paygContract.runtimeBaseUrl,
		models: NANOGPT_PAID_MODELS,
	});
}
