"""Tool executor — converts tool DB records into OpenAI function schemas
and executes tool calls returned by the LLM.

Currently supports:
- web_search (Tavily)
- calculator (eval-based)
- Other tools: return a placeholder message
"""

import json
import logging
from typing import Any

import httpx

from app.database import supabase
from app.services.api_key_service import _decrypt

logger = logging.getLogger("ws.tools")


# ── Convert tool DB records to OpenAI function schemas ────

def build_openai_tools(tool_records: list[dict]) -> list[dict]:
    """Convert tool DB records into OpenAI function-calling tool schemas."""
    tools = []
    for rec in tool_records:
        name = rec.get("tool_name", "unknown")
        schema = _get_function_schema(name, rec)
        if schema:
            tools.append({"type": "function", "function": schema})
    return tools


def _get_function_schema(tool_name: str, rec: dict) -> dict | None:
    """Return an OpenAI function schema for a known tool."""
    SCHEMAS = {
        "web_search": {
            "name": "web_search",
            "description": "Search the web for real-time information. Use this when you need current news, recent events, or up-to-date facts.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query to look up on the web",
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Number of results to return (default 5)",
                        "default": 5,
                    },
                },
                "required": ["query"],
            },
        },
        "calculator": {
            "name": "calculator",
            "description": "Perform mathematical calculations. Returns the numeric result.",
            "parameters": {
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "The math expression to evaluate (e.g., '2 + 2', '100 * 1.05 ** 5')",
                    },
                },
                "required": ["expression"],
            },
        },
        "summarizer": {
            "name": "summarizer",
            "description": "Summarize a long piece of text into a concise version.",
            "parameters": {
                "type": "object",
                "properties": {
                    "text": {
                        "type": "string",
                        "description": "The text to summarize",
                    },
                    "length": {
                        "type": "string",
                        "enum": ["short", "medium", "long"],
                        "description": "Desired summary length",
                        "default": "medium",
                    },
                },
                "required": ["text"],
            },
        },
    }

    schema = SCHEMAS.get(tool_name)
    if schema:
        return schema

    # Fallback: generate a generic schema from the tool record
    return {
        "name": tool_name,
        "description": rec.get("description", f"Execute the {rec.get('display_name', tool_name)} tool."),
        "parameters": {
            "type": "object",
            "properties": {
                "input": {
                    "type": "string",
                    "description": "Input for the tool",
                },
            },
            "required": ["input"],
        },
    }


# ── Execute a tool call ──────────────────────────────────

async def execute_tool_call(
    tool_name: str,
    arguments: dict[str, Any],
    user_id: str,
) -> str:
    """Execute a tool call and return the result as a string."""
    logger.info("[tools] Executing tool: %s with args: %s", tool_name, json.dumps(arguments)[:200])

    try:
        if tool_name == "web_search":
            return await _execute_web_search(arguments, user_id)
        elif tool_name == "calculator":
            return _execute_calculator(arguments)
        else:
            return json.dumps({
                "status": "executed",
                "tool": tool_name,
                "note": f"Tool '{tool_name}' executed successfully (simulated).",
                "input": arguments,
            })
    except Exception as e:
        logger.error("[tools] Tool execution failed: %s — %s", tool_name, e)
        return json.dumps({"error": str(e), "tool": tool_name})


async def _execute_web_search(args: dict, user_id: str) -> str:
    """Call Tavily API for web search."""
    query = args.get("query", "")
    max_results = args.get("max_results", 5)

    if not query:
        return json.dumps({"error": "No query provided"})

    # Get Tavily API key for this user
    api_key = _get_user_api_key(user_id, "tavily")
    if not api_key:
        return json.dumps({
            "error": "No Tavily API key configured. Go to Settings -> API Keys to add one.",
        })

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": api_key,
                "query": query,
                "max_results": max_results,
                "search_depth": "advanced",
                "include_answer": True,
            },
        )

    if resp.status_code != 200:
        return json.dumps({"error": f"Tavily returned {resp.status_code}: {resp.text[:200]}"})

    data = resp.json()
    # Format results for the LLM
    results = []
    if data.get("answer"):
        results.append(f"**Summary:** {data['answer']}")
    for r in data.get("results", []):
        results.append(f"- [{r.get('title', 'Untitled')}]({r.get('url', '')})\n  {r.get('content', '')[:300]}")

    return "\n\n".join(results) if results else "No results found."


def _execute_calculator(args: dict) -> str:
    """Safely evaluate a math expression."""
    expr = args.get("expression", "")
    if not expr:
        return json.dumps({"error": "No expression provided"})

    # Only allow safe math characters
    import re
    if not re.match(r'^[\d\s\+\-\*\/\.\(\)\%\*\^e]+$', expr):
        return json.dumps({"error": "Expression contains disallowed characters"})

    try:
        # Replace ^ with ** for Python
        safe_expr = expr.replace("^", "**")
        result = eval(safe_expr, {"__builtins__": {}}, {})
        return json.dumps({"result": result, "expression": expr})
    except Exception as e:
        return json.dumps({"error": f"Calculation failed: {e}"})


def _get_user_api_key(user_id: str, provider: str) -> str | None:
    """Fetch and decrypt an API key for a user+provider."""
    resp = (
        supabase.table("api_keys")
        .select("encrypted_key")
        .eq("user_id", user_id)
        .eq("provider", provider)
        .execute()
    )
    if not resp.data:
        return None
    try:
        return _decrypt(resp.data[0]["encrypted_key"])
    except Exception:
        return None


# ── Fetch tool records by IDs ────────────────────────────

def fetch_tools_by_ids(tool_ids: list[str]) -> list[dict]:
    """Fetch tool records from DB by their IDs."""
    if not tool_ids:
        return []
    resp = supabase.table("tools").select("*").in_("id", tool_ids).execute()
    return resp.data or []
