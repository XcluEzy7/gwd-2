/**
 * Model definitions for NanoGPT providers.
 *
 * NanoGPT offers two tiers:
 * - Subscription tier: Models included in NanoGPT subscription (zero per-token cost)
 * - Pay-as-you-go tier: Premium models charged per token
 *
 * All models use `max_tokens` (not `max_completion_tokens`) per NanoGPT API spec.
 * The compat setting ensures correct parameter is sent.
 */

const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

const NANOGPT_COMPAT = {
    maxTokensField: "max_tokens" as const,
};

// Helper to format cost (convert from per-million to per-token)
const costPerMillion = (prompt: number, completion: number) => ({
    input: prompt,
    output: completion,
    cacheRead: 0,
    cacheWrite: 0,
});

// ============================================================================
// SUBSCRIPTION MODELS (included in NanoGPT subscription)
// ============================================================================

export const NANOGPT_SUBSCRIPTION_MODELS = [
    // Open-source reasoning model with MoE architecture
    {
        id: "openai/gpt-oss-120b",
        name: "[SUB] GPT-OSS 120B",
        reasoning: true,
        input: ["text"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 128_000,
        maxTokens: 16_384,
        compat: NANOGPT_COMPAT,
    },
    // Qwen coding specialist
    {
        id: "qwen/qwen3-coder",
        name: "[SUB] Qwen3 Coder 480B",
        reasoning: false,
        input: ["text"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 262_000,
        maxTokens: 65_536,
        compat: NANOGPT_COMPAT,
    },
    // Llama 4 multimodal - best in class for its size
    {
        id: "meta-llama/llama-4-maverick",
        name: "[SUB] Llama 4 Maverick",
        reasoning: false,
        input: ["text", "image"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 1_048_576,
        maxTokens: 65_536,
        compat: NANOGPT_COMPAT,
    },
    // Llama 4 Scout - 10M context window
    {
        id: "meta-llama/llama-4-scout",
        name: "[SUB] Llama 4 Scout",
        reasoning: false,
        input: ["text", "image"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 328_000,
        maxTokens: 65_536,
        compat: NANOGPT_COMPAT,
    },
    // Kimi K2.5 Thinking - multimodal reasoning
    {
        id: "moonshotai/kimi-k2.5:thinking",
        name: "[SUB] Kimi K2.5 Thinking",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 256_000,
        maxTokens: 65_536,
        compat: NANOGPT_COMPAT,
    },
    // Mistral Small 4 - multimodal reasoning
    {
        id: "mistralai/mistral-small-4-119b-2603",
        name: "[SUB] Mistral Small 4 119B",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 262_144,
        maxTokens: 16_384,
        compat: NANOGPT_COMPAT,
    },
    // DeepSeek V3 Chat
    {
        id: "deepseek-chat",
        name: "[SUB] DeepSeek V3 Chat",
        reasoning: false,
        input: ["text"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 128_000,
        maxTokens: 8_192,
        compat: NANOGPT_COMPAT,
    },
    // MiniMax M2.5 - reasoning model
    {
        id: "minimax/minimax-m2.5",
        name: "[SUB] MiniMax M2.5",
        reasoning: true,
        input: ["text"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 204_800,
        maxTokens: 131_072,
        compat: NANOGPT_COMPAT,
    },
    // Qwen3 Coder 30B A3B - efficient coding model
    {
        id: "qwen3-coder-30b-a3b-instruct",
        name: "[SUB] Qwen3 Coder 30B",
        reasoning: false,
        input: ["text"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 128_000,
        maxTokens: 65_536,
        compat: NANOGPT_COMPAT,
    },
    // Qwen3 235B A22B - large MoE
    {
        id: "Qwen/Qwen3-235B-A22B",
        name: "[SUB] Qwen3 235B A22B",
        reasoning: false,
        input: ["text"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 41_000,
        maxTokens: 32_768,
        compat: NANOGPT_COMPAT,
    },
    // Qwen3 Next 80B A3B
    {
        id: "Qwen/Qwen3-Next-80B-A3B-Instruct",
        name: "[SUB] Qwen3 Next 80B",
        reasoning: false,
        input: ["text"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 256_000,
        maxTokens: 262_144,
        compat: NANOGPT_COMPAT,
    },
    // MiniMax M2.7 - reasoning
    {
        id: "minimax/minimax-m2.7",
        name: "[SUB] MiniMax M2.7",
        reasoning: true,
        input: ["text"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 204_800,
        maxTokens: 131_072,
        compat: NANOGPT_COMPAT,
    },
    // GLM 4.6
    {
        id: "z-ai/glm-4.6",
        name: "[SUB] GLM 4.6",
        reasoning: true,
        input: ["text"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 200_000,
        maxTokens: 65_535,
        compat: NANOGPT_COMPAT,
    },
    // GLM 5
    {
        id: "zai-org/glm-5",
        name: "[SUB] GLM 5",
        reasoning: true,
        input: ["text"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 200_000,
        maxTokens: 128_000,
        compat: NANOGPT_COMPAT,
    },
    // GLM 5 Thinking
    {
        id: "zai-org/glm-5:thinking",
        name: "[SUB] GLM 5 Thinking",
        reasoning: true,
        input: ["text"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 200_000,
        maxTokens: 128_000,
        compat: NANOGPT_COMPAT,
    },
    // GLM 4.7 Flash - fast
    {
        id: "zai-org/glm-4.7-flash",
        name: "[SUB] GLM 4.7 Flash",
        reasoning: true,
        input: ["text"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 200_000,
        maxTokens: 128_000,
        compat: NANOGPT_COMPAT,
    },
    // DeepSeek V3.2 Thinking
    {
        id: "deepseek/deepseek-v3.2:thinking",
        name: "[SUB] DeepSeek V3.2 Thinking",
        reasoning: true,
        input: ["text"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 163_000,
        maxTokens: 65_536,
        compat: NANOGPT_COMPAT,
    },
    // GLM 4.5 Air Thinking
    {
        id: "zai-org/GLM-4.5-Air:thinking",
        name: "[SUB] GLM 4.5 Air Thinking",
        reasoning: true,
        input: ["text"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 128_000,
        maxTokens: 98_304,
        compat: NANOGPT_COMPAT,
    },
    // Holo3 multimodal reasoning
    {
        id: "holo3-35b-a3b",
        name: "[SUB] Holo3 35B",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 65_536,
        maxTokens: 65_536,
        compat: NANOGPT_COMPAT,
    },
    // Nvidia Nemotron 3 Super 120B
    {
        id: "nvidia/nemotron-3-super-120b-a12b",
        name: "[SUB] Nemotron 3 120B",
        reasoning: true,
        input: ["text"] as ("text" | "image")[],
        cost: ZERO_COST,
        contextWindow: 262_144,
        maxTokens: 16_384,
        compat: NANOGPT_COMPAT,
    },
];

// ============================================================================
// PAID MODELS (pay-as-you-go, billed per token)
// ============================================================================

export const NANOGPT_PAID_MODELS = [
    // Claude Sonnet Latest
    {
        id: "anthropic/claude-sonnet-latest",
        name: "[$] Claude Sonnet Latest",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: costPerMillion(2.992, 14.994),
        contextWindow: 1_000_000,
        maxTokens: 128_000,
        compat: NANOGPT_COMPAT,
    },
    // GPT 5.4
    {
        id: "openai/gpt-5.4",
        name: "[$] GPT 5.4",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: costPerMillion(2.5, 15),
        contextWindow: 922_000,
        maxTokens: 128_000,
        compat: NANOGPT_COMPAT,
    },
    // GPT 5.4 Mini
    {
        id: "openai/gpt-5.4-mini",
        name: "[$] GPT 5.4 Mini",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: costPerMillion(0.75, 4.5),
        contextWindow: 400_000,
        maxTokens: 128_000,
        compat: NANOGPT_COMPAT,
    },
    // GPT 5.4 Nano
    {
        id: "openai/gpt-5.4-nano",
        name: "[$] GPT 5.4 Nano",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: costPerMillion(0.2, 1.25),
        contextWindow: 400_000,
        maxTokens: 128_000,
        compat: NANOGPT_COMPAT,
    },
    // GPT 5.2
    {
        id: "openai/gpt-5.2",
        name: "[$] GPT 5.2",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: costPerMillion(1.75, 14),
        contextWindow: 400_000,
        maxTokens: 128_000,
        compat: NANOGPT_COMPAT,
    },
    // GPT 5.2 Codex
    {
        id: "openai/gpt-5.2-codex",
        name: "[$] GPT 5.2 Codex",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: costPerMillion(1.75, 14),
        contextWindow: 400_000,
        maxTokens: 128_000,
        compat: NANOGPT_COMPAT,
    },
    // GPT 5
    {
        id: "openai/gpt-5",
        name: "[$] GPT 5",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: costPerMillion(1.25, 10),
        contextWindow: 400_000,
        maxTokens: 128_000,
        compat: NANOGPT_COMPAT,
    },
    // Gemini 3.1 Pro
    {
        id: "google/gemini-3.1-pro-preview",
        name: "[$] Gemini 3.1 Pro",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: costPerMillion(2, 12),
        contextWindow: 1_048_756,
        maxTokens: 65_536,
        compat: NANOGPT_COMPAT,
    },
    // Gemini 3 Flash
    {
        id: "google/gemini-3-flash-preview",
        name: "[$] Gemini 3 Flash",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: costPerMillion(0.5, 3),
        contextWindow: 1_048_756,
        maxTokens: 65_536,
        compat: NANOGPT_COMPAT,
    },
    // Grok 4.20
    {
        id: "x-ai/grok-4.20",
        name: "[$] Grok 4.20",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: costPerMillion(2, 6),
        contextWindow: 2_000_000,
        maxTokens: 131_072,
        compat: NANOGPT_COMPAT,
    },
    // Grok 4.1 Fast
    {
        id: "x-ai/grok-4.1-fast",
        name: "[$] Grok 4.1 Fast",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: costPerMillion(0.2, 0.5),
        contextWindow: 2_000_000,
        maxTokens: 131_072,
        compat: NANOGPT_COMPAT,
    },
    // Claude 4.6 Opus
    {
        id: "anthropic/claude-opus-4.6",
        name: "[$] Claude 4.6 Opus",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: costPerMillion(4.998, 25.007),
        contextWindow: 1_000_000,
        maxTokens: 128_000,
        compat: NANOGPT_COMPAT,
    },
    // Claude 4.6 Opus Thinking
    {
        id: "anthropic/claude-opus-4.6:thinking",
        name: "[$] Claude 4.6 Opus Thinking",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: costPerMillion(4.998, 25.007),
        contextWindow: 1_000_000,
        maxTokens: 128_000,
        compat: NANOGPT_COMPAT,
    },
    // OpenAI o3-mini
    {
        id: "openai/o3-mini",
        name: "[$] o3-mini",
        reasoning: true,
        input: ["text"] as ("text" | "image")[],
        cost: costPerMillion(1.1, 4.4),
        contextWindow: 200_000,
        maxTokens: 100_000,
        compat: NANOGPT_COMPAT,
    },
    // OpenAI o3-mini High
    {
        id: "openai/o3-mini-high",
        name: "[$] o3-mini (High)",
        reasoning: true,
        input: ["text"] as ("text" | "image")[],
        cost: costPerMillion(0.64, 2.588),
        contextWindow: 200_000,
        maxTokens: 100_000,
        compat: NANOGPT_COMPAT,
    },
    // Claude Haiku Latest
    {
        id: "anthropic/claude-haiku-latest",
        name: "[$] Claude Haiku Latest",
        reasoning: true,
        input: ["text", "image"] as ("text" | "image")[],
        cost: costPerMillion(1, 5),
        contextWindow: 200_000,
        maxTokens: 64_000,
        compat: NANOGPT_COMPAT,
    },
];