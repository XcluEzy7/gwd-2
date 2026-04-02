/**
 * Native Ollama /api/chat streaming provider.
 *
 * Speaks Ollama's native protocol (not the OpenAI compatibility shim).
 * Routes requests through the local daemon (if signed in) or directly
 * to https://ollama.com/api with an API key.
 */

import {
	getProviderRuntimeBaseUrlForCredential,
	shouldSendAuthorizationHeader,
} from "../../../../src/resources/extensions/shared/provider-contracts.js";
import { getEnvApiKey } from "../env-api-keys.js";
import { calculateCost } from "../models.js";
import type {
	AssistantMessage,
	Context,
	Model,
	SimpleStreamOptions,
	StreamFunction,
	StreamOptions,
	TextContent,
	ThinkingContent,
	Tool,
	ToolCall,
} from "../types.js";
import { AssistantMessageEventStream } from "../utils/event-stream.js";
import { parseStreamingJson } from "../utils/json-parse.js";
import { buildBaseOptions } from "./simple-options.js";

const DEFAULT_OLLAMA_HOST = "http://localhost:11434";

interface OllamaChatOptions extends StreamOptions {
	keepAlive?: string;
	numCtx?: number;
}

function getLocalOllamaHost(): string {
	const host = process.env.OLLAMA_HOST;
	if (!host) return DEFAULT_OLLAMA_HOST;
	if (host.startsWith("http://") || host.startsWith("https://")) return host;
	return `http://${host}`;
}

function getBaseUrl(model: Model<"ollama-chat">, apiKey?: string): string {
	if (model.baseUrl) return model.baseUrl;
	return getProviderRuntimeBaseUrlForCredential("ollama-cloud", apiKey);
}

function buildHeaders(
	apiKey: string | undefined,
	model: Model<"ollama-chat">,
): Record<string, string> {
	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (shouldSendAuthorizationHeader("ollama-cloud", apiKey)) {
		headers.Authorization = `Bearer ${apiKey}`;
	}
	if (model.headers) {
		Object.assign(headers, model.headers);
	}
	return headers;
}

interface OllamaMessage {
	role: "system" | "user" | "assistant" | "tool";
	content: string;
	thinking?: string;
	images?: string[];
	tool_calls?: Array<{
		function: { name: string; arguments: Record<string, unknown> };
	}>;
}

interface OllamaTool {
	type: "function";
	function: {
		name: string;
		description: string;
		parameters: Record<string, unknown>;
	};
}

function convertMessages(context: Context): OllamaMessage[] {
	const result: OllamaMessage[] = [];

	if (context.systemPrompt) {
		result.push({ role: "system", content: context.systemPrompt });
	}

	for (const msg of context.messages) {
		if (msg.role === "user") {
			const textParts: string[] = [];
			const images: string[] = [];
			const content = msg.content;
			if (typeof content === "string") {
				textParts.push(content);
			} else {
				for (const block of content) {
					if (block.type === "text") {
						textParts.push(block.text);
					} else if (block.type === "image" && "data" in block && block.data) {
						images.push(block.data);
					}
				}
			}
			const ollamaMsg: OllamaMessage = {
				role: "user",
				content: textParts.join("\n"),
			};
			if (images.length > 0) ollamaMsg.images = images;
			result.push(ollamaMsg);
		} else if (msg.role === "assistant") {
			const assistantMsg = msg as AssistantMessage;
			const textParts: string[] = [];
			const thinkingParts: string[] = [];
			const toolCalls: Array<{
				function: { name: string; arguments: Record<string, unknown> };
			}> = [];
			for (const block of assistantMsg.content) {
				if (block.type === "text") {
					textParts.push(block.text);
				} else if (block.type === "thinking" && block.thinking) {
					thinkingParts.push(block.thinking);
				} else if (block.type === "toolCall") {
					const tc = block as ToolCall;
					toolCalls.push({
						function: {
							name: tc.name,
							arguments:
								typeof tc.arguments === "string"
									? JSON.parse(tc.arguments)
									: tc.arguments,
						},
					});
				}
			}
			const ollamaMsg: OllamaMessage = {
				role: "assistant",
				content: textParts.join("\n"),
			};
			if (thinkingParts.length > 0)
				ollamaMsg.thinking = thinkingParts.join("\n\n");
			if (toolCalls.length > 0) ollamaMsg.tool_calls = toolCalls;
			result.push(ollamaMsg);
		} else if (msg.role === "toolResult") {
			result.push({
				role: "tool",
				content:
					typeof msg.content === "string"
						? msg.content
						: JSON.stringify(msg.content),
			});
		}
	}
	return result;
}

function convertTools(tools: Tool[]): OllamaTool[] {
	return tools.map((tool) => ({
		type: "function" as const,
		function: {
			name: tool.name,
			description: tool.description || "",
			parameters: tool.parameters || { type: "object", properties: {} },
		},
	}));
}

function buildInitialOutput(model: Model<"ollama-chat">): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: "ollama-chat",
		provider: model.provider,
		model: model.id,
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
	};
}

export const streamOllamaChat: StreamFunction<
	"ollama-chat",
	OllamaChatOptions
> = (
	model: Model<"ollama-chat">,
	context: Context,
	options?: OllamaChatOptions,
): AssistantMessageEventStream => {
	const stream = new AssistantMessageEventStream();

	(async () => {
		const output = buildInitialOutput(model);

		try {
			const apiKey = options?.apiKey || getEnvApiKey(model.provider) || "";
			const baseUrl = getBaseUrl(model, apiKey);
			const headers = buildHeaders(apiKey, model);
			if (options?.headers) Object.assign(headers, options.headers);

			const body: Record<string, unknown> = {
				model: model.id,
				messages: convertMessages(context),
				stream: true,
			};

			if (context.tools && context.tools.length > 0) {
				body.tools = convertTools(context.tools);
			}

			const runtimeOptions: Record<string, unknown> = {};
			if (options?.temperature !== undefined)
				runtimeOptions.temperature = options.temperature;
			if (options?.maxTokens) runtimeOptions.num_predict = options.maxTokens;
			if (options?.numCtx) runtimeOptions.num_ctx = options.numCtx;
			if (model.contextWindow)
				runtimeOptions.num_ctx = runtimeOptions.num_ctx ?? model.contextWindow;
			if (Object.keys(runtimeOptions).length > 0) body.options = runtimeOptions;

			if (options?.keepAlive) {
				body.keep_alive = options.keepAlive;
			}

			const nextBody = await options?.onPayload?.(body, model);
			const finalBody = nextBody !== undefined ? nextBody : body;

			const response = await fetch(`${baseUrl}/chat`, {
				method: "POST",
				headers,
				body: JSON.stringify(finalBody),
				signal: options?.signal,
			});

			if (!response.ok) {
				const text = await response.text();
				throw new Error(`Ollama API returned ${response.status}: ${text}`);
			}

			if (!response.body) {
				throw new Error("Ollama API returned no body");
			}

			stream.push({ type: "start", partial: output });

			const reader = response.body.getReader();
			const decoder = new TextDecoder();
			let buffer = "";
			let currentBlock:
				| TextContent
				| ThinkingContent
				| (ToolCall & { partialArgs?: string })
				| null = null;
			const blocks = output.content;
			const blockIndex = () => blocks.length - 1;

			const finishCurrentBlock = (block?: typeof currentBlock) => {
				if (block) {
					if (block.type === "text") {
						stream.push({
							type: "text_end",
							contentIndex: blockIndex(),
							content: block.text,
							partial: output,
						});
					} else if (block.type === "thinking") {
						stream.push({
							type: "thinking_end",
							contentIndex: blockIndex(),
							content: block.thinking,
							partial: output,
						});
					} else if (block.type === "toolCall") {
						block.arguments = parseStreamingJson(block.partialArgs);
						delete block.partialArgs;
						stream.push({
							type: "toolcall_end",
							contentIndex: blockIndex(),
							toolCall: block,
							partial: output,
						});
					}
				}
			};

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split("\n");
				buffer = lines.pop() ?? "";

				for (const line of lines) {
					const trimmed = line.trim();
					if (!trimmed) continue;

					let chunk: Record<string, unknown>;
					try {
						chunk = JSON.parse(trimmed);
					} catch {
						continue;
					}

					const message = chunk.message as
						| {
								role?: string;
								content?: string;
								thinking?: string;
								tool_calls?: unknown[];
						  }
						| undefined;
					const isDone = chunk.done === true;

					if (isDone) {
						const promptTokens = (chunk.prompt_eval_count as number) || 0;
						const evalTokens = (chunk.eval_count as number) || 0;
						output.usage = {
							input: promptTokens,
							output: evalTokens,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: promptTokens + evalTokens,
							cost: {
								input: 0,
								output: 0,
								cacheRead: 0,
								cacheWrite: 0,
								total: 0,
							},
						};
						calculateCost(model, output.usage);

						if (chunk.done_reason === "stop") {
							output.stopReason = "stop";
						} else if (chunk.done_reason === "length") {
							output.stopReason = "length";
						}
					}

					if (message?.thinking) {
						const thinking = message.thinking as string;
						if (!currentBlock || currentBlock.type !== "thinking") {
							finishCurrentBlock(currentBlock);
							currentBlock = { type: "thinking", thinking: "" };
							output.content.push(currentBlock);
							stream.push({
								type: "thinking_start",
								contentIndex: blockIndex(),
								partial: output,
							});
						}

						if (currentBlock.type === "thinking") {
							currentBlock.thinking += thinking;
							stream.push({
								type: "thinking_delta",
								contentIndex: blockIndex(),
								delta: thinking,
								partial: output,
							});
						}
					}

					if (message?.content) {
						const content = message.content as string;
						if (!currentBlock || currentBlock.type !== "text") {
							finishCurrentBlock(currentBlock);
							currentBlock = { type: "text", text: "" };
							output.content.push(currentBlock);
							stream.push({
								type: "text_start",
								contentIndex: blockIndex(),
								partial: output,
							});
						}

						if (currentBlock.type === "text") {
							currentBlock.text += content;
							stream.push({
								type: "text_delta",
								contentIndex: blockIndex(),
								delta: content,
								partial: output,
							});
						}
					}

					if (message?.tool_calls && Array.isArray(message.tool_calls)) {
						for (const tc of message.tool_calls) {
							const fn = (
								tc as { function?: { name?: string; arguments?: unknown } }
							).function;
							if (!fn?.name) continue;

							finishCurrentBlock(currentBlock);
							const toolCall: ToolCall & { partialArgs?: string } = {
								type: "toolCall",
								id: `call_${fn.name}_${Date.now()}`,
								name: fn.name,
								arguments: fn.arguments ?? {},
								partialArgs: JSON.stringify(fn.arguments ?? {}),
							};
							currentBlock = toolCall;
							output.content.push(toolCall);
							stream.push({
								type: "toolcall_start",
								contentIndex: blockIndex(),
								partial: output,
							});
							finishCurrentBlock(currentBlock);
							currentBlock = null;
							output.stopReason = "toolUse";
						}
					}
				}
			}

			if (buffer.trim()) {
				try {
					const chunk = JSON.parse(buffer.trim());
					if (chunk.done) {
						const promptTokens = (chunk.prompt_eval_count as number) || 0;
						const evalTokens = (chunk.eval_count as number) || 0;
						output.usage = {
							input: promptTokens,
							output: evalTokens,
							cacheRead: 0,
							cacheWrite: 0,
							totalTokens: promptTokens + evalTokens,
							cost: {
								input: 0,
								output: 0,
								cacheRead: 0,
								cacheWrite: 0,
								total: 0,
							},
						};
						calculateCost(model, output.usage);
					}
				} catch {
					/* ignore */
				}
			}

			finishCurrentBlock(currentBlock);
			stream.end(output);
		} catch (error) {
			const errorMessage =
				error instanceof Error ? error.message : String(error);
			output.stopReason = "error";
			output.errorMessage = errorMessage;
			stream.push({ type: "error", reason: "error", error: output });
			stream.end(output);
		}
	})();

	return stream;
};

export const streamSimpleOllamaChat: StreamFunction<
	"ollama-chat",
	SimpleStreamOptions
> = (
	model: Model<"ollama-chat">,
	context: Context,
	options?: SimpleStreamOptions,
): AssistantMessageEventStream => {
	const apiKey = options?.apiKey || getEnvApiKey(model.provider);
	const base = buildBaseOptions(model, options, apiKey);
	return streamOllamaChat(model, context, base);
};
