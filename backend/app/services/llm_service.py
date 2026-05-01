"""LLM service — retrieves API keys, calls models, streams responses.

Enhanced to capture all Layer 1 data (Section A) for every LLM call:
model_id, provider, tokens (input/output/thinking/cache), stop_reason,
cost, latency, TTFT, request_id, etc.

Supports OpenAI, Anthropic, and Google AI providers.
"""

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Optional

import httpx
from openai import AsyncOpenAI

from app.database import supabase
from app.services.api_key_service import _decrypt
from app.services.pricing_service import compute_cost

logger = logging.getLogger("ws.llm")

# Map model prefixes to providers
MODEL_PROVIDER_MAP = {
    "gpt-": "openai",
    "o1": "openai",
    "o3": "openai",
    "o4": "openai",
    "claude-": "anthropic",
    "llama-": "groq",
    "mixtral-": "groq",
    "gemma": "groq",
    "gemini-": "google_ai",
}

# Provider base URLs
PROVIDER_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "groq": "https://api.groq.com/openai/v1",
}


@dataclass
class LLMCallResult:
    """Layer 1 data captured from a single LLM API call."""
    model_id: str = ""
    provider: str = ""
    input_messages: list[dict] = field(default_factory=list)
    input_tokens: int = 0
    output_tokens: int = 0
    thinking_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    total_tokens: int = 0
    output_text: str = ""
    thinking_text: str = ""
    tool_calls_requested: list[dict] = field(default_factory=list)
    stop_reason: str = ""
    cost_usd: float = 0.0
    latency_ms: int = 0
    time_to_first_token_ms: int = 0
    tokens_per_second: float = 0.0
    temperature: float = 0.0
    top_p: float = 1.0
    max_output_tokens: int = 0
    system_prompt: str = ""
    request_id: str = ""
    is_retry: bool = False
    retry_reason: str = ""
    retry_attempt: int = 0
    content_filter_flags: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "model_id": self.model_id,
            "provider": self.provider,
            "input_messages": self.input_messages,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "thinking_tokens": self.thinking_tokens,
            "cache_read_tokens": self.cache_read_tokens,
            "cache_write_tokens": self.cache_write_tokens,
            "total_tokens": self.total_tokens,
            "output_text": self.output_text,
            "thinking_text": self.thinking_text,
            "tool_calls_requested": self.tool_calls_requested,
            "stop_reason": self.stop_reason,
            "cost_usd": self.cost_usd,
            "latency_ms": self.latency_ms,
            "time_to_first_token_ms": self.time_to_first_token_ms,
            "tokens_per_second": self.tokens_per_second,
            "temperature": self.temperature,
            "max_output_tokens": self.max_output_tokens,
            "system_prompt": self.system_prompt,
            "request_id": self.request_id,
            "is_retry": self.is_retry,
            "retry_reason": self.retry_reason,
            "retry_attempt": self.retry_attempt,
            "content_filter_flags": self.content_filter_flags,
        }


@dataclass
class ToolCallResult:
    """Layer 2 data captured from a tool execution."""
    tool_name: str = ""
    tool_display_name: str = ""
    tool_category: str = ""
    input_arguments: dict = field(default_factory=dict)
    input_summary: str = ""
    output_result: Any = None
    output_summary: str = ""
    output_type: str = "text"
    output_size_bytes: int = 0
    status: str = "success"
    error_message: str = ""
    error_type: str = ""
    duration_ms: int = 0
    triggered_by: str = "llm_tool_call"
    cache_hit: bool = False
    retry_count: int = 0

    def to_dict(self) -> dict:
        return {
            "tool_name": self.tool_name,
            "tool_display_name": self.tool_display_name,
            "tool_category": self.tool_category,
            "input_arguments": self.input_arguments,
            "input_summary": self.input_summary,
            "output_result": self.output_result,
            "output_summary": self.output_summary,
            "output_type": self.output_type,
            "output_size_bytes": self.output_size_bytes,
            "status": self.status,
            "error_message": self.error_message,
            "error_type": self.error_type,
            "duration_ms": self.duration_ms,
            "triggered_by": self.triggered_by,
            "cache_hit": self.cache_hit,
            "retry_count": self.retry_count,
        }


@dataclass
class StreamingContext:
    """Accumulates data across the streaming call for the caller to inspect."""
    llm_calls: list[LLMCallResult] = field(default_factory=list)
    tool_calls: list[ToolCallResult] = field(default_factory=list)
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_thinking_tokens: int = 0
    total_tokens: int = 0
    total_cost_usd: float = 0.0
    total_duration_ms: int = 0


def _resolve_provider(model: str) -> str:
    """Determine which provider a model belongs to."""
    for prefix, provider in MODEL_PROVIDER_MAP.items():
        if model.startswith(prefix):
            return provider
    return "openai"


def get_api_key_for_user(user_id: str, provider: str) -> dict | None:
    """Fetch and decrypt the API key for a given provider + user."""
    logger.info("[llm] Looking up API key: user=%s provider=%s", user_id, provider)
    resp = (
        supabase.table("api_keys")
        .select("*")
        .eq("user_id", user_id)
        .eq("provider", provider)
        .execute()
    )
    if not resp.data:
        logger.warning("[llm] No API key found for user=%s provider=%s", user_id, provider)
        return None

    row = resp.data[0]
    try:
        decrypted = _decrypt(row["encrypted_key"])
        logger.info("[llm] API key decrypted OK: provider=%s hint=%s", provider, row.get("key_hint", "?"))
        return {
            "api_key": decrypted,
            "base_url": row.get("base_url"),
            "additional_config": row.get("additional_config") or {},
            "provider": provider,
        }
    except Exception as e:
        logger.error("[llm] Failed to decrypt API key: provider=%s error=%s", provider, e)
        return None


def _extract_system_prompt(messages: list[dict]) -> str:
    """Extract system prompt from messages array."""
    for m in messages:
        if m.get("role") == "system":
            return m.get("content", "")
    return ""


async def call_llm_streaming(
    user_id: str,
    model: str,
    messages: list[dict],
    temperature: float = 0.2,
    max_tokens: int = 4096,
    top_p: float = 1.0,
    tools: list[dict] | None = None,
    tool_executor_fn=None,
    streaming_ctx: StreamingContext | None = None,
    on_llm_call_start=None,
    on_llm_call_complete=None,
    on_tool_start=None,
    on_tool_complete=None,
    on_thinking_delta=None,
    max_tool_rounds: int = 5,
    parallel_tool_calls: bool = True,
    tool_call_timeout: int = 30,
    tool_retry_on_failure: int = 0,
    stop_sequences: list[str] | None = None,
    json_schema: dict | None = None,
    thinking_enabled: bool = False,
    thinking_budget_tokens: int = 0,
    reasoning_effort: str | None = None,
) -> AsyncGenerator[str, None]:
    """Stream tokens from an LLM. Yields text chunks.

    Enhanced: captures Layer 1/2 data into streaming_ctx if provided.
    Callbacks on_llm_call_start/complete and on_tool_start/complete
    allow the caller to emit execution events in real-time.

    Args:
        tools: OpenAI function-calling tool schemas
        tool_executor_fn: async fn(tool_name, arguments) -> str
        streaming_ctx: StreamingContext to accumulate telemetry data
        on_llm_call_start: async fn(call_index, model, messages) called before each LLM API call
        on_llm_call_complete: async fn(call_index, LLMCallResult) called after each LLM API call
        on_tool_start: async fn(tool_name, arguments) called before tool execution
        on_tool_complete: async fn(ToolCallResult) called after tool execution
        on_thinking_delta: async fn(text) called for each thinking token chunk (Anthropic)
        max_tool_rounds: max LLM↔tool round-trips (from config max_tool_calls_per_node)
        parallel_tool_calls: whether OpenAI may batch tool calls
        tool_call_timeout: seconds before a tool execution times out
        tool_retry_on_failure: number of retries on tool error
        stop_sequences: custom stop sequences for the LLM
        json_schema: JSON schema for structured output (OpenAI response_format)
        thinking_enabled: enable extended thinking (Anthropic)
        thinking_budget_tokens: budget for thinking tokens (Anthropic)
        reasoning_effort: reasoning effort level for o-series models (low/medium/high)
    """
    provider = _resolve_provider(model)
    logger.info("[llm] Resolved provider=%s for model=%s", provider, model)

    key_data = get_api_key_for_user(user_id, provider)
    if not key_data:
        raise RuntimeError(
            f"No API key configured for {provider}. "
            f"Go to Settings -> API Keys to add one."
        )

    api_key = key_data["api_key"]
    if not api_key or api_key.strip() == "":
        raise RuntimeError(
            f"API key for {provider} is empty. "
            f"Go to Settings -> API Keys and re-enter it."
        )

    ctx = streaming_ctx or StreamingContext()
    system_prompt = _extract_system_prompt(messages)

    if provider == "anthropic":
        async for chunk in _call_anthropic_streaming_enhanced(
            api_key, model, messages, temperature, max_tokens, ctx, system_prompt,
            on_llm_call_start, on_llm_call_complete, on_thinking_delta,
            top_p=top_p,
            stop_sequences=stop_sequences,
            thinking_enabled=thinking_enabled,
            thinking_budget_tokens=thinking_budget_tokens,
        ):
            yield chunk
        return

    if provider == "google_ai":
        async for chunk in _call_google_streaming_enhanced(
            api_key, model, messages, temperature, max_tokens, ctx, system_prompt,
            on_llm_call_start, on_llm_call_complete,
            top_p=top_p,
            stop_sequences=stop_sequences,
        ):
            yield chunk
        return

    # OpenAI-compatible providers
    base_url = key_data.get("base_url") or PROVIDER_BASE_URLS.get(provider, "https://api.openai.com/v1")
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    logger.info("[llm] Calling %s with %d messages, %d tools (model=%s, temp=%.1f, top_p=%.2f)",
                provider, len(messages), len(tools or []), model, temperature, top_p)

    current_messages = list(messages)
    call_index = 0

    for round_num in range(max_tool_rounds + 1):
        call_result = LLMCallResult(
            model_id=model,
            provider=provider,
            input_messages=list(current_messages),
            temperature=temperature,
            top_p=top_p,
            max_output_tokens=max_tokens,
            system_prompt=system_prompt,
        )
        start_time = time.monotonic()
        ttft_recorded = False

        if on_llm_call_start:
            await on_llm_call_start(call_index, model, current_messages)

        try:
            create_kwargs: dict[str, Any] = {
                "model": model,
                "messages": current_messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
                "top_p": top_p,
            }

            # Stop sequences
            if stop_sequences:
                create_kwargs["stop"] = stop_sequences

            # Reasoning effort for o-series models (o1, o3, o4-mini, etc.)
            if reasoning_effort and model.startswith(("o1", "o3", "o4")):
                create_kwargs["reasoning_effort"] = reasoning_effort
                # o-series models don't support temperature/top_p
                create_kwargs.pop("temperature", None)
                create_kwargs.pop("top_p", None)

            # JSON schema structured output
            if json_schema:
                create_kwargs["response_format"] = {
                    "type": "json_schema",
                    "json_schema": json_schema,
                }

            if tools and tool_executor_fn:
                create_kwargs["tools"] = tools
                create_kwargs["parallel_tool_calls"] = parallel_tool_calls
                create_kwargs["stream"] = True
                create_kwargs["stream_options"] = {"include_usage": True}

                stream = await client.chat.completions.create(**create_kwargs)
                token_count = 0
                full_text = ""
                tool_call_buffers: dict[int, dict[str, str]] = {}

                async for chunk in stream:
                    if getattr(chunk, "id", None) and not call_result.request_id:
                        call_result.request_id = chunk.id

                    if hasattr(chunk, "usage") and chunk.usage:
                        call_result.input_tokens = chunk.usage.prompt_tokens or 0
                        call_result.output_tokens = chunk.usage.completion_tokens or 0

                    if not chunk.choices:
                        continue

                    choice = chunk.choices[0]
                    delta = choice.delta

                    if choice.finish_reason:
                        call_result.stop_reason = choice.finish_reason

                    if hasattr(choice, "content_filter_results") and choice.content_filter_results:
                        call_result.content_filter_flags = choice.content_filter_results

                    if delta and delta.content:
                        if not ttft_recorded:
                            call_result.time_to_first_token_ms = int((time.monotonic() - start_time) * 1000)
                            ttft_recorded = True
                        token_count += 1
                        full_text += delta.content
                        yield delta.content

                    for tc_delta in getattr(delta, "tool_calls", None) or []:
                        idx = tc_delta.index
                        buffered = tool_call_buffers.setdefault(
                            idx,
                            {"id": "", "name": "", "arguments": ""},
                        )
                        if tc_delta.id:
                            buffered["id"] = tc_delta.id
                        if tc_delta.function:
                            if tc_delta.function.name:
                                buffered["name"] += tc_delta.function.name
                            if tc_delta.function.arguments:
                                buffered["arguments"] += tc_delta.function.arguments

                elapsed_ms = int((time.monotonic() - start_time) * 1000)
                call_result.latency_ms = elapsed_ms
                call_result.output_text = full_text
                call_result.total_tokens = call_result.input_tokens + call_result.output_tokens

                tool_calls = [
                    {
                        "id": data["id"] or f"call_{round_num}_{idx}",
                        "type": "function",
                        "function": {
                            "name": data["name"],
                            "arguments": data["arguments"],
                        },
                    }
                    for idx, data in sorted(tool_call_buffers.items())
                    if data["name"]
                ]

                if tool_calls:
                    call_result.tool_calls_requested = [
                        {
                            "tool_name": tc["function"]["name"],
                            "tool_id": tc["id"],
                            "arguments": tc["function"]["arguments"],
                        }
                        for tc in tool_calls
                    ]

                # Compute cost
                cost = compute_cost(
                    model, call_result.input_tokens, call_result.output_tokens,
                    call_result.thinking_tokens, call_result.cache_read_tokens, call_result.cache_write_tokens,
                )
                call_result.cost_usd = cost.total_cost

                ctx.llm_calls.append(call_result)
                ctx.total_input_tokens += call_result.input_tokens
                ctx.total_output_tokens += call_result.output_tokens
                ctx.total_tokens += call_result.total_tokens
                ctx.total_cost_usd += call_result.cost_usd
                ctx.total_duration_ms += elapsed_ms

                if on_llm_call_complete:
                    await on_llm_call_complete(call_index, call_result)
                call_index += 1

                # Check if LLM wants to call tools
                if tool_calls:
                    logger.info("[llm] LLM requested %d tool call(s) (round %d)",
                                len(tool_calls), round_num + 1)

                    current_messages.append({
                        "role": "assistant",
                        "content": full_text or "",
                        "tool_calls": tool_calls,
                    })

                    for tc in tool_calls:
                        fn_name = tc["function"]["name"]
                        raw_args = tc["function"]["arguments"]
                        try:
                            fn_args = json.loads(raw_args)
                        except json.JSONDecodeError:
                            fn_args = {"input": raw_args}

                        logger.info("[llm] Executing tool: %s(%s)", fn_name, json.dumps(fn_args)[:100])

                        if on_tool_start:
                            await on_tool_start(fn_name, fn_args)

                        yield f"\n\n🔧 *Using {fn_name}...*\n\n"

                        # Execute tool with timeout and retry
                        tool_start = time.monotonic()
                        tool_result_str = ""
                        tool_error = ""
                        tool_retries = 0

                        for attempt in range(1 + tool_retry_on_failure):
                            try:
                                tool_result_str = await asyncio.wait_for(
                                    tool_executor_fn(fn_name, fn_args),
                                    timeout=tool_call_timeout,
                                )
                                tool_error = ""
                                break
                            except asyncio.TimeoutError:
                                tool_error = f"Tool '{fn_name}' timed out after {tool_call_timeout}s"
                                tool_retries = attempt + 1
                                logger.warning("[llm] %s (attempt %d/%d)", tool_error, attempt + 1, 1 + tool_retry_on_failure)
                            except Exception as te:
                                tool_error = f"Tool '{fn_name}' failed: {te}"
                                tool_retries = attempt + 1
                                logger.warning("[llm] %s (attempt %d/%d)", tool_error, attempt + 1, 1 + tool_retry_on_failure)

                        if tool_error and not tool_result_str:
                            tool_result_str = json.dumps({"error": tool_error})

                        tool_elapsed = int((time.monotonic() - tool_start) * 1000)

                        # Capture Layer 2 data
                        tool_result = ToolCallResult(
                            tool_name=fn_name,
                            tool_display_name=fn_name.replace("_", " ").title(),
                            input_arguments=fn_args,
                            input_summary=_build_tool_input_summary(fn_name, fn_args),
                            output_result=tool_result_str,
                            output_summary=tool_result_str[:200] if tool_result_str else "",
                            output_type="json" if tool_result_str.startswith("{") else "text",
                            output_size_bytes=len(tool_result_str.encode()),
                            status="error" if tool_error else "success",
                            error_message=tool_error,
                            error_type="timeout" if "timed out" in tool_error else ("tool_error" if tool_error else ""),
                            duration_ms=tool_elapsed,
                            triggered_by="llm_tool_call",
                            retry_count=tool_retries,
                        )

                        # Check for error in result (if not already caught)
                        if not tool_error:
                            try:
                                parsed = json.loads(tool_result_str)
                                if "error" in parsed:
                                    tool_result.status = "error"
                                    tool_result.error_message = parsed["error"]
                                    tool_result.error_type = "api_error"
                            except (json.JSONDecodeError, TypeError):
                                pass

                        ctx.tool_calls.append(tool_result)
                        if on_tool_complete:
                            await on_tool_complete(tool_result)

                        current_messages.append({
                            "role": "tool",
                            "tool_call_id": tc["id"],
                            "content": tool_result_str,
                        })

                    continue

                # No tool calls — final text response
                logger.info("[llm] LLM streamed final text with tools available: ~%d chunks (round %d)",
                            token_count, round_num + 1)
                return

            else:
                # No tools — simple streaming with enhanced tracking
                create_kwargs["stream"] = True
                create_kwargs["stream_options"] = {"include_usage": True}
                stream = await client.chat.completions.create(**create_kwargs)

                token_count = 0
                full_text = ""
                async for chunk in stream:
                    # Record TTFT
                    if not ttft_recorded and chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                        call_result.time_to_first_token_ms = int((time.monotonic() - start_time) * 1000)
                        ttft_recorded = True

                    delta = chunk.choices[0].delta if chunk.choices else None
                    if delta and delta.content:
                        token_count += 1
                        full_text += delta.content
                        yield delta.content

                    # Capture usage from final chunk (OpenAI stream_options)
                    if hasattr(chunk, 'usage') and chunk.usage:
                        call_result.input_tokens = chunk.usage.prompt_tokens or 0
                        call_result.output_tokens = chunk.usage.completion_tokens or 0

                    # Capture finish_reason
                    if chunk.choices and chunk.choices[0].finish_reason:
                        call_result.stop_reason = chunk.choices[0].finish_reason

                    # Capture content filter results
                    if chunk.choices and hasattr(chunk.choices[0], "content_filter_results") and chunk.choices[0].content_filter_results:
                        call_result.content_filter_flags = chunk.choices[0].content_filter_results

                elapsed_ms = int((time.monotonic() - start_time) * 1000)
                call_result.latency_ms = elapsed_ms
                call_result.output_text = full_text
                call_result.total_tokens = call_result.input_tokens + call_result.output_tokens

                # Compute tokens/sec
                gen_time = elapsed_ms - call_result.time_to_first_token_ms
                if gen_time > 0 and call_result.output_tokens > 0:
                    call_result.tokens_per_second = call_result.output_tokens / (gen_time / 1000)

                # Compute cost
                cost = compute_cost(
                    model, call_result.input_tokens, call_result.output_tokens,
                    call_result.thinking_tokens, call_result.cache_read_tokens, call_result.cache_write_tokens,
                )
                call_result.cost_usd = cost.total_cost

                ctx.llm_calls.append(call_result)
                ctx.total_input_tokens += call_result.input_tokens
                ctx.total_output_tokens += call_result.output_tokens
                ctx.total_tokens += call_result.total_tokens
                ctx.total_cost_usd += call_result.cost_usd
                ctx.total_duration_ms += elapsed_ms

                if on_llm_call_complete:
                    await on_llm_call_complete(call_index, call_result)

                logger.info("[llm] LLM responded with ~%d chunks (model=%s) [%d in, %d out, $%.6f, %dms]",
                            token_count, model, call_result.input_tokens, call_result.output_tokens,
                            call_result.cost_usd, elapsed_ms)
                return

        except Exception as e:
            error_msg = str(e)
            logger.error("[llm] LLM call failed: model=%s error=%s", model, error_msg)
            if "401" in error_msg or "Incorrect API key" in error_msg:
                raise RuntimeError(f"Invalid API key for {provider}. Check Settings -> API Keys.")
            if "429" in error_msg:
                raise RuntimeError(f"Rate limited by {provider}. Try again in a moment.")
            if "model_not_found" in error_msg or "does not exist" in error_msg:
                raise RuntimeError(f"Model '{model}' not available. Check your {provider} plan.")
            raise RuntimeError(f"LLM call failed ({provider}): {error_msg[:200]}")

    logger.warning("[llm] Hit max tool rounds (%d), returning last output", max_tool_rounds)
    yield "\n\n*Reached maximum tool usage limit.*"


async def _call_anthropic_streaming_enhanced(
    api_key: str, model: str, messages: list[dict],
    temperature: float, max_tokens: int,
    ctx: StreamingContext, system_prompt: str,
    on_llm_call_start=None, on_llm_call_complete=None,
    on_thinking_delta=None,
    top_p: float = 1.0,
    stop_sequences: list[str] | None = None,
    thinking_enabled: bool = False,
    thinking_budget_tokens: int = 0,
) -> AsyncGenerator[str, None]:
    """Stream from Anthropic Messages API with full Layer 1 capture."""
    system_text = ""
    conv_messages = []
    for m in messages:
        if m["role"] == "system":
            system_text += m["content"] + "\n"
        else:
            conv_messages.append(m)

    if not conv_messages:
        conv_messages = [{"role": "user", "content": "Hello"}]

    body: dict[str, Any] = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": top_p,
        "messages": conv_messages,
        "stream": True,
    }
    if system_text.strip():
        body["system"] = system_text.strip()
    if stop_sequences:
        body["stop_sequences"] = stop_sequences

    # Extended thinking (Anthropic)
    if thinking_enabled and thinking_budget_tokens > 0:
        body["thinking"] = {
            "type": "enabled",
            "budget_tokens": thinking_budget_tokens,
        }
        # Anthropic requires removing temperature when thinking is enabled
        body.pop("temperature", None)
        body.pop("top_p", None)

    call_result = LLMCallResult(
        model_id=model,
        provider="anthropic",
        input_messages=list(messages),
        temperature=temperature,
        max_output_tokens=max_tokens,
        system_prompt=system_text.strip(),
    )

    if on_llm_call_start:
        await on_llm_call_start(0, model, messages)

    start_time = time.monotonic()
    ttft_recorded = False

    logger.info("[llm] Calling Anthropic: model=%s messages=%d", model, len(conv_messages))

    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream(
            "POST",
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json=body,
        ) as resp:
            if resp.status_code != 200:
                error_body = await resp.aread()
                raise RuntimeError(f"Anthropic returned {resp.status_code}: {error_body.decode()[:200]}")

            # Capture request-id from headers
            call_result.request_id = resp.headers.get("request-id", "")

            full_text = ""
            thinking_text = ""
            token_count = 0

            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    break
                try:
                    event = json.loads(data)
                except Exception:
                    continue

                event_type = event.get("type", "")

                # message_start — contains usage.input_tokens
                if event_type == "message_start":
                    msg = event.get("message", {})
                    usage = msg.get("usage", {})
                    call_result.input_tokens = usage.get("input_tokens", 0)
                    call_result.cache_read_tokens = usage.get("cache_read_input_tokens", 0)
                    call_result.cache_write_tokens = usage.get("cache_creation_input_tokens", 0)
                    call_result.stop_reason = msg.get("stop_reason", "")

                # content_block_delta — text or thinking chunks
                elif event_type == "content_block_delta":
                    delta = event.get("delta", {})
                    delta_type = delta.get("type", "")

                    if delta_type == "text_delta":
                        text = delta.get("text", "")
                        if text:
                            if not ttft_recorded:
                                call_result.time_to_first_token_ms = int((time.monotonic() - start_time) * 1000)
                                ttft_recorded = True
                            token_count += 1
                            full_text += text
                            yield text

                    elif delta_type == "thinking_delta":
                        thinking = delta.get("thinking", "")
                        if thinking:
                            thinking_text += thinking
                            if on_thinking_delta:
                                await on_thinking_delta(thinking)

                # message_delta — stop_reason + output tokens
                elif event_type == "message_delta":
                    delta = event.get("delta", {})
                    usage = event.get("usage", {})
                    call_result.stop_reason = delta.get("stop_reason", call_result.stop_reason)
                    call_result.output_tokens = usage.get("output_tokens", 0)
                    if call_result.stop_reason == "content_filter":
                        call_result.content_filter_flags = {"blocked": True, "provider": "anthropic"}

            # Finalize
            elapsed_ms = int((time.monotonic() - start_time) * 1000)
            call_result.latency_ms = elapsed_ms
            call_result.output_text = full_text
            call_result.thinking_text = thinking_text
            call_result.total_tokens = (
                call_result.input_tokens + call_result.output_tokens + call_result.thinking_tokens
            )

            # Compute tokens/sec
            gen_time = elapsed_ms - call_result.time_to_first_token_ms
            if gen_time > 0 and call_result.output_tokens > 0:
                call_result.tokens_per_second = call_result.output_tokens / (gen_time / 1000)

            # Compute cost
            cost = compute_cost(
                model, call_result.input_tokens, call_result.output_tokens,
                call_result.thinking_tokens, call_result.cache_read_tokens, call_result.cache_write_tokens,
            )
            call_result.cost_usd = cost.total_cost

            ctx.llm_calls.append(call_result)
            ctx.total_input_tokens += call_result.input_tokens
            ctx.total_output_tokens += call_result.output_tokens
            ctx.total_thinking_tokens += call_result.thinking_tokens
            ctx.total_tokens += call_result.total_tokens
            ctx.total_cost_usd += call_result.cost_usd
            ctx.total_duration_ms += elapsed_ms

            if on_llm_call_complete:
                await on_llm_call_complete(0, call_result)

            logger.info("[llm] Anthropic: ~%d chunks [%d in, %d out, %d thinking, $%.6f, %dms]",
                        token_count, call_result.input_tokens, call_result.output_tokens,
                        call_result.thinking_tokens, call_result.cost_usd, elapsed_ms)


async def _call_google_streaming_enhanced(
    api_key: str, model: str, messages: list[dict],
    temperature: float, max_tokens: int,
    ctx: StreamingContext, system_prompt: str,
    on_llm_call_start=None, on_llm_call_complete=None,
    top_p: float = 1.0,
    stop_sequences: list[str] | None = None,
) -> AsyncGenerator[str, None]:
    """Stream from Google AI (Gemini) with Layer 1 capture."""
    contents = []
    system_text = ""
    for m in messages:
        if m["role"] == "system":
            system_text += m["content"] + "\n"
        elif m["role"] == "user":
            contents.append({"role": "user", "parts": [{"text": m["content"]}]})
        elif m["role"] == "assistant":
            contents.append({"role": "model", "parts": [{"text": m["content"]}]})

    if not contents:
        contents = [{"role": "user", "parts": [{"text": "Hello"}]}]

    gen_config: dict[str, Any] = {
        "temperature": temperature,
        "maxOutputTokens": max_tokens,
        "topP": top_p,
    }
    if stop_sequences:
        gen_config["stopSequences"] = stop_sequences

    body: dict[str, Any] = {
        "contents": contents,
        "generationConfig": gen_config,
    }
    if system_text.strip():
        body["systemInstruction"] = {"parts": [{"text": system_text.strip()}]}

    call_result = LLMCallResult(
        model_id=model,
        provider="google_ai",
        input_messages=list(messages),
        temperature=temperature,
        max_output_tokens=max_tokens,
        system_prompt=system_text.strip(),
    )

    if on_llm_call_start:
        await on_llm_call_start(0, model, messages)

    start_time = time.monotonic()
    ttft_recorded = False

    logger.info("[llm] Calling Google AI: model=%s messages=%d", model, len(contents))

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?key={api_key}&alt=sse"

    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", url, json=body) as resp:
            if resp.status_code != 200:
                error_body = await resp.aread()
                raise RuntimeError(f"Google AI returned {resp.status_code}: {error_body.decode()[:200]}")

            token_count = 0
            full_text = ""
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                try:
                    event = json.loads(line[6:])
                except Exception:
                    continue

                # Capture usage metadata from Gemini response
                usage_meta = event.get("usageMetadata", {})
                if usage_meta:
                    call_result.input_tokens = usage_meta.get("promptTokenCount", 0)
                    call_result.output_tokens = usage_meta.get("candidatesTokenCount", 0)

                candidates = event.get("candidates", [])
                for candidate in candidates:
                    # Capture finish_reason
                    fr = candidate.get("finishReason", "")
                    if fr:
                        reason_map = {"STOP": "end_turn", "MAX_TOKENS": "max_tokens", "SAFETY": "content_filter"}
                        call_result.stop_reason = reason_map.get(fr, fr.lower())

                    parts = candidate.get("content", {}).get("parts", [])
                    for part in parts:
                        text = part.get("text", "")
                        if text:
                            if not ttft_recorded:
                                call_result.time_to_first_token_ms = int((time.monotonic() - start_time) * 1000)
                                ttft_recorded = True
                            token_count += 1
                            full_text += text
                            yield text

            elapsed_ms = int((time.monotonic() - start_time) * 1000)
            call_result.latency_ms = elapsed_ms
            call_result.output_text = full_text
            call_result.total_tokens = call_result.input_tokens + call_result.output_tokens

            gen_time = elapsed_ms - call_result.time_to_first_token_ms
            if gen_time > 0 and call_result.output_tokens > 0:
                call_result.tokens_per_second = call_result.output_tokens / (gen_time / 1000)

            cost = compute_cost(model, call_result.input_tokens, call_result.output_tokens)
            call_result.cost_usd = cost.total_cost

            ctx.llm_calls.append(call_result)
            ctx.total_input_tokens += call_result.input_tokens
            ctx.total_output_tokens += call_result.output_tokens
            ctx.total_tokens += call_result.total_tokens
            ctx.total_cost_usd += call_result.cost_usd
            ctx.total_duration_ms += elapsed_ms

            if on_llm_call_complete:
                await on_llm_call_complete(0, call_result)

            logger.info("[llm] Google AI: ~%d chunks [%d in, %d out, $%.6f, %dms]",
                        token_count, call_result.input_tokens, call_result.output_tokens,
                        call_result.cost_usd, elapsed_ms)


def _build_tool_input_summary(tool_name: str, args: dict) -> str:
    """Generate a human-readable one-liner for tool input."""
    if tool_name == "web_search":
        return f"Search for: '{args.get('query', '')}'"
    if tool_name == "calculator":
        return f"Calculate: {args.get('expression', '')}"
    if tool_name == "document_reader":
        return f"Read: {args.get('file_name', args.get('url', ''))}"

    # Generic: show first key-value
    if args:
        first_key = next(iter(args))
        first_val = str(args[first_key])[:50]
        return f"{tool_name}: {first_key}={first_val}"
    return tool_name
