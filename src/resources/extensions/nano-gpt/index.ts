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
import { getProviderRuntimeBaseUrl } from "../shared/provider-contracts.js";
import { NANOGPT_SUBSCRIPTION_MODELS, NANOGPT_PAID_MODELS } from "./models.js";

export default function nanoGpt(pi: ExtensionAPI) {
    // Register subscription-tier provider (models included in NanoGPT subscription)
    pi.registerProvider("nano-gpt", {
        apiKey: "NANOGPT_API_KEY",
        api: "openai-completions",
        baseUrl: getProviderRuntimeBaseUrl("nano-gpt"),
        models: NANOGPT_SUBSCRIPTION_MODELS,
    });

    // Register pay-as-you-go tier (premium models, charged per token)
    pi.registerProvider("nano-gpt-payg", {
        apiKey: "NANOGPT_API_KEY",
        api: "openai-completions",
        baseUrl: getProviderRuntimeBaseUrl("nano-gpt-payg"),
        models: NANOGPT_PAID_MODELS,
    });
}