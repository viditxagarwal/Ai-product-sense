# AI Agent Studio — Complete Enhancement Specification

**Purpose**: This document is the single source of truth for every feature, capability, setting, architectural pattern, and enhancement that must exist in the AI Agent Studio web application. Give this to Claude Code along with the existing codebase. Claude Code should analyse what exists, identify what's missing, and implement everything described here.

**How to use this document**: Read the entire codebase first. Then go through each section below. For every item, check if the codebase already implements it. If not, implement it. If partially implemented, complete it. If implemented differently than described, flag it for review.

---

## TABLE OF CONTENTS

1. [SECTION A: Execution Data Model — Every Atom of Data the System Must Capture](#section-a)
2. [SECTION B: Every Configuration Setting — All Knobs, All Values, All Effects](#section-b)
3. [SECTION C: Execution Inspector — Every UI Rendering Element](#section-c)
4. [SECTION D: Real-Time Streaming Architecture — SSE, WebSocket, Polling](#section-d)
5. [SECTION E: Tool Integration Architecture — Postman, API Calls, Mapping Layer](#section-e)
6. [SECTION F: Routing & Conditional Edge Architecture](#section-f)
7. [SECTION G: Dynamic Event Schema — Database Design](#section-g)
8. [SECTION H: Auto-Rendering Rules — What the UI Shows Based on Data Present](#section-h)
9. [SECTION I: PM-Configurable Display Settings](#section-i)
10. [SECTION J: Side-by-Side Comparison Engine](#section-j)
11. [SECTION K: Implementation Sequence — All Phases](#section-k)
12. [SECTION L: Glossary & Reference Tables](#section-l)

---

<a id="section-a"></a>
## SECTION A: Execution Data Model — Every Atom of Data the System Must Capture

The system produces data at five nested layers. Every field below MUST be captured, stored, and available for rendering. If the backend does not emit these fields, add them. If the database schema does not store them, add columns or use JSONB.

### Layer 1: The LLM Call (most granular unit)

Every single API call to an LLM provider produces ALL of these fields. A single node execution may make MULTIPLE LLM calls (ReAct/inner loop). Each call is a separate record.

| # | Field Name | Type | Description | Required | Notes |
|---|-----------|------|-------------|----------|-------|
| 1.1 | `model_id` | string | Exact model string called. Examples: `"gpt-4o-2024-08-06"`, `"claude-sonnet-4-20250514"`, `"claude-opus-4-0-20250415"`, `"gpt-4o-mini-2024-07-18"`, `"claude-haiku-4-5-20251001"`, `"gemini-2.0-flash"` | Always | Must store the EXACT version string, not just "gpt-4o". Different versions have different capabilities, pricing, and behavior. |
| 1.2 | `provider` | string | API provider. Values: `"openai"`, `"anthropic"`, `"google"`, `"azure"`, `"bedrock"`, `"together"`, `"groq"`, `"fireworks"`, `"mistral"`, `"cohere"` | Always | Needed for cost calculation (pricing differs by provider even for same model via Bedrock vs direct). |
| 1.3 | `input_messages` | array of objects | The FULL message array sent to the API. Each message has `role` (system/user/assistant/tool) and `content`. | Always | This is the most important debugging field. The PM must be able to see EXACTLY what was sent to the model. Store the complete array, not a summary. Can be large (tens of KB). |
| 1.4 | `input_tokens` | integer | Number of prompt/input tokens as reported by the API response. | Always | Returned in API response body (e.g., `usage.prompt_tokens` for OpenAI, `usage.input_tokens` for Anthropic). NOT estimated — use the actual API-reported count. |
| 1.5 | `output_tokens` | integer | Number of completion/output tokens as reported by the API response. | Always | Returned in API response body (`usage.completion_tokens` for OpenAI, `usage.output_tokens` for Anthropic). |
| 1.6 | `total_tokens` | integer | Sum of input_tokens + output_tokens + thinking_tokens. | Always | Compute this. Do NOT just use `usage.total_tokens` from OpenAI as it doesn't include thinking tokens for reasoning models. |
| 1.7 | `thinking_tokens` | integer | Tokens spent on extended thinking / chain-of-thought. | Conditional | **When this exists**: Only when the model supports extended thinking AND thinking is ENABLED in the configuration. For Anthropic: set via `thinking.budget_tokens` parameter. For OpenAI o-series: always on but controllable via `reasoning_effort` (low/medium/high). **When this is 0 or null**: Thinking is OFF in config, or model doesn't support it. **WHO CONTROLS THIS**: The PM controls the on/off switch and the budget ceiling. The model decides how many tokens to actually use within that ceiling. **Values**: 0 to budget_tokens ceiling (Anthropic max: 128K). Typical range: 1,000 - 32,000 depending on task complexity. |
| 1.8 | `cache_read_tokens` | integer | Tokens served from prompt cache (already processed in a recent identical request). | Conditional | **When this exists**: Only when prompt caching is active. Anthropic: requires `cache_control` breakpoints in messages. OpenAI: automatic for identical prefixes. **HOW CACHING WORKS**: When a large portion of the prompt (system prompt, conversation history) is identical to a recent request, the provider serves those tokens from cache instead of reprocessing them. Cache has a TTL (Anthropic: ~5 minutes). **COST IMPACT**: Cached tokens cost ~10% of normal input tokens (90% discount). **WHO CONTROLS THIS**: The developer/platform controls whether cache_control markers are placed in the API request. The provider decides whether a cache hit actually occurs based on TTL and prompt similarity. **Values**: 0 to input_tokens. High values = good (saving money). |
| 1.9 | `cache_write_tokens` | integer | Tokens written TO cache for future reuse (first request with this prompt prefix). | Conditional | **When this exists**: Same conditions as cache_read_tokens. On the FIRST request with a new prompt prefix, tokens are written to cache (slightly more expensive than normal). Subsequent identical requests read from cache. **COST IMPACT**: Cache write tokens cost ~1.25x normal input tokens. But the investment pays off if the same prompt is used multiple times within the TTL. **Values**: 0 to input_tokens. |
| 1.10 | `output_text` | string | The raw text portion of the LLM's response (the actual generated content). | Always | May be empty string if the LLM only produced tool calls and no text. Store the full text, not truncated. |
| 1.11 | `thinking_text` | string | The raw extended thinking / reasoning content (the model's internal chain-of-thought). | Conditional | Only exists if thinking is enabled AND the model produced thinking content. **IMPORTANT**: This is the model's scratchpad. It shows WHY the model made decisions. Extremely valuable for debugging. Can be very long (thousands of words). Anthropic returns this in a `thinking` content block. |
| 1.12 | `tool_calls_requested` | array of objects | Tool/function calls the LLM wants to make. Each object: `{ tool_name: string, tool_id: string, arguments: JSON }` | Conditional | Only exists if the LLM decided to call tools. The `arguments` field is the JSON the LLM generated for the tool's parameters. **IMPORTANT**: The LLM generates the arguments — they may be malformed, missing required fields, or have wrong types. This is a common failure mode. Store the raw arguments exactly as the LLM generated them. |
| 1.13 | `stop_reason` | string | Why the LLM stopped generating. | Always | **VALUES AND THEIR MEANING**: `"end_turn"` — Model naturally finished its response. This is the happy path. The response is complete. `"tool_use"` — Model stopped because it wants to call a tool. The response contains tool_calls_requested. Your system must execute the tool and send results back. `"max_tokens"` — Model hit the max_output_tokens limit. THE RESPONSE IS TRUNCATED. This is usually a problem — the PM should increase max_output_tokens or simplify the task. FLAG THIS IN THE UI WITH A WARNING. `"stop_sequence"` — Model generated a stop sequence you specified. Rarely used in modern products. `"content_filter"` — Provider's safety filter blocked the response. The output may be empty or partial. FLAG THIS IN THE UI WITH A WARNING. **WHO CONTROLS THIS**: Nobody directly controls stop_reason. It's determined by the API based on what happened during generation. But the PM indirectly influences it by setting max_output_tokens (which can cause max_tokens), binding tools (which enables tool_use), and setting stop sequences. |
| 1.14 | `cost_usd` | float | Dollar cost of this single API call. | Computable | **HOW TO COMPUTE**: `(input_tokens × input_price_per_token) + (output_tokens × output_price_per_token) + (thinking_tokens × thinking_price_per_token) + (cache_read_tokens × cache_read_price_per_token) + (cache_write_tokens × cache_write_price_per_token)`. Prices differ by model and provider. Must maintain a pricing table. See Section L for current pricing. |
| 1.15 | `latency_ms` | integer | Total wall-clock time from request sent to last byte received. | Always | Measure this on the client/server side, not from API response. Includes network latency. |
| 1.16 | `time_to_first_token_ms` | integer | Time from request sent to first streaming token received (TTFT). | Conditional | Only in streaming mode. This is the perceived latency — how long the user waits before seeing anything. Lower is better. Typical values: 200-800ms for fast models, 1-5 seconds for reasoning models with thinking. |
| 1.17 | `tokens_per_second` | float | Output generation speed. | Computable | Compute: `output_tokens / ((latency_ms - time_to_first_token_ms) / 1000)`. Typical values: 30-100 tok/s for cloud models, 5-20 tok/s for reasoning models during thinking. |
| 1.18 | `temperature` | float | Temperature setting used for this call. | Always | **VALUES**: 0.0 to 2.0 (OpenAI), 0.0 to 1.0 (Anthropic). **EFFECT**: 0.0 = deterministic (always picks highest probability token). 0.1-0.3 = highly focused, good for factual extraction, classification, structured output. 0.5-0.7 = balanced, good for general conversation. 0.8-1.0 = creative, good for brainstorming, creative writing. 1.0-2.0 = very random, rarely useful in production. **DEFAULT**: OpenAI default is 1.0. Anthropic default is 1.0. Most production systems use 0.0-0.3. |
| 1.19 | `top_p` | float | Nucleus sampling setting. | Conditional | **VALUES**: 0.0 to 1.0. **EFFECT**: Only considers tokens whose cumulative probability reaches top_p%. 0.9 = consider top 90% of probability mass. 1.0 = consider all tokens (disabled). **USAGE**: Alternative to temperature. Usually leave at 1.0 and tune temperature instead. OpenAI recommends changing EITHER temperature OR top_p, not both. |
| 1.20 | `max_output_tokens` | integer | Maximum tokens the model can generate in this call. | Conditional | **VALUES**: 1 to model's maximum. **MODEL MAXIMUMS**: GPT-4o: 16,384 output tokens. GPT-4o-mini: 16,384 output tokens. Claude Sonnet 4: 16,384 output tokens (with extended output: 64,000). Claude Opus 4: 32,000 output tokens. Claude Haiku 3.5: 8,192 output tokens. o1/o3: varies by model. **COST IMPACT**: Setting lower doesn't reduce cost directly (you pay for actual tokens generated, not the limit). But it prevents runaway generation. If the model hits this limit, stop_reason will be "max_tokens" and the response is truncated. **PRODUCTION TIP**: Set this to the maximum reasonable output for the use case. A classifier needs 10-50 tokens. A summary needs 500-2000. A report needs 2000-8000. Don't set to model maximum unless needed. |
| 1.21 | `system_prompt` | string | The system message content. | Conditional | May be very long (thousands of tokens for detailed instructions). This is the most tunable element — small changes here have massive effects on behavior. Store the full text. |
| 1.22 | `request_id` | string | Provider's request ID for debugging. | Always | Returned in response headers. Anthropic: `request-id` header. OpenAI: `x-request-id` header. Essential for debugging provider-side issues. |
| 1.23 | `logprobs` | array | Per-token log probabilities. | Conditional | Only if logprobs were requested (OpenAI only, not Anthropic). Shows the model's confidence for each token. Useful for confidence scoring but increases response size. |
| 1.24 | `content_filter_flags` | object | Content filtering results. | Conditional | If content filtering triggered. OpenAI returns categories and severity. Anthropic returns a stop_reason of content_filter. |
| 1.25 | `is_retry` | boolean | Whether this call is a retry of a failed previous call. | Conditional | true if a previous call to the same model for the same purpose failed and this is the retry attempt. |
| 1.26 | `retry_reason` | string | Why the previous call failed. | Conditional | **VALUES**: `"rate_limit"` — Provider returned 429 Too Many Requests. `"timeout"` — Request timed out. `"api_error"` — Provider returned 500/502/503. `"content_filter"` — Previous response was blocked. `"malformed_tool_call"` — LLM generated invalid tool call arguments. `"context_length_exceeded"` — Input was too long for the model's context window. |
| 1.27 | `retry_attempt` | integer | Which retry attempt this is (1, 2, 3...). | Conditional | Combined with retry_reason, tells the PM about reliability issues. If retry_attempt is consistently > 0, there's a systemic problem. |

### Layer 2: The Tool Execution

Every time a tool is invoked — either by the LLM requesting it (tool_use) or by a tool-only node running directly — these fields are produced.

| # | Field Name | Type | Description | Required | Notes |
|---|-----------|------|-------------|----------|-------|
| 2.1 | `tool_name` | string | The tool's identifier. Examples: `"web_search"`, `"document_reader"`, `"code_interpreter"`, `"postman_api_call"`, `"calculator"`, `"vector_search"` | Always | This is the programmatic name, not the display name. |
| 2.2 | `tool_display_name` | string | Human-friendly name. Examples: `"Web Search"`, `"Document Reader"`, `"Postman API Call"` | Conditional | From tool registry. If not set, derive from tool_name by replacing underscores and capitalizing. |
| 2.3 | `tool_category` | string | Grouping. Values: `"retrieval"`, `"computation"`, `"external_api"`, `"file_system"`, `"communication"`, `"database"`, `"code_execution"`, `"custom"` | Conditional | From tool registry. Used for filtering and grouping in the UI. |
| 2.4 | `input_arguments` | object (JSON) | The arguments/parameters passed to the tool. | Always | This is the exact JSON sent to the tool function. For Postman tools, this includes the mapped payload. For LLM-triggered tools, this is what the LLM generated (from 1.12). |
| 2.5 | `input_summary` | string | Human-readable one-liner. Examples: `"Search for: 'Swiggy Q4 revenue'"`, `"Read document: annual_report_2025.pdf"`, `"POST https://api.internal.com/valuations"` | Computable | Generate from input_arguments automatically. Show the key parameter (search query, file name, URL). |
| 2.6 | `output_result` | any (JSON/string) | The raw output returned by the tool. | Always | May be a JSON object, a string, an error object, or binary reference. Store the full output (can be large — tens of KB for search results or document content). |
| 2.7 | `output_summary` | string | Truncated/summarized version for display. | Computable | First 200 characters of text output, or key fields of JSON output. The full output is available on drill-down. |
| 2.8 | `output_type` | string | What kind of output. Values: `"text"`, `"json"`, `"image"`, `"file"`, `"table"`, `"error"`, `"html"`, `"binary"` | Computable | Infer from the output_result content. |
| 2.9 | `output_size_bytes` | integer | Size of the output payload in bytes. | Computable | Compute from JSON serialization of output_result. Important for understanding data volume flowing through the workflow. |
| 2.10 | `status` | string | Execution status. Values: `"success"`, `"error"`, `"timeout"`, `"rate_limited"`, `"auth_error"`, `"validation_error"` | Always | |
| 2.11 | `error_message` | string | Error description. | Conditional | Only if status != success. Human-readable error message. |
| 2.12 | `error_type` | string | Error category. Values: `"api_error"` (external API returned error), `"auth_error"` (authentication/authorization failed), `"timeout"` (tool took too long), `"validation"` (input arguments invalid), `"not_found"` (resource not found), `"rate_limit"` (external API rate limited), `"network_error"` (connection failed), `"parse_error"` (couldn't parse response) | Conditional | |
| 2.13 | `duration_ms` | integer | Wall-clock execution time in milliseconds. | Always | Includes network latency for external API calls. |
| 2.14 | `external_calls` | array of objects | HTTP calls made BY the tool to external services. Each object: `{ url: string, method: string (GET/POST/PUT/DELETE), status_code: integer, latency_ms: integer, request_size_bytes: integer, response_size_bytes: integer }` | Conditional | **WHAT THIS MEANS**: A tool is a function that runs on YOUR server. That function may make HTTP calls to external services. For example, a `web_search` tool calls the Google Search API. A `postman_api_call` tool calls the enterprise's internal API. A `vector_search` tool calls a Pinecone/Weaviate endpoint. An `embedding` tool calls OpenAI's embedding API. `external_calls` tracks those inner HTTP calls. **WHY IT MATTERS**: If a tool is slow, this tells you whether it's the tool's own logic or the external API that's slow. If a tool fails, this tells you which external call failed. |
| 2.15 | `tokens_consumed` | integer | If the tool itself consumed LLM tokens internally. | Conditional | Example: a retriever tool that calls an embedding API to vectorize the query consumes embedding tokens. A summarizer tool might call a cheap LLM internally. These are separate from the parent node's LLM calls. |
| 2.16 | `cost_usd` | float | External API cost of this tool execution. | Conditional | Includes: external API call costs, embedding token costs, any per-call pricing from third-party services. Does NOT include the parent LLM call cost (that's in Layer 1). |
| 2.17 | `cache_hit` | boolean | Whether the tool result was served from cache. | Conditional | **WHAT THIS MEANS**: YOUR system (not the external API) implemented caching around tool calls. If someone ran `web_search("Swiggy revenue")` 2 minutes ago, your system stored the result and returned it without making the actual API call again. **WHY IT MATTERS**: Explains why a tool call was instantaneous (cache hit) vs slow (actual API call). Saves cost. **WHO IMPLEMENTS THIS**: You build this into your tool execution layer. The external API doesn't report this. |
| 2.18 | `retry_count` | integer | Number of retries before success/failure. | Conditional | If the tool's external call failed and was retried. |
| 2.19 | `artifacts_produced` | array of objects | Files, images, or documents created by the tool. Each object: `{ type: string, name: string, size_bytes: integer, url: string }` | Conditional | Example: a code_interpreter tool might produce a chart image. A report_generator tool might produce a PDF. |
| 2.20 | `triggered_by` | string | How this tool was invoked. Values: `"llm_tool_call"` (LLM requested it via tool_use), `"direct_execution"` (tool-only node, no LLM), `"postman_integration"` (called via Postman tool) | Always | Determines the parent-child relationship in the span tree. |

### Layer 3: The Node / Step Execution

A node is one box on the workflow canvas. Its execution is the AGGREGATE of potentially multiple LLM calls and tool executions inside it.

| # | Field Name | Type | Description | Required |
|---|-----------|------|-------------|----------|
| 3.1 | `node_id` | string | Canvas node identifier | Always |
| 3.2 | `node_label` | string | Human name from canvas (e.g., "Research Agent", "Format Output") | Always |
| 3.3 | `node_type` | string | Values: `"node"`, `"gate"`, `"split"`, `"start"`, `"end"` | Always |
| 3.4 | `component_config` | object (JSON) | SNAPSHOT of node config at execution time — llmEnabled, systemPrompt, boundTools, model, temperature, max_output_tokens, thinking_enabled, thinking_budget, input_context_source, etc. CRITICAL for debugging — shows what was configured when this execution ran, even if config changed since. | Always |
| 3.5 | `input_context` | any | What was passed into this node — previous step output, user message, custom context, assembled message array | Always |
| 3.6 | `input_context_source` | string | Values: `"user_message"`, `"previous_step"`, `"full_history"`, `"custom"` | Always |
| 3.7 | `output_result` | any | Final output of this node after all inner loops completed | Always |
| 3.8 | `output_format` | string | Values: `"text"`, `"json"`, `"structured"`, `"binary"`, `"markdown"`, `"table"` | Computable |
| 3.9 | `status` | string | Values: `"running"`, `"completed"`, `"error"`, `"timeout"`, `"skipped"`, `"waiting_human"`, `"cancelled"` | Always |
| 3.10 | `duration_ms` | integer | Total wall-clock time for this node (includes all inner LLM calls and tool executions) | Always |
| 3.11 | `llm_calls` | array | All Layer 1 records for LLM calls within this node (the inner loop) | Conditional |
| 3.12 | `llm_call_count` | integer | Number of LLM API calls made (inner loop iterations). 0 for tool-only nodes. | Always |
| 3.13 | `tool_executions` | array | All Layer 2 records for tool calls within this node | Conditional |
| 3.14 | `tool_call_count` | integer | Number of tool invocations. 0 if no tools called. | Always |
| 3.15 | `total_input_tokens` | integer | Sum of input_tokens across all LLM calls in this node | Computable |
| 3.16 | `total_output_tokens` | integer | Sum of output_tokens across all LLM calls in this node | Computable |
| 3.17 | `total_tokens` | integer | Grand total tokens consumed by this node | Computable |
| 3.18 | `total_cost_usd` | float | Sum of all LLM + tool costs in this node | Computable |
| 3.19 | `model_used` | string | Primary model used (may differ from config if fallback triggered) | Conditional |
| 3.20 | `thinking_summary` | string | Condensed reasoning from extended thinking (if enabled) | Conditional |
| 3.21 | `error_details` | object | `{ error_type, error_message, stack_trace, failed_at (llm_call/tool/routing) }` | Conditional |
| 3.22 | `retry_attempts` | integer | How many times this node was retried | Conditional |
| 3.23 | `is_loop_iteration` | boolean | Whether this execution is a loop repeat | Conditional |
| 3.24 | `loop_iteration_number` | integer | Which iteration (1, 2, 3...) | Conditional |
| 3.25 | `edge_taken` | object | `{ edge_id, target_node_id, condition_method, condition_evaluated, condition_result (true/false), evaluation_detail }` — which outgoing edge was followed and why | Conditional |
| 3.26 | `annotations` | array | Human-added notes (from Gate reviews, PM annotations) | Conditional |
| 3.27 | `started_at` | timestamp | ISO 8601 timestamp when execution started | Always |
| 3.28 | `finished_at` | timestamp | ISO 8601 timestamp when execution completed | Always |

### Layer 4: The Workflow / Harness Execution

The full end-to-end run of the workflow for one user message.

| # | Field Name | Type | Description | Required |
|---|-----------|------|-------------|----------|
| 4.1 | `execution_id` | string (UUID) | Unique run identifier | Always |
| 4.2 | `workflow_id` | string | Which workflow was executed | Always |
| 4.3 | `workflow_version` | string/hash | Snapshot of the workflow graph structure at execution time | Always |
| 4.4 | `trigger` | string | Values: `"user_message"`, `"api_call"`, `"scheduled"`, `"webhook"`, `"test_run"`, `"comparison_run"` | Always |
| 4.5 | `user_input` | string | The original user message/input | Always |
| 4.6 | `final_output` | string | The final response delivered to the user | Always |
| 4.7 | `steps_executed` | array | Ordered list of Layer 3 records | Always |
| 4.8 | `step_count` | integer | Total nodes executed (including loop iterations) | Computable |
| 4.9 | `path_taken` | array of strings | Sequence of node_ids in execution order | Always |
| 4.10 | `edges_taken` | array of objects | Sequence of edges followed, with condition evaluation results | Always |
| 4.11 | `branches_executed` | object | For split nodes: which parallel branches ran, their individual results and durations | Conditional |
| 4.12 | `total_duration_ms` | integer | End-to-end wall clock time | Always |
| 4.13 | `total_llm_calls` | integer | Sum across all nodes | Computable |
| 4.14 | `total_tool_calls` | integer | Sum across all nodes | Computable |
| 4.15 | `total_tokens` | integer | Grand total tokens | Computable |
| 4.16 | `total_cost_usd` | float | Grand total cost | Computable |
| 4.17 | `status` | string | Values: `"running"`, `"completed"`, `"error"`, `"timeout"`, `"cancelled"` | Always |
| 4.18 | `error_node_id` | string | Which node caused the failure | Conditional |
| 4.19 | `config_snapshot` | object (JSON) | FULL configuration settings at execution time — model, temperature, all knobs | Always |
| 4.20 | `human_interventions` | array | Gate approvals/rejections with timestamps, reviewer, action, comment | Conditional |

### Layer 5: The Stream (Live Execution Events)

These are ephemeral — they exist only while execution is happening. They're events pushed to the client in real-time via SSE/WebSocket.

| # | Field Name | Type | Description | Required |
|---|-----------|------|-------------|----------|
| 5.1 | `event_type` | string | Values: `"step_started"`, `"step_completed"`, `"llm_chunk"`, `"tool_started"`, `"tool_completed"`, `"thinking_started"`, `"thinking_chunk"`, `"error"`, `"status_update"`, `"gate_waiting"`, `"gate_resolved"` | Always |
| 5.2 | `current_node_label` | string | Which node is executing right now | During execution |
| 5.3 | `current_action` | string | Human-readable status. Values: `"Thinking..."`, `"Calling [tool_name]..."`, `"Generating response..."`, `"Waiting for approval..."`, `"Retrying..."`, `"Processing tool results..."` | During execution |
| 5.4 | `text_delta` | string | Incremental text chunk (for streaming output) | During LLM text generation |
| 5.5 | `thinking_delta` | string | Incremental thinking chunk | During extended thinking |
| 5.6 | `progress_pct` | float | Estimated completion percentage (0.0 to 1.0) | If estimable |
| 5.7 | `tokens_so_far` | integer | Running token count | During execution |
| 5.8 | `cost_so_far` | float | Running cost | During execution |
| 5.9 | `elapsed_ms` | integer | Time since execution started | During execution |
| 5.10 | `steps_completed` | integer | How many nodes have finished | During execution |
| 5.11 | `steps_remaining` | integer | Estimated nodes left (may change if conditional paths) | If estimable |
| 5.12 | `tool_partial_result` | any | Intermediate tool output (e.g., search results streaming in) | If tool supports streaming |

---

<a id="section-b"></a>
## SECTION B: Every Configuration Setting — All Knobs, All Values, All Effects

These are the settings the PM/user can configure per-node or per-workflow. Each setting must have a UI control, validation, and documented effect on execution.

### B.1: Context Configuration (Dimension 1 — What Goes In)

| Setting | UI Control | Possible Values | Default | Effect on Execution | Where in UI |
|---------|-----------|----------------|---------|-------------------|-------------|
| `system_prompt` | Multi-line text editor with syntax highlighting, variable interpolation support (`{{variable}}`), character/token counter | Free text, up to 100K characters | Empty | Defines personality, instructions, constraints, output format. Longer prompt = more input tokens per LLM call = higher cost. Changes here affect ALL LLM calls in the node. | Node Inspector → Prompt section |
| `input_context_source` | Dropdown | `"user_message"` — only the current user message. `"previous_step"` — output from the immediately preceding node. `"full_history"` — entire conversation history (all turns). `"custom"` — template-based assembly with variables. | `"user_message"` | Controls how much context the node sees. `full_history` = most expensive but complete. `user_message` = cheapest but no continuity. `previous_step` = common for chained nodes. | Node Inspector → Context dropdown |
| `custom_context_template` | Template editor with variable picker | Template string with `{{variables}}` like `{{user_message}}`, `{{previous_output}}`, `{{step_N_output}}`, `{{conversation_summary}}` | Empty | Only active when input_context_source = "custom". Lets PM precisely control what goes into the node context. | Node Inspector → Custom field (shown when "custom" selected) |
| `rag_top_k` | Number input with slider | 1 to 50 | 5 | Number of documents retrieved from knowledge base. More docs = more context = better answers but more input tokens. Each doc typically 200-1000 tokens. | Tool config when retriever tool is bound |
| `rag_source` | Dropdown/multi-select of knowledge bases | List of configured knowledge bases | None | Which document collections are searchable. Different sources have different content. | Tool config |
| `conversation_history_window` | Number input | 0 to 100 (number of messages) or "all" | 10 | How many previous messages to include in context. 0 = no history (stateless). "all" = entire conversation (expensive for long conversations). | Configuration settings → Memory section |
| `include_tool_results_in_context` | Toggle | true / false | true | Whether results from tool calls are included in the LLM context for re-evaluation. When false, tool results go directly to output without LLM processing. | Node Inspector → Advanced |

### B.2: Generation Parameters (Dimension 2 — How It Thinks)

| Setting | UI Control | Possible Values | Default | Effect on Execution | Where in UI |
|---------|-----------|----------------|---------|-------------------|-------------|
| `model` | Dropdown with model cards (showing price, speed, capability tier) | **Anthropic**: `claude-opus-4` (smartest, $15/$75 per M tokens in/out), `claude-sonnet-4` (balanced, $3/$15), `claude-haiku-3.5` (fastest, $0.80/$4). **OpenAI**: `gpt-4o` (flagship, $2.50/$10), `gpt-4o-mini` (fast/cheap, $0.15/$0.60), `o1` (reasoning, $15/$60), `o3` (latest reasoning, $10/$40), `o3-mini` (cheap reasoning, $1.10/$4.40), `o4-mini` (newest reasoning, $1.10/$4.40). **Google**: `gemini-2.0-flash` ($0.10/$0.40), `gemini-2.5-pro` ($1.25/$10). **Note**: Prices are per 1M tokens as of May 2025 and should be maintained in a pricing config. | `claude-sonnet-4` | Bigger model = smarter but slower and more expensive. Model choice is the SINGLE BIGGEST cost lever. Switching from claude-opus-4 to claude-haiku-3.5 can reduce cost by 95%. The PM should use the cheapest model that produces acceptable quality for each node's task. | Configuration header (global default) + Node Inspector (per-node override) |
| `temperature` | Slider with labeled zones | 0.0 to 2.0 (OpenAI) or 0.0 to 1.0 (Anthropic). **Labeled zones**: 0.0 = "Deterministic", 0.1-0.3 = "Focused", 0.4-0.6 = "Balanced", 0.7-0.9 = "Creative", 1.0+ = "Experimental" | 1.0 (provider default, but most production systems use 0.0-0.3) | Lower = same input produces same output every time (testable, predictable). Higher = same input produces different outputs (needs multiple runs to evaluate). For classification/extraction: use 0.0. For conversation: use 0.3-0.7. For creative: use 0.7-1.0. | Node Inspector → Temperature slider |
| `max_output_tokens` | Number input with presets | 1 to model maximum. **Presets**: "Short response" (256), "Medium response" (1024), "Long response" (4096), "Full document" (8192), "Maximum" (model max), "Custom" (manual entry) | Model default (typically 4096) | Caps response length. If model hits this limit, stop_reason = "max_tokens" and response is truncated. Lower = cheaper (fewer output tokens possible), faster, but potentially incomplete. **CRITICAL**: Output tokens are 2-5x more expensive than input tokens for most models. This is the second biggest cost lever after model choice. | Node Inspector → Max Tokens |
| `top_p` | Slider | 0.0 to 1.0 | 1.0 | Nucleus sampling. Only considers tokens whose cumulative probability reaches top_p%. Usually leave at 1.0 and use temperature instead. Change EITHER temperature OR top_p, not both. | Node Inspector → Advanced settings |
| `thinking_enabled` | Toggle | true / false | false | Enables extended thinking / chain-of-thought. Model gets a scratchpad to reason before answering. Produces thinking_tokens (billable). **Only available for**: Claude models (via `thinking.budget_tokens`), OpenAI o-series (always on, controlled via `reasoning_effort`). **Effect**: Better answers for complex reasoning tasks. 2-10x more tokens consumed. 2-5x longer latency. | Configuration settings → Thinking section |
| `thinking_budget_tokens` | Number input | 1,024 to 128,000 (Anthropic) | 10,000 | Maximum tokens the model can use for thinking. The model may use fewer. Higher budget = more thorough reasoning = more cost. Only active when thinking_enabled = true. | Configuration settings → Thinking section |
| `reasoning_effort` | Dropdown | `"low"`, `"medium"`, `"high"` | `"medium"` | OpenAI o-series only. Controls how much effort the model puts into reasoning. "low" = fast/cheap, "high" = thorough/expensive. Analogous to thinking_budget_tokens for Anthropic. | Configuration settings → Thinking section (shown for OpenAI reasoning models) |
| `stop_sequences` | Tag input (add/remove strings) | Array of strings | Empty | Strings that make the model stop generating. When the model produces any of these strings, generation stops immediately. Use case: structured output where you want exactly one JSON object (stop at `}`). | Node Inspector → Advanced settings |
| `response_format` | Dropdown | `"text"` (free text), `"json_object"` (guaranteed valid JSON — OpenAI only), `"json_schema"` (structured output matching a schema) | `"text"` | Forces the model to produce output in a specific format. `json_object` guarantees valid JSON (no ```json``` wrapping). `json_schema` forces output to match a specific JSON schema. | Node Inspector → Output Format |
| `json_schema` | JSON schema editor | Valid JSON Schema object | None | Only active when response_format = "json_schema". Defines the exact structure the model must output. Used for structured extraction, classification, and data transformation tasks. | Node Inspector → Output Format → Schema editor |

### B.3: Tool Configuration (Dimension 3 — What It Can Do)

| Setting | UI Control | Possible Values | Default | Effect on Execution | Where in UI |
|---------|-----------|----------------|---------|-------------------|-------------|
| `llm_enabled` | Toggle | true / false | true | **true (LLM ON)**: Node has an LLM that can reason and call tools in a loop (ReAct pattern). Multiple LLM calls possible. More capable but more expensive. **false (LLM OFF)**: Node runs a single tool directly, no LLM reasoning. One tool call, deterministic, cheapest possible. | Node Inspector → LLM toggle |
| `bound_tools` | Multi-select from Tool Registry | List of available tools (web_search, document_reader, calculator, postman_api_call, code_interpreter, vector_search, custom tools) | Empty | Which tools the LLM can use. More tools = more options for the model = potentially more inner loop iterations = higher cost. Fewer tools = more constrained = more predictable. **IMPORTANT**: Each bound tool's schema is included in the LLM's input context, consuming tokens. 10 complex tools might add 2000+ tokens to every LLM call in this node. | Node Inspector → Tools section |
| `selected_tool` | Single-select from Tool Registry | One tool | None | Only active when llm_enabled = false. Which tool runs directly without LLM reasoning. | Node Inspector → Tool Selection (shown when LLM OFF) |
| `tool_max_iterations` | Number input | 1 to 20 | 10 | Maximum number of tool call iterations in the ReAct loop. Prevents infinite loops. If the LLM keeps calling tools without producing a final text response, this forces it to stop after N iterations. | Node Inspector → Advanced → Tool Settings |
| `parallel_tool_calls` | Toggle | true / false | true | Whether the LLM can request multiple tool calls in a single generation (parallel execution). When true, the model can say "call web_search AND calculator simultaneously." When false, one tool call per LLM turn. Parallel = faster wall-clock time, same token cost. | Node Inspector → Advanced → Tool Settings |

### B.4: Routing Configuration (Dimension 4 — How It Decides)

| Setting | UI Control | Possible Values | Default | Effect on Execution | Where in UI |
|---------|-----------|----------------|---------|-------------------|-------------|
| `edge_type` | Dropdown | `"flow"` (always follows this edge), `"conditional"` (evaluates a condition), `"loop"` (repeats, returns to source or earlier node) | `"flow"` | Controls whether the path is always taken, conditionally taken, or repeated. | Edge Inspector → Type dropdown |
| `condition_method` | Dropdown | **Level 1**: `"field_comparison"` — check a field in previous node's output against a value. **Level 2**: `"pattern_match"` — regex or keyword match on output text. **Level 3**: `"multi_condition"` — combine multiple conditions with AND/OR. **Level 4**: `"llm_evaluation"` — use a small LLM to evaluate a natural language condition. **Level 5**: `"webhook_function"` — call an external HTTP endpoint for the routing decision. `"always"` — always take this edge (used in split fan-out). | `"field_comparison"` | Rule-based (Levels 1-3) = free, instant, deterministic. LLM evaluation = costs tokens, slower, handles nuance. Webhook function = calls external logic. | Edge Inspector → Condition section |
| `condition_field` | Dropdown (populated from previous node's output schema) | Any field name from the previous node's output | None | For field_comparison: which output field to check. | Edge Inspector → Condition → Field dropdown |
| `condition_operator` | Dropdown | `"equals"`, `"not_equals"`, `"greater_than"`, `"less_than"`, `"greater_than_or_equal"`, `"less_than_or_equal"`, `"contains"`, `"not_contains"`, `"starts_with"`, `"ends_with"`, `"is_empty"`, `"is_not_empty"`, `"matches_regex"`, `"in_list"`, `"not_in_list"` | `"equals"` | For field_comparison and pattern_match. | Edge Inspector → Condition → Operator dropdown |
| `condition_value` | Text input / Number input (depending on operator) | Any value appropriate for the operator | None | The value to compare against. | Edge Inspector → Condition → Value input |
| `condition_rules` | Rule builder (add/remove rows, AND/OR toggle) | Array of `{ field, operator, value }` objects with `combinator: "AND" / "OR"` | Empty | For multi_condition: multiple rules evaluated together. First matching rule's edge is taken. | Edge Inspector → Condition → Rule Builder |
| `evaluation_prompt` | Text editor | Free text describing the evaluation question | None | For llm_evaluation: the prompt sent to the evaluator LLM. Example: "Given the user's question and the agent's response, is the response complete and accurate? Reply YES or NO." | Edge Inspector → Condition → Evaluation Prompt |
| `evaluation_model` | Dropdown | Same model list as node model, but emphasize cheap models | `"claude-haiku-3.5"` or `"gpt-4o-mini"` | Which model evaluates the condition. Use the cheapest model that can handle the evaluation. Routing evaluations are typically simple yes/no decisions. | Edge Inspector → Condition → Model |
| `evaluation_response_mapping` | Key-value editor | Map LLM response values to target nodes. Example: `"YES" → node_output`, `"NO" → node_retry` | None | For llm_evaluation: maps the evaluator's response to which edge to take. | Edge Inspector → Condition → Response Mapping |
| `webhook_url` | URL input | Valid HTTP(S) URL | None | For webhook_function: the external endpoint to call for routing decision. | Edge Inspector → Condition → Endpoint URL |
| `webhook_input_mapping` | Mapping table | Map previous node output fields to webhook request body fields | None | For webhook_function: how to construct the request payload from available data. | Edge Inspector → Condition → Input Mapping |
| `webhook_response_field` | Text input | Field name in webhook response that contains the routing decision | `"route"` | For webhook_function: which field in the response determines the route. | Edge Inspector → Condition → Response Field |
| `loop_max_iterations` | Number input | 1 to 50 | 5 | Maximum times a loop can repeat before forced exit. Prevents infinite loops. | Edge Inspector → Loop Control |
| `loop_exit_condition` | Same as condition configuration above | Same options as condition_method | None | When to exit the loop. Same UI as conditional edge configuration. | Edge Inspector → Loop Control → Exit Condition |
| `split_merge_strategy` | Dropdown | `"concatenate"` — join all branch outputs as a list. `"summarize"` — use an LLM to synthesize branch outputs into one response. `"best_of_n"` — pick the best branch output (by score or LLM evaluation). `"vote"` — majority vote across branches (for classification tasks). `"custom_merge"` — use a webhook for custom merge logic. `"first_completed"` — use the output of whichever branch finishes first. | `"concatenate"` | How parallel branch results are combined after a split. Summarize costs extra LLM tokens but produces cleaner output. | Split Node Inspector → Merge Strategy |

### B.5: Memory Configuration (Dimension 5 — What It Remembers)

| Setting | UI Control | Possible Values | Default | Effect on Execution | Where in UI |
|---------|-----------|----------------|---------|-------------------|-------------|
| `memory_strategy` | Dropdown | `"none"` — every message is independent. `"full_history"` — all messages included in context. `"sliding_window"` — last N messages. `"summary"` — periodically summarize and replace history. `"rag_memory"` — store messages in vector DB, retrieve relevant ones. `"structured"` — extract key facts, include in system prompt. | `"sliding_window"` | **none**: Cheapest per call, but no continuity. Good for one-shot tasks. **full_history**: Input tokens grow linearly with conversation length. Expensive for long conversations. **sliding_window**: Predictable cost, but may lose early context. **summary**: Extra LLM call to summarize periodically, but future calls are cheaper. **rag_memory**: Extra embedding + retrieval cost per turn, but only relevant context is included. **structured**: Extra extraction cost, but very compact representation. | Configuration settings → Memory section |
| `window_size` | Number input | 1 to 100 (messages) | 10 | For sliding_window: how many recent messages to keep. 5 = ~2 turns back. 20 = ~10 turns back. | Configuration settings → Memory → Window Size |
| `summary_frequency` | Number input | Every N messages (2-20) | 5 | For summary: how often to run the summarization LLM call. Lower = fresher summary but more LLM calls. | Configuration settings → Memory → Summary Frequency |
| `summary_model` | Dropdown | Same model list, emphasize cheap models | `"claude-haiku-3.5"` | For summary: which model summarizes. Always use the cheapest model. Summarization is a simple task. | Configuration settings → Memory → Summary Model |
| `cross_session_memory` | Toggle | true / false | false | Whether the agent remembers across different conversations / sessions. When true, extracted facts and summaries persist. | Configuration settings → Memory → Cross-Session |
| `fact_extraction_enabled` | Toggle | true / false | false | Whether to extract user preferences and facts (name, role, preferences) from conversations and store them. | Configuration settings → Memory → Fact Extraction |
| `fact_extraction_fields` | Tag input | List of fact categories to extract. Examples: `"user_name"`, `"company"`, `"preferences"`, `"goals"`, `"constraints"` | Empty | What kinds of facts to look for and remember. | Configuration settings → Memory → Fact Fields |

### B.6: Output & Streaming Configuration (Dimension 6 — How It Communicates)

| Setting | UI Control | Possible Values | Default | Effect on Execution | Where in UI |
|---------|-----------|----------------|---------|-------------------|-------------|
| `streaming_mode` | Dropdown | `"off"` — batch mode, wait for complete response then display. `"text_only"` — stream the output text token by token. `"text_and_thinking"` — stream both output and thinking content. `"text_and_tools"` — stream text + show tool calls as they happen. `"full"` — stream text + thinking + tool calls + status updates. | `"text_only"` | **off**: User sees nothing, then complete result. Simplest to implement. **text_only**: Words appear one by one. Standard for chat products. **text_and_thinking**: Shows the model's reasoning process in real-time (collapsible). **text_and_tools**: Shows "Calling web_search..." with spinner, then result. **full**: Everything visible in real-time. Most transparent but most complex. | Configuration settings → Streaming section |
| `chain_of_thought_visibility` | Dropdown | `"hidden"` — thinking content not shown to user. `"collapsed"` — shown in a collapsible block, collapsed by default. `"expanded"` — shown in a collapsible block, expanded by default. | `"collapsed"` | Whether the model's extended thinking / reasoning is visible. Hidden = cleaner UX. Collapsed = available on demand. Expanded = full transparency. | Configuration settings → Streaming → Thinking Display |
| `output_format` | Dropdown | `"freetext"` — unformatted text. `"markdown"` — rendered markdown. `"structured_json"` — formatted JSON viewer. `"table"` — rendered as table. `"custom_template"` — formatted using a template. | `"markdown"` | How the final output is rendered to the user. | Configuration settings or per-node override |
| `intermediate_results_visibility` | Dropdown | `"hidden"` — only final workflow output shown. `"collapsed"` — each step's output available on click. `"expanded"` — all step outputs shown inline. | `"collapsed"` | Whether output from intermediate steps (not just the final node) is visible to the user. | Configuration settings → Output section |
| `citation_style` | Dropdown | `"none"`, `"inline"` (sources in parentheses), `"footnotes"` (numbered references), `"linked"` (clickable source links) | `"none"` | How sources/references are shown in the output. Only applicable when tools retrieve information (RAG, web search). | Configuration settings → Output section |
| `progress_display` | Dropdown | `"none"` — no progress indication. `"status_line"` — single line updating with current action. `"step_checklist"` — to-do style list checking off steps. `"progress_bar"` — estimated completion bar. `"activity_log"` — timestamped event feed. | `"status_line"` | How execution progress is communicated during streaming. | Configuration settings → Streaming → Progress |

---

<a id="section-c"></a>
## SECTION C: Execution Inspector — Every UI Rendering Element

These are the UI components that render execution data. Each element uses specific data atoms from Section A. The Inspector must implement ALL of these.

### C.1: Summary Indicators (always-visible metrics bar)

| ID | Element | What it Renders | Data Fields Used | UI Implementation |
|----|---------|----------------|-----------------|-------------------|
| A1 | Token Badge | Total tokens in compact badge: "1.2K tokens" or "12,340 tokens" | 4.15 | Pill/badge component. Show abbreviated (1.2K, 45.3K) for large numbers. Tooltip shows exact count. |
| A2 | Cost Badge | Dollar cost: "$0.03" or "$1.24" | 4.16 | Pill/badge component. Green if < $0.01, yellow if $0.01-$0.10, orange if $0.10-$1.00, red if > $1.00. Tooltip shows cost breakdown by model. |
| A3 | Duration Badge | Wall-clock time: "1.2s" or "45s" or "2m 10s" | 4.12 | Pill/badge component. Green if < 3s, yellow if 3-10s, orange if 10-30s, red if > 30s. |
| A4 | Step Count Badge | "3 steps" or "5 nodes executed" | 4.8 | Pill/badge component. |
| A5 | LLM Call Count | "7 LLM calls" — reveals the inner loop | 4.13 | Pill/badge component. If llm_calls > step_count × 2, add amber warning (model is looping heavily). |
| A6 | Tool Call Count | "4 tool calls" | 4.14 | Pill/badge component with tool icon. |
| A7 | Status Pill | Colored pill: green "completed", red "error", amber "running", blue "waiting" | 4.17 | Status pill component with appropriate color coding. |
| A8 | Model Tag | Which model: "claude-sonnet-4" | 3.19 | Tag component with model provider icon (Anthropic, OpenAI, Google logos). |
| A9 | Token Split | Input vs output split: "850 in / 340 out" | 3.15, 3.16 | Dual-value display. Show thinking tokens separately if present: "850 in / 340 out / 2.1K thinking". |
| A10 | Cache Indicator | "32% cached" or cache hit icon | 1.8, 1.9 | Show percentage of input tokens served from cache. Green if > 50% cached (good cost savings). Tooltip explains cache savings in dollars. |

### C.2: Timeline & Flow Visualizations

| ID | Element | What it Renders | Data Fields Used | UI Implementation |
|----|---------|----------------|-----------------|-------------------|
| B1 | Step Pills (horizontal) | Colored pills in a row: ● START → ● Research → ● Format → ● END. Color indicates status (green=completed, red=error, amber=running, gray=skipped). | 4.9, 3.3, 3.9 | Horizontal pill sequence with connecting arrows. Clickable — clicking a pill scrolls to that step's detail panel. Active step pulses during execution. |
| B2 | Waterfall / Timing Bar | Horizontal bars showing start time + duration for each step, stacked vertically. Reveals parallel execution and bottlenecks. Each bar labeled with node name and duration. | 3.27, 3.28, 3.10 | Gantt-style chart. Each bar's width proportional to duration. Bars for parallel branches shown at the same vertical position. Color intensity indicates token consumption. |
| B3 | Span Tree | Nested tree: Workflow → Node → LLM Call → Tool Call. Collapsible. Each level shows duration + tokens. | All layers | Collapsible tree component. Each node shows: name, duration, tokens, status icon. Indent level indicates nesting depth. Click to expand/collapse. |
| B4 | Path Highlight on Canvas | Animate the actual path taken through the workflow graph — highlight edges in execution order, dim unused paths. | 4.9, 4.10 | Canvas overlay. Executed edges get highlighted stroke (thicker, colored). Unexecuted edges dimmed. Animate edges in sequence on replay. |
| B5 | Loop Counter Overlay | On looping nodes, show "iteration 2/5" as an overlay badge on the canvas node. | 3.23, 3.24 | Small badge overlay on canvas node (top-right corner). Shows current/max iterations. |
| B6 | Parallel Branch View | Side-by-side columns showing each branch of a split node running simultaneously. | 4.11 | Multi-column layout inside the step detail panel for split nodes. Each column shows one branch's execution. |
| B7 | Edge Condition Log | On each edge, show whether condition evaluated true/false and why. | 3.25, 4.10 | Popover on edge click/hover showing: condition method, field checked, value compared, result (true/false), evaluation detail. |

### C.3: Step Detail Panels

| ID | Element | What it Renders | Data Fields Used | UI Implementation |
|----|---------|----------------|-----------------|-------------------|
| C1 | Input/Output Accordion | Collapsible sections: "Input" shows what went in (context, messages), "Output" shows what came out (text, JSON). | 3.5, 3.7 | Accordion component with two sections. Input shows the assembled context (formatted messages). Output shows the final node output. Both support JSON formatting, syntax highlighting, and copy button. |
| C2 | System Prompt Viewer | Shows the exact system prompt sent, with syntax highlighting and copy button. | 1.21, 3.4 | Collapsible code viewer with syntax highlighting. Show character count and token estimate. Copy button. |
| C3 | Tool Call Cards | Each tool call as a card: tool icon + name, input args (collapsible JSON), output result (collapsible), duration badge, status badge. | 2.1-2.20 | Card component per tool call. Header: tool icon, display name, status pill, duration badge. Body (collapsible): input arguments (formatted JSON), output result (formatted, truncated with "show more"), external calls (if any). Error state: red border, error message prominently displayed. |
| C4 | LLM Call Timeline | Within one node, show each LLM API call in sequence. Reveals the inner tool_call loop: Call 1 → Tool → Call 2 → Tool → Call 3 (final). | 3.11 | Vertical timeline within the node detail panel. Each LLM call is a card showing: call number, model, tokens (in/out/thinking), stop_reason, duration. Between LLM call cards, show tool call cards (C3). This reveals the ReAct loop visually. |
| C5 | Thinking Block | Collapsible block showing the LLM's chain-of-thought / extended thinking content. | 1.11 | Collapsible block with distinct styling (light purple/gray background). Show thinking text with proper formatting. Collapsed by default. Show thinking token count in the header. |
| C6 | Config Snapshot | What settings were active for this node at execution time. | 3.4 | Table or key-value list: model, temperature, max_tokens, thinking enabled/budget, tools bound, system prompt (truncated with expand), input context source. |
| C7 | Error Detail Panel | Red-bordered panel: error type, error message, stack trace (collapsible), retry attempts, which API call failed. | 3.21, 3.22, 1.25-1.27 | Red border, warning icon. Prominent error message. Collapsible stack trace. If retries happened, show retry timeline (attempt 1: failed at X, attempt 2: failed at Y, attempt 3: succeeded). |
| C8 | Token Breakdown Table | Per-LLM-call table: model, input tokens, output tokens, thinking tokens, cache read tokens, cache write tokens, cost. Totals row at bottom. | 1.1-1.14 | Data table component. One row per LLM call within the node. Columns: #, Model, Input Tokens, Output Tokens, Thinking Tokens, Cache Read, Cache Write, Cost, Latency. Footer row: Totals. |
| C9 | Raw Messages Viewer | The actual messages array sent to the LLM API, formatted as a chat transcript (system/user/assistant/tool roles). | 1.3 | Chat-style message viewer. Each message shows role badge (system=purple, user=blue, assistant=green, tool=orange) and content. Collapsible. Copy button for the raw JSON. |
| C10 | Diff View | Before/after comparison for nodes that transform content. | 3.5, 3.7 | Side-by-side or inline diff view. Highlight added (green) and removed (red) content. Useful for nodes that edit, format, or transform text. |
| C11 | Annotation Panel | Human comments, ratings, or feedback attached to this step. | 3.26 | Comment thread UI. Each annotation shows: author, timestamp, text, optional rating (1-5 stars). Add annotation button for PM to leave notes. |

### C.4: Live Streaming Elements

| ID | Element | What it Renders | Data Fields Used | UI Implementation |
|----|---------|----------------|-----------------|-------------------|
| D1 | Status Line | Single line updating: "Thinking..." → "Calling Web Search..." → "Generating response..." | 5.2, 5.3 | Animated text with subtle loading indicator. Updates in real-time as events arrive. |
| D2 | Streaming Text | Characters/words appearing in real-time as the LLM generates. | 5.4 | Text container that appends content as text_delta events arrive. Supports markdown rendering on-the-fly. Cursor/caret animation at end of text. |
| D3 | Streaming Thinking | Thinking content streaming (collapsible, may be hidden or shown based on chain_of_thought_visibility setting). | 5.5 | Same as D2 but in a distinct container (thinking block). Respects visibility settings. |
| D4 | Live Tool Card | When a tool is called during streaming: show the tool name + spinner, then fill in the result when done. | 5.1 (tool_started/tool_completed) | Card that appears on tool_started event with tool name and spinning loader. On tool_completed, replace spinner with result summary, duration, and status. |
| D5 | Progress Bar | Overall execution progress for multi-step workflows. | 5.6, 5.10, 5.11 | Horizontal progress bar. Show "Step 2 of 5" label. Percentage fills as steps complete. For loops, show iteration progress. |
| D6 | Running Counters | Live-updating token count, cost, duration while execution runs. | 5.7, 5.8, 5.9 | Three counter elements that increment in real-time. Tokens counter, cost counter (with dollar sign), elapsed time counter. |
| D7 | Step Checklist | To-do-style list where steps check off as they complete. | 5.1, 5.10 | Checklist component. Each workflow node as a line item. Empty circle → spinner (running) → green checkmark (completed) / red X (error). |
| D8 | Activity Log | Timestamped event feed showing every event as it happens. | 5.1-5.12 | Scrollable log panel. Each event on one line: timestamp, event icon, description. Auto-scrolls to bottom. Filterable by event type. |

### C.5: Aggregate / Analytics Views

| ID | Element | What it Renders | Data Fields Used | UI Implementation |
|----|---------|----------------|-----------------|-------------------|
| E1 | Cost Breakdown Pie | Pie/donut chart: cost per node, or cost per model. | 3.18, 3.19 | Interactive donut chart. Click segment to see details. Toggle between "by node" and "by model" views. |
| E2 | Token Heatmap | Canvas overlay: nodes colored by token consumption. Green=cheap, yellow=moderate, red=expensive. | 3.17 per node | Canvas overlay mode. Each node gets a colored background based on its total_tokens relative to the most expensive node. Color scale: green → yellow → orange → red. |
| E3 | Latency Waterfall | Gantt-style chart of all steps showing where time was spent. Reveals bottlenecks. | 3.27, 3.28, 3.10 | Gantt chart. Critical path highlighted. Longest step highlighted. Network latency vs compute time distinguished if possible. |
| E4 | Model Usage Table | Table: model → call count, total tokens, total cost, avg latency. | 1.1, 1.4-1.6, 1.14, 1.15 | Data table sorted by cost descending. Shows which models consumed the most resources. |
| E5 | Tool Usage Table | Table: tool → call count, success rate, avg duration, total cost. | 2.1, 2.10, 2.13, 2.16 | Data table. Success rate as colored percentage. Flag tools with < 90% success rate. |
| E6 | Comparison View | Side-by-side: two executions of the same workflow. Diff the paths, tokens, costs, outputs. | Two full Layer 4 records | Two-column layout. Each column shows full execution summary. Differences highlighted (green=improvement, red=regression). Metrics comparison: tokens ↑/↓, cost ↑/↓, duration ↑/↓, quality (PM rating). |

---

<a id="section-d"></a>
## SECTION D: Real-Time Streaming Architecture

The application must support three communication patterns. Implement all three.

### D.1: SSE (Server-Sent Events) — Primary for LLM streaming

**Use for**: All LLM token streaming (text_delta, thinking_delta), tool execution status updates, node transition events, progress updates.

**Architecture**:
1. Client sends POST to `/api/execute` with workflow_id and user_input
2. Server returns `Content-Type: text/event-stream` and holds the connection open
3. Server pushes events as they occur:

```
event: step_started
data: {"node_id": "node_1", "node_label": "Research Agent", "timestamp": "2025-05-01T10:00:01Z"}

event: llm_chunk
data: {"node_id": "node_1", "text_delta": "Based on", "tokens_so_far": 12}

event: llm_chunk
data: {"node_id": "node_1", "text_delta": " my analysis", "tokens_so_far": 15}

event: tool_started
data: {"node_id": "node_1", "tool_name": "web_search", "input_summary": "Search: 'Swiggy Q4 revenue'"}

event: tool_completed
data: {"node_id": "node_1", "tool_name": "web_search", "status": "success", "duration_ms": 2800, "output_summary": "Found 5 results..."}

event: llm_chunk
data: {"node_id": "node_1", "text_delta": "According to", "tokens_so_far": 120}

event: step_completed
data: {"node_id": "node_1", "status": "completed", "duration_ms": 5200, "tokens": 1240, "cost_usd": 0.003}

event: workflow_completed
data: {"execution_id": "exec_abc123", "status": "completed", "total_duration_ms": 8400, "total_tokens": 2100, "total_cost_usd": 0.008}
```

4. Client renders events in real-time using EventSource API
5. Connection closes after `workflow_completed` or `error` event

**Reconnection**: If the SSE connection drops, client reconnects with `Last-Event-ID` header. Server resumes from that point.

**Timeout**: Set server-side keep-alive pings every 15 seconds to prevent proxy/load balancer timeout.

### D.2: WebSocket — For bidirectional communication

**Use for**: Gate approvals (human-in-the-loop), execution cancellation, live annotation during execution, interactive debugging (pause/step/resume).

**Architecture**:
1. Client opens WebSocket to `ws://server/ws/execution/{execution_id}`
2. Server sends execution events (same format as SSE)
3. Client can send commands:

```json
// Cancel execution
{"action": "cancel", "execution_id": "exec_abc123"}

// Approve gate
{"action": "approve_gate", "node_id": "gate_1", "comment": "Looks good", "reviewer": "vidit"}

// Reject gate
{"action": "reject_gate", "node_id": "gate_1", "comment": "Need more data", "reviewer": "vidit"}

// Add annotation mid-execution
{"action": "annotate", "node_id": "node_1", "text": "This step seems slow"}
```

4. Server processes commands and continues/modifies execution accordingly

### D.3: Polling — Fallback

**Use for**: Fallback when SSE/WebSocket connections fail, mobile clients with unreliable connections, serverless deployments that can't hold long connections.

**Architecture**:
```
GET /api/execution/{execution_id}/status
→ Response: {
    "status": "running",
    "steps_completed": 2,
    "steps_total_estimated": 5,
    "current_node": "Research Agent",
    "current_action": "Calling web_search...",
    "tokens_so_far": 850,
    "cost_so_far": 0.003,
    "elapsed_ms": 3200,
    "events_since": [/* new events since last poll */]
  }
```

Poll interval: 1-2 seconds during active execution. Stop polling when status is "completed" or "error".

### D.4: Webhook — For external event triggers

**Use for**: Workflow triggers from external systems, tool completion callbacks for long-running tools, integration with enterprise event systems.

**Architecture**:
- Your platform exposes webhook endpoints per workflow: `POST /api/webhooks/{workflow_id}`
- Enterprise clients register this URL in their systems (Salesforce, JIRA, GitHub, etc.)
- When an event occurs, the external system sends an HTTP POST to this URL with event data
- Your platform receives the POST, extracts relevant data, and triggers the workflow

**Configuration UI**: Workflow settings → Triggers → Add Webhook Trigger → generates a unique URL + shows expected payload format + optional secret key for validation.

---

<a id="section-e"></a>
## SECTION E: Tool Integration Architecture — Postman, API Calls, Mapping Layer

### E.1: Postman Integration as a Tool

**Architecture**: Postman is a tool in the Tool Registry. The user connects their Postman account via API key. The tool exposes their Postman collections as callable endpoints.

**Setup flow**:
1. User goes to Tool Registry → Add Tool → Select "Postman API Tool"
2. User enters Postman API key
3. System fetches user's Postman collections and environments via Postman API
4. Collections appear as selectable endpoints when binding tools to nodes

**Execution flow**:
1. PM selects a Postman collection endpoint (e.g., "Calculate Valuation — POST /v1/valuations")
2. PM configures input mapping (which workflow variables map to which Postman request variables)
3. At runtime: workflow engine calls Postman API which executes the actual HTTP request
4. Response comes back through Postman → workflow engine → next node

**Postman API calls needed**:
- `GET /collections` — list user's collections
- `GET /collections/{id}` — get collection details (endpoints, schemas, variables)
- `GET /environments` — list environments (dev, staging, prod)
- `POST /collections/{id}/requests/{requestId}/run` — execute a specific request (or use Postman's Collection Runner API)

**Alternative: Direct HTTP Tool (no Postman dependency)**:
For users who don't use Postman, also provide a "HTTP API Call" tool where they configure URL, method, headers, auth, and body directly in the UI (Postman-like interface built in).

### E.2: Input/Output Mapping Layer

Every edge between nodes has an optional mapping configuration. The mapping transforms the output shape of the source node into the input shape the target node expects.

**Mapping UI**: A visual table with three columns:

| Target Field | Source Expression | Transform (optional) |
|-------------|-------------------|----------------------|
| `company_id` | `{{previous_node.output.company}}` | Lookup: `{"Swiggy": "SWG_001", "Zomato": "ZMT_002"}` |
| `quarter` | `{{previous_node.output.period}}` | Template: `"2025-{{value}}"` |
| `method` | `{{previous_node.output.analysis_type}}` | Direct (no transform) |

**Available source expressions**:
- `{{previous_node.output.FIELD}}` — field from the immediately preceding node's output
- `{{step_N.output.FIELD}}` — field from a specific step's output (by node label or ID)
- `{{user_input}}` — the original user message
- `{{workflow.config.FIELD}}` — a workflow-level config value
- `{{env.VARIABLE}}` — an environment variable (for API keys, secrets)
- `{{static.VALUE}}` — a hardcoded static value

**Available transforms**:
- `Direct` — pass value as-is
- `Template` — string template with `{{value}}` placeholder: `"prefix_{{value}}_suffix"`
- `Lookup` — key-value mapping: `{"input_val_1": "output_val_1", "input_val_2": "output_val_2"}`
- `JSONPath` — extract nested value: `$.data.results[0].name`
- `Type cast` — convert type: `to_string`, `to_number`, `to_boolean`, `to_array`
- `Expression` — simple math/string: `value * 100`, `value.toUpperCase()`, `value.split(",")[0]`

### E.3: Test This Step

Every node must have a "Test" button that allows the PM to:

1. **Test with hardcoded input**: PM types sample values directly. System executes JUST this node. Shows request, response, duration, status. Like Postman's "Send" button.

2. **Test with previous node output**: PM runs the previous node first (or uses a saved test run's output). System auto-populates the current node's input using the mapping configuration. PM can see the mapped values before executing. System executes the node and shows results.

3. **Test the mapping independently**: PM provides a sample source output (JSON). System applies the mapping transforms and shows the resulting mapped input. No execution — just validates the mapping logic. PM can iterate on the mapping until the transformed output matches what the tool/API expects.

---

<a id="section-f"></a>
## SECTION F: Routing & Conditional Edge Architecture

### Five levels of routing, all configurable in the UI:

**Level 1: Field Comparison** (~50% of real routing needs)
- UI: Three dropdowns — field, operator, value → target node
- Runtime: Engine reads previous node output → extracts field → applies operator → routes
- Storage: `{ "condition_type": "field_comparison", "field": "confidence_score", "operator": "gt", "value": 0.8, "target_node": "generate_report" }`
- Cost: Zero. Instant. Deterministic.

**Level 2: Pattern Matching** (~20% more)
- UI: Output text + operator (contains/regex/starts_with) + pattern → target node
- Runtime: Engine applies pattern match to output text
- Storage: `{ "condition_type": "pattern_match", "operator": "contains", "pattern": "error", "target_node": "retry" }`
- Cost: Zero. Instant. Deterministic.

**Level 3: Multi-Condition** (~15% more)
- UI: Rule builder with AND/OR combinators. Multiple rows, each a field comparison.
- Runtime: Engine evaluates rules top-to-bottom, takes first match
- Storage: `{ "condition_type": "multi_condition", "combinator": "AND", "rules": [...], "target_node": "..." }`
- Cost: Zero. Instant. Deterministic.

**Level 4: LLM Evaluation** (~10% more)
- UI: Evaluation prompt text box + model selector + response-to-route mapping
- Runtime: Engine sends evaluation prompt + context to a cheap LLM → parses response → routes
- Storage: `{ "condition_type": "llm_evaluation", "prompt": "...", "model": "claude-haiku-3.5", "response_mapping": {"YES": "output_node", "NO": "retry_node"} }`
- Cost: 100-500 tokens per evaluation. Use cheapest model.

**Level 5: External Webhook Function** (~5% — enterprise custom logic)
- UI: URL input + input mapping + response field selector
- Runtime: Engine calls webhook URL with mapped input → reads response field → routes
- Storage: `{ "condition_type": "webhook_function", "url": "https://...", "input_mapping": {...}, "response_field": "route" }`
- Cost: HTTP call latency. External function cost.

---

<a id="section-g"></a>
## SECTION G: Dynamic Event Schema — Database Design

### Core table:

```sql
CREATE TABLE execution_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id    UUID NOT NULL,
  parent_event_id UUID,  -- nullable, for nesting: tool_call → parent llm_call → parent node
  event_type      TEXT NOT NULL,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
  data            JSONB NOT NULL,
  
  CONSTRAINT fk_execution FOREIGN KEY (execution_id) REFERENCES execution_runs(id),
  CONSTRAINT fk_parent FOREIGN KEY (parent_event_id) REFERENCES execution_events(id)
);

CREATE INDEX idx_exec_events_exec_time ON execution_events (execution_id, timestamp);
CREATE INDEX idx_exec_events_exec_type ON execution_events (execution_id, event_type);
CREATE INDEX idx_exec_events_parent ON execution_events (parent_event_id) WHERE parent_event_id IS NOT NULL;
```

### Event types and their data shapes:

(Every event type listed with its exact JSONB data shape)

```
"workflow_started"     → { workflow_id, workflow_version, trigger, user_input, config_snapshot }
"workflow_completed"   → { status, final_output, total_duration_ms, total_tokens, total_cost_usd, path_taken }
"node_started"         → { node_id, node_label, node_type, component_config, input_context, input_context_source }
"node_completed"       → { node_id, status, output_result, output_format, duration_ms, total_tokens, total_cost_usd, llm_call_count, tool_call_count, edge_taken }
"llm_call_started"     → { node_id, call_index, model_id, provider, system_prompt, input_messages, temperature, max_output_tokens, thinking_enabled, thinking_budget }
"llm_call_chunk"       → { node_id, call_index, text_delta, thinking_delta, tokens_so_far }
"llm_call_completed"   → { node_id, call_index, output_text, thinking_text, tool_calls_requested, stop_reason, input_tokens, output_tokens, thinking_tokens, cache_read_tokens, cache_write_tokens, cost_usd, latency_ms, time_to_first_token_ms, tokens_per_second, request_id }
"tool_started"         → { node_id, call_index, tool_name, tool_display_name, tool_category, input_arguments, input_summary, triggered_by }
"tool_completed"       → { node_id, call_index, tool_name, output_result, output_summary, output_type, output_size_bytes, status, error_message, error_type, duration_ms, external_calls, tokens_consumed, cost_usd, cache_hit, retry_count, artifacts_produced }
"edge_evaluated"       → { edge_id, source_node_id, target_node_id, edge_type, condition_method, condition_field, condition_operator, condition_value, condition_result, evaluation_detail }
"loop_iteration"       → { edge_id, node_id, iteration_number, max_iterations }
"human_review_requested" → { node_id, reviewer, review_display_content, instructions, requested_at }
"human_review_completed" → { node_id, action (approve/reject/edit), reviewer, comment, responded_at, review_duration_ms }
"error"                → { node_id, error_type, error_message, stack_trace, retry_attempt, will_retry }
"split_started"        → { node_id, branch_count, fan_out_method, branch_targets }
"split_branch_completed" → { node_id, branch_index, target_node_id, result, duration_ms, tokens, cost_usd }
"split_merged"         → { node_id, merge_method, merged_result, total_duration_ms }
"annotation"           → { node_id, author, text, rating, created_at }
"mapping_applied"      → { edge_id, source_output, mapping_config, mapped_result, transform_errors }
```

### Why this works:
1. New event types can be added without schema migrations
2. UI auto-discovers what to show by querying event_types present
3. Nesting via parent_event_id gives span tree for free
4. Streaming = events pushed in real-time via SSE
5. Aggregation = SQL GROUP BY queries on JSONB fields

---

<a id="section-h"></a>
## SECTION H: Auto-Rendering Rules

The Inspector reads events for an execution and auto-selects which UI elements to render:

```
IF events contain "llm_call_completed":
  → Show: A1 (token badge), A2 (cost badge), A9 (token split)
  → Enable drill-down: C4 (LLM call timeline), C8 (token breakdown table)

IF events contain "llm_call_completed" with thinking_text != null:
  → Show: C5 (thinking block, collapsible)

IF events contain "llm_call_completed" with stop_reason == "max_tokens":
  → Show: WARNING BANNER "Response was truncated — consider increasing max_output_tokens"

IF events contain "llm_call_completed" with stop_reason == "content_filter":
  → Show: WARNING BANNER "Response was blocked by content filter"

IF events contain "llm_call_completed" with cache_read_tokens > 0:
  → Show: A10 (cache indicator)

IF events contain "tool_completed":
  → Show: A6 (tool call count), C3 (tool call cards)

IF events contain "tool_completed" with status == "error":
  → Show: C7 (error detail panel) with red highlight

IF events contain "edge_evaluated":
  → Show: B7 (edge condition log)
  → Enable: B4 (path highlight on canvas)

IF events contain "loop_iteration":
  → Show: B5 (loop counter overlay)

IF events contain "split_started":
  → Show: B6 (parallel branch view)

IF events contain "human_review_requested":
  → Show: Gate panel with approve/reject actions

IF events contain "mapping_applied":
  → Show: Mapping detail view on edge click

IF execution has > 1 "node_completed" events:
  → Show: B1 (step pills), B2 (waterfall timing bar)

IF total_cost_usd > 0:
  → Show: E1 (cost breakdown) in analytics tab

IF events contain "error":
  → Show: Error summary in header, C7 for affected node

ALWAYS show:
  → A3 (duration), A4 (step count), A7 (status pill)
  → B1 (step pills) in compact execution trace
  → C1 (input/output accordion) for each node
```

---

<a id="section-i"></a>
## SECTION I: PM-Configurable Display Settings

These are per-workspace or per-configuration display settings that the PM toggles:

```json
{
  "show_inner_llm_calls": true,
  "show_tool_call_details": true,
  "show_thinking": true,
  "show_system_prompts": true,
  "show_raw_messages": false,
  "show_token_counts": true,
  "show_costs": true,
  "show_edge_evaluations": true,
  "show_mapping_details": true,
  "stream_text": true,
  "stream_thinking": true,
  "show_live_tool_cards": true,
  "show_progress_bar": true,
  "show_activity_log": false,
  "show_cost_breakdown": true,
  "show_token_heatmap": false,
  "show_latency_waterfall": true,
  "enable_comparison_view": true
}
```

Each of these should be a toggle in a "Display Settings" panel within the Inspector or workflow settings.

---

<a id="section-j"></a>
## SECTION J: Side-by-Side Comparison Engine

### The core feature that differentiates this product:

**Flow**:
1. PM configures a workflow and saves a "Test Input" (a user message to test with)
2. PM clicks "Run Test" → execution runs → trace captured as Run A
3. PM changes one or more knobs (model, temperature, prompt, tools, routing, etc.)
4. PM clicks "Run Test" again with SAME input → execution runs → trace captured as Run B
5. PM opens "Compare" view → sees Run A and Run B side by side

**Comparison metrics**:
- Total tokens: Run A vs Run B (with % change and arrow ↑/↓)
- Total cost: Run A vs Run B
- Total duration: Run A vs Run B
- LLM calls: Run A vs Run B (inner loop efficiency)
- Tool calls: Run A vs Run B
- Path taken: highlight differences in workflow path
- Output text: diff view showing what changed in the final output
- Config diff: highlight which settings changed between runs
- Per-node comparison: expand any node to compare its metrics across runs

**Storage**: Both runs stored as full execution event records (Section G). Comparison is a read-only view that queries both records and computes deltas.

---

<a id="section-k"></a>
## SECTION K: Implementation Sequence — All Phases

### Phase 1: Capture the Data (Backend)
Backend executor must emit execution events per Section G. At minimum:
- `workflow_started` / `workflow_completed`
- `node_started` / `node_completed` (with tokens, cost, duration, config snapshot)
- `llm_call_started` / `llm_call_completed` (with FULL token breakdown including thinking, cache)
- `tool_started` / `tool_completed` (with I/O, external calls, cache hit)
- `edge_evaluated` (with condition method and result)

### Phase 2: Surface Token + Cost (Frontend)
Add A1 (token badge), A2 (cost badge), A9 (token split) to Inspector. Pricing table for all supported models. Cost computation logic.

### Phase 2.5: Error and Retry Visibility
Render C7 (error detail panel). Show retry indicators (1.25-1.27, 2.18). Show stop_reason warnings for max_tokens and content_filter. Show content filter flags.

### Phase 3: Tool Call Visibility (Frontend)
Add C3 (tool call cards) inside each step. Show tool name, input summary, output summary, duration, status, external calls.

### Phase 3.5: Config Snapshot Capture
Store C6 (config snapshot) with every execution. Capture model, temperature, tools, system prompt, all settings at execution time. Required for comparison view.

### Phase 4: Inner Loop Visibility (Frontend)
Add C4 (LLM call timeline) as expandable section. Show each API call in sequence with tool calls between them. Reveal ReAct loops.

### Phase 4.5: Thinking Block Rendering
Add C5 (thinking block). Collapsible, distinct styling. Show thinking token count. Respect chain_of_thought_visibility setting.

### Phase 5: Live Streaming (Full Stack)
Implement SSE event stream per Section D.1. Frontend subscribes and renders D1 (status), D2 (streaming text), D3 (streaming thinking), D4 (live tool cards), D5 (progress bar), D6 (running counters).

### Phase 5.5: Human-in-the-Loop / Gate Integration
WebSocket for gate approvals per Section D.2. UI for human_review_requested and human_review_completed events. Show reviewer, action, comment, review duration.

### Phase 6: Input/Output Mapping Layer
Implement mapping UI per Section E.2. Source expressions, transforms, mapping preview. "Test mapping" capability.

### Phase 6.5: Postman Integration
Add Postman as a tool in the registry per Section E.1. OAuth/API key connection. Collection browsing. Endpoint selection. Variable mapping.

### Phase 7: Analytics & Comparison (Frontend)
Add E1 (cost breakdown), E2 (token heatmap), E3 (latency waterfall), E4 (model usage table), E5 (tool usage table). Add E6 (comparison view) per Section J.

### Phase 7.5: Export and Replay
Export execution event stream as JSON. Replay execution in Inspector like a recording. Share execution link for debugging.

### Phase 8: Alerting and Thresholds
Configurable alerts: cost exceeds threshold, stop_reason = max_tokens, tool error rate above threshold, execution duration above threshold, specific node failure patterns.

### Phase 9: Test Harness
"Test this step" capability per Section E.3. Save test inputs. One-click re-run. Test input library per workflow.

### Phase 10: Routing Builder
Full routing UI per Section F. All five levels. Condition builder, rule builder, LLM evaluation config, webhook function config. "Test this condition" with sample data.

---

<a id="section-l"></a>
## SECTION L: Glossary & Reference Tables

### L.1: Model Pricing Table (as of May 2025 — maintain in config)

| Provider | Model | Input $/1M tokens | Output $/1M tokens | Cache Read $/1M | Cache Write $/1M | Context Window | Max Output | Thinking Support |
|----------|-------|-------------------|--------------------|-----------------|--------------------|----------------|------------|-----------------|
| Anthropic | claude-opus-4 | $15.00 | $75.00 | $1.50 | $18.75 | 200K | 32K | Yes (budget_tokens) |
| Anthropic | claude-sonnet-4 | $3.00 | $15.00 | $0.30 | $3.75 | 200K | 16K (64K extended) | Yes (budget_tokens) |
| Anthropic | claude-haiku-3.5 | $0.80 | $4.00 | $0.08 | $1.00 | 200K | 8K | No |
| OpenAI | gpt-4o | $2.50 | $10.00 | $1.25 | $2.50 | 128K | 16K | No |
| OpenAI | gpt-4o-mini | $0.15 | $0.60 | $0.075 | $0.15 | 128K | 16K | No |
| OpenAI | o3 | $10.00 | $40.00 | — | — | 200K | 100K | Yes (reasoning_effort) |
| OpenAI | o3-mini | $1.10 | $4.40 | — | — | 200K | 100K | Yes (reasoning_effort) |
| OpenAI | o4-mini | $1.10 | $4.40 | — | — | 200K | 100K | Yes (reasoning_effort) |
| Google | gemini-2.0-flash | $0.10 | $0.40 | — | — | 1M | 8K | No |
| Google | gemini-2.5-pro | $1.25 | $10.00 | — | — | 1M | 65K | Yes |

**NOTE**: Prices change. Maintain this as a configuration file, not hardcoded. Update quarterly. Prices should be editable in admin settings.

### L.2: Common Token Estimates

| Content Type | Approximate Tokens | Approximate Characters |
|-------------|-------------------|----------------------|
| 1 word | ~1.3 tokens | ~5 characters |
| 1 sentence | ~15-25 tokens | ~75-125 characters |
| 1 paragraph | ~50-100 tokens | ~250-500 characters |
| 1 page of text | ~300-400 tokens | ~1,500-2,000 characters |
| 10-page document | ~3,000-4,000 tokens | ~15,000-20,000 characters |
| Short system prompt | ~100-300 tokens | ~500-1,500 characters |
| Detailed system prompt | ~500-2,000 tokens | ~2,500-10,000 characters |
| Tool schema (1 tool) | ~100-300 tokens | ~500-1,500 characters |
| 10 tool schemas | ~1,000-3,000 tokens | ~5,000-15,000 characters |
| Conversation history (10 turns) | ~2,000-5,000 tokens | ~10,000-25,000 characters |
| RAG retrieval (5 documents) | ~1,000-5,000 tokens | ~5,000-25,000 characters |

### L.3: Typical Cost Scenarios

| Scenario | Tokens Used | Cost (claude-sonnet-4) | Cost (gpt-4o-mini) | Cost Ratio |
|----------|------------|----------------------|--------------------|-----------:|
| Simple classification | ~200 in, ~10 out | $0.00075 | $0.000036 | 21x |
| Short Q&A | ~500 in, ~200 out | $0.0045 | $0.000195 | 23x |
| RAG with 5 docs | ~3000 in, ~500 out | $0.0165 | $0.00075 | 22x |
| Complex analysis with tools (3 inner loops) | ~8000 in, ~2000 out | $0.054 | $0.0024 | 23x |
| Extended thinking task | ~2000 in, ~500 out, ~5000 thinking | $0.0135 | N/A | — |
| 1000 requests/day (simple Q&A) | ~700K total/day | $4.50/day | $0.195/day | 23x |
| 1000 requests/day (complex + tools) | ~10M total/day | $54/day | $2.40/day | 23x |

### L.4: Glossary

| Term | Definition |
|------|-----------|
| **Token** | A chunk of text, roughly ¾ of a word. "Hello world" = 2 tokens. Models read and generate in tokens. You pay per token. |
| **Context window** | Maximum tokens a model processes at once (input + output combined). GPT-4o: 128K. Claude: 200K. Gemini: 1M. |
| **Temperature** | How random the model's word choices are. 0 = always picks highest probability. 1 = sometimes picks unlikely words. |
| **Streaming** | Sending the model's output to the user word-by-word as it generates, via SSE or WebSocket. |
| **SSE (Server-Sent Events)** | One-way streaming protocol. Server pushes events to browser over a single HTTP connection. Used for LLM token streaming. |
| **WebSocket** | Two-way streaming protocol. Both client and server send messages anytime over a persistent connection. Used for interactive features (gate approvals, cancellation). |
| **Polling** | Client repeatedly asks server "any updates?" at intervals. Fallback when SSE/WebSocket unavailable. |
| **Webhook** | A URL you provide to another system. When an event occurs, they send an HTTP POST to your URL. One-time notification, no persistent connection. |
| **Tool call / Function call** | When the LLM outputs a structured request to use a tool. Your code executes the tool and sends results back. |
| **Inner loop / ReAct loop** | The cycle of: LLM generates → calls tool → receives result → generates again → maybe calls another tool → ... until final text response. |
| **RAG** | Retrieval Augmented Generation. Fetching relevant documents and including them in the LLM context. |
| **Prompt caching** | Provider reuses previously processed prompt tokens. Saves ~90% on cached portions. Has a TTL (~5 min). |
| **TTFT** | Time to First Token. How long user waits before seeing the first word. Lower = better perceived speed. |
| **Span** | A single unit of work with start/end time. Spans nest: workflow → node → LLM call → tool call. |
| **Trace** | Complete tree of spans for one execution. Everything from user input to final output. |
| **stop_reason** | Why the model stopped generating. end_turn (done), tool_use (wants to call tool), max_tokens (hit limit — response truncated), content_filter (blocked). |
| **Thinking tokens** | Extra tokens for internal reasoning (Claude extended thinking, OpenAI o-series). Billed but not always shown to user. |
| **Cache read/write tokens** | Tokens served from (read) or stored to (write) prompt cache. Read = cheap, Write = slightly expensive. |
| **Mapping layer** | Transforms data shape between nodes — maps output fields of one node to input fields of the next. |
| **Postman tool** | Integration with Postman API for executing HTTP requests configured in Postman collections. |

---

## END OF SPECIFICATION

**Verification checklist for Claude Code**:
1. Every field in Section A Layer 1-5 is captured by the backend and stored
2. Every setting in Section B has a UI control with the specified possible values
3. Every rendering element in Section C is implemented in the Inspector
4. SSE streaming per Section D.1 is functional with all event types
5. WebSocket per Section D.2 supports gate approvals and cancellation
6. Polling fallback per Section D.3 exists
7. Postman integration per Section E.1 is available in tool registry
8. Mapping layer per Section E.2 exists on every edge
9. "Test this step" per Section E.3 works for every node
10. All five routing levels per Section F have UI builders
11. Database schema per Section G exists with all event types
12. Auto-rendering rules per Section H are implemented
13. Display settings per Section I are toggleable
14. Comparison view per Section J works for any two runs
15. All phases in Section K are implemented in order
16. Pricing table per Section L.1 is configurable and up to date
