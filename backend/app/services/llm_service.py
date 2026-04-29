"""LLM service — retrieves API keys, calls models, streams responses.

Supports OpenAI and OpenAI-compatible providers (Groq, custom).
Anthropic support can be added later via the anthropic SDK.
"""

import json
import logging
from typing import AsyncGenerator

import httpx
from openai import AsyncOpenAI

from app.database import supabase
from app.services.api_key_service import _decrypt

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


def _resolve_provider(model: str) -> str:
    """Determine which provider a model belongs to."""
    for prefix, provider in MODEL_PROVIDER_MAP.items():
        if model.startswith(prefix):
            return provider
    return "openai"  # default


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


async def call_llm_streaming(
    user_id: str,
    model: str,
    messages: list[dict],
    temperature: float = 0.2,
    max_tokens: int = 4096,
    tools: list[dict] | None = None,
    tool_executor_fn=None,
) -> AsyncGenerator[str, None]:
    """Stream tokens from an LLM. Yields text chunks.

    If tools are provided, handles function-calling loop:
    LLM may return tool_calls → we execute them → feed results back → continue.

    Args:
        tools: OpenAI function-calling tool schemas
        tool_executor_fn: async fn(tool_name, arguments) -> str

    Raises RuntimeError with a user-friendly message on failure.
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

    if provider == "anthropic":
        async for chunk in _call_anthropic_streaming(api_key, model, messages, temperature, max_tokens):
            yield chunk
        return

    if provider == "google_ai":
        async for chunk in _call_google_streaming(api_key, model, messages, temperature, max_tokens):
            yield chunk
        return

    # OpenAI-compatible providers (openai, groq, custom_openai)
    base_url = key_data.get("base_url") or PROVIDER_BASE_URLS.get(provider, "https://api.openai.com/v1")
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    logger.info("[llm] Calling %s with %d messages, %d tools (model=%s, temp=%.1f)",
                provider, len(messages), len(tools or []), model, temperature)

    # Tool-calling loop: LLM may return tool_calls multiple times
    current_messages = list(messages)
    max_tool_rounds = 5  # prevent infinite loops

    for round_num in range(max_tool_rounds + 1):
        try:
            create_kwargs = {
                "model": model,
                "messages": current_messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }

            # Only pass tools on first call or when continuing tool loop
            if tools and tool_executor_fn:
                create_kwargs["tools"] = tools
                create_kwargs["stream"] = False  # non-streaming for tool calls

                response = await client.chat.completions.create(**create_kwargs)
                choice = response.choices[0]

                # Check if LLM wants to call tools
                if choice.finish_reason == "tool_calls" or (choice.message.tool_calls and len(choice.message.tool_calls) > 0):
                    logger.info("[llm] LLM requested %d tool call(s) (round %d)",
                                len(choice.message.tool_calls), round_num + 1)

                    # Add assistant message with tool calls
                    current_messages.append(choice.message.model_dump())

                    # Execute each tool call
                    for tc in choice.message.tool_calls:
                        fn_name = tc.function.name
                        try:
                            fn_args = json.loads(tc.function.arguments)
                        except json.JSONDecodeError:
                            fn_args = {"input": tc.function.arguments}

                        logger.info("[llm] Executing tool: %s(%s)", fn_name, json.dumps(fn_args)[:100])
                        yield f"\n\n🔧 *Using {fn_name}...*\n\n"

                        tool_result = await tool_executor_fn(fn_name, fn_args)

                        current_messages.append({
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": tool_result,
                        })

                    # Continue loop — LLM will see tool results
                    continue

                # No tool calls — LLM produced a final text response
                if choice.message.content:
                    yield choice.message.content
                logger.info("[llm] LLM responded with final text (round %d)", round_num + 1)
                return

            else:
                # No tools — simple streaming
                create_kwargs["stream"] = True
                stream = await client.chat.completions.create(**create_kwargs)

                token_count = 0
                async for chunk in stream:
                    delta = chunk.choices[0].delta if chunk.choices else None
                    if delta and delta.content:
                        token_count += 1
                        yield delta.content

                logger.info("[llm] LLM responded with ~%d chunks (model=%s)", token_count, model)
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


async def _call_anthropic_streaming(
    api_key: str, model: str, messages: list[dict],
    temperature: float, max_tokens: int,
) -> AsyncGenerator[str, None]:
    """Stream from Anthropic Messages API using httpx."""
    # Separate system message from conversation
    system_text = ""
    conv_messages = []
    for m in messages:
        if m["role"] == "system":
            system_text += m["content"] + "\n"
        else:
            conv_messages.append(m)

    if not conv_messages:
        conv_messages = [{"role": "user", "content": "Hello"}]

    body = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "messages": conv_messages,
        "stream": True,
    }
    if system_text.strip():
        body["system"] = system_text.strip()

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

            token_count = 0
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                data = line[6:]
                if data == "[DONE]":
                    break
                import json
                try:
                    event = json.loads(data)
                except Exception:
                    continue
                if event.get("type") == "content_block_delta":
                    text = event.get("delta", {}).get("text", "")
                    if text:
                        token_count += 1
                        yield text

            logger.info("[llm] Anthropic responded with ~%d chunks", token_count)


async def _call_google_streaming(
    api_key: str, model: str, messages: list[dict],
    temperature: float, max_tokens: int,
) -> AsyncGenerator[str, None]:
    """Stream from Google AI (Gemini) using httpx."""
    # Convert OpenAI format to Gemini format
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

    body = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        },
    }
    if system_text.strip():
        body["systemInstruction"] = {"parts": [{"text": system_text.strip()}]}

    logger.info("[llm] Calling Google AI: model=%s messages=%d", model, len(contents))

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?key={api_key}&alt=sse"

    async with httpx.AsyncClient(timeout=120) as client:
        async with client.stream("POST", url, json=body) as resp:
            if resp.status_code != 200:
                error_body = await resp.aread()
                raise RuntimeError(f"Google AI returned {resp.status_code}: {error_body.decode()[:200]}")

            token_count = 0
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                import json
                try:
                    event = json.loads(line[6:])
                except Exception:
                    continue
                candidates = event.get("candidates", [])
                for candidate in candidates:
                    parts = candidate.get("content", {}).get("parts", [])
                    for part in parts:
                        text = part.get("text", "")
                        if text:
                            token_count += 1
                            yield text

            logger.info("[llm] Google AI responded with ~%d chunks", token_count)
