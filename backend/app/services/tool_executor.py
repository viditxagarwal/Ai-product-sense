"""Tool executor — converts tool DB records into OpenAI function schemas
and executes tool calls returned by the LLM.

Currently supports:
- web_search (Tavily)
- calculator (eval-based)
- Other tools: return a placeholder message
"""

import json
import logging
from io import BytesIO
from typing import Any

import httpx
from openpyxl import Workbook

from app.database import supabase
from app.services.api_key_service import _decrypt
from app.services.file_context_service import (
    extract_file_text,
    persist_generated_artifact,
    persist_generated_artifact_bytes,
)

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
        "file_writer": {
            "name": "file_writer",
            "description": "Create a real downloadable artifact file in the current thread. Use this whenever the user asks for an Excel, CSV, Markdown, JSON, or text artifact. After calling this tool, do not repeat the artifact body in chat; only summarize that the file was created.",
            "parameters": {
                "type": "object",
                "properties": {
                    "filename": {
                        "type": "string",
                        "description": "Output filename including extension, e.g. analysis.xlsx, summary.md, data.csv",
                    },
                    "content": {
                        "type": "string",
                        "description": "Artifact content. For Excel, provide JSON, CSV, or markdown-table-like data.",
                    },
                    "file_type": {
                        "type": "string",
                        "description": "MIME type, e.g. application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, text/csv, text/markdown, application/json",
                    },
                },
                "required": ["filename", "content"],
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
    thread_id: str | None = None,
) -> str:
    """Execute a tool call and return the result as a string."""
    logger.info("[tools] Executing tool: %s with args: %s", tool_name, json.dumps(arguments)[:200])

    try:
        if tool_name == "web_search":
            return await _execute_web_search(arguments, user_id)
        elif tool_name == "calculator":
            return _execute_calculator(arguments)
        elif tool_name == "document_reader":
            return _execute_document_reader(arguments, user_id)
        elif tool_name == "file_writer":
            return _execute_file_writer(arguments, thread_id)
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


def _execute_document_reader(args: dict, user_id: str) -> str:
    """Read a previously uploaded thread file by name or URL."""
    requested = (
        args.get("file_name")
        or args.get("filename")
        or args.get("url")
        or args.get("input")
        or ""
    )
    if not requested:
        return json.dumps({"error": "No file name or URL provided"})

    resp = (
        supabase.table("thread_files")
        .select("*, threads!inner(user_id)")
        .eq("source", "user_upload")
        .eq("threads.user_id", str(user_id))
        .execute()
    )
    files = resp.data or []
    match = None
    requested_lower = str(requested).lower()
    for file in files:
        name = str(file.get("file_name", "")).lower()
        url = str(file.get("file_url", "")).lower()
        if requested_lower in name or requested_lower in url or name in requested_lower:
            match = file
            break
    if not match and files:
        match = files[-1]

    if not match:
        return json.dumps({"error": f"No uploaded file found for '{requested}'"})

    parsed = extract_file_text(match, max_chars=20000)
    return json.dumps({
        "file_name": match.get("file_name"),
        "file_type": match.get("file_type"),
        "status": parsed["status"],
        "note": parsed.get("note"),
        "content": parsed["text"],
    })


def _execute_file_writer(args: dict, thread_id: str | None) -> str:
    if not thread_id:
        return json.dumps({"error": "file_writer requires an active thread_id"})

    filename = (
        args.get("filename")
        or args.get("file_name")
        or args.get("name")
        or "artifact.md"
    )
    content = args.get("content") or args.get("input") or ""
    if not isinstance(content, str):
        content = json.dumps(content, indent=2)

    file_type = args.get("file_type") or args.get("mime_type") or _guess_writer_mime(filename)

    if _is_excel(filename, file_type):
        workbook_bytes = _build_xlsx(content)
        record = persist_generated_artifact_bytes(
            thread_id=thread_id,
            filename=filename if filename.lower().endswith(".xlsx") else f"{filename}.xlsx",
            content=workbook_bytes,
            mime_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            change_summary={"source": "file_writer", "format": "xlsx"},
        )
    else:
        record = persist_generated_artifact(
            thread_id=thread_id,
            filename=filename,
            content=content,
            mime_type=file_type,
        )

    return json.dumps({
        "status": "created",
        "tool": "file_writer",
        "file_id": record["id"],
        "file_name": record["file_name"],
        "file_type": record["file_type"],
        "file_url": record["file_url"],
        "message": f"Created artifact {record['file_name']}. It is available in the Artifacts panel.",
    })


def _is_excel(filename: str, file_type: str) -> bool:
    return filename.lower().endswith((".xlsx", ".xlsm")) or "spreadsheet" in file_type


def _guess_writer_mime(filename: str) -> str:
    lower = filename.lower()
    if lower.endswith(".csv"):
        return "text/csv"
    if lower.endswith(".json"):
        return "application/json"
    if lower.endswith(".xlsx"):
        return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    if lower.endswith(".md"):
        return "text/markdown"
    return "text/plain"


def _build_xlsx(content: str) -> bytes:
    workbook = Workbook()
    worksheet = workbook.active
    worksheet.title = "Sheet1"

    rows = _rows_from_content(content)
    if not rows:
        rows = [["Content"], [content]]

    for row in rows:
        worksheet.append(row)

    stream = BytesIO()
    workbook.save(stream)
    return stream.getvalue()


def _rows_from_content(content: str) -> list[list[Any]]:
    try:
        parsed = json.loads(content)
        if isinstance(parsed, list):
            if all(isinstance(item, dict) for item in parsed):
                headers = list({key for item in parsed for key in item.keys()})
                return [headers] + [[item.get(header, "") for header in headers] for item in parsed]
            return [[item] if not isinstance(item, list) else item for item in parsed]
        if isinstance(parsed, dict):
            return [["Key", "Value"]] + [[key, json.dumps(value) if isinstance(value, (dict, list)) else value] for key, value in parsed.items()]
    except json.JSONDecodeError:
        pass

    lines = [line.strip() for line in content.splitlines() if line.strip()]
    table_lines = [line for line in lines if line.startswith("|") and line.endswith("|")]
    if table_lines:
        rows = []
        for line in table_lines:
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            if all(set(cell) <= {"-", ":"} for cell in cells):
                continue
            rows.append(cells)
        return rows

    if "," in content:
        return [[cell.strip() for cell in line.split(",")] for line in lines]
    return [[line] for line in lines]


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
