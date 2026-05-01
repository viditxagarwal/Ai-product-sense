"""Postman Integration Service (T3.7)

Converts between internal tool definitions and Postman Collection v2.1 format.
Supports import (Postman → tools) and export (tools → Postman collection).
"""

import json
from uuid import UUID

from app.database import supabase


def export_tools_as_postman(user_id: str, tool_ids: list[str] | None = None) -> dict:
    """Export registered tools as a Postman Collection v2.1 JSON."""
    query = supabase.table("tools").select("*").eq("user_id", user_id)
    if tool_ids:
        query = query.in_("id", tool_ids)
    resp = query.execute()
    tools = resp.data or []

    items = []
    for tool in tools:
        config_schema = tool.get("config_schema", {}) or {}
        default_config = tool.get("default_config", {}) or {}

        # Build a sample request body from config schema
        body_raw = {}
        for key, schema in config_schema.items():
            body_raw[key] = default_config.get(key, _schema_example(schema))

        item = {
            "name": tool.get("display_name", tool.get("tool_name", "unknown")),
            "request": {
                "method": "POST",
                "header": [{"key": "Content-Type", "value": "application/json"}],
                "body": {
                    "mode": "raw",
                    "raw": json.dumps(body_raw, indent=2),
                    "options": {"raw": {"language": "json"}},
                },
                "url": {
                    "raw": f"{{{{base_url}}}}/api/v1/tools/{tool['id']}/execute",
                    "host": ["{{base_url}}"],
                    "path": ["api", "v1", "tools", tool["id"], "execute"],
                },
                "description": tool.get("description", ""),
            },
        }
        items.append(item)

    return {
        "info": {
            "name": "AI Product Studio - Tools",
            "_postman_id": f"aps-export-{user_id[:8]}",
            "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        "item": items,
        "variable": [
            {"key": "base_url", "value": "http://localhost:8000", "type": "string"},
        ],
    }


def import_postman_collection(user_id: str, collection: dict) -> list[dict]:
    """Import a Postman Collection and create tool definitions from it."""
    items = collection.get("item", [])
    created = []

    for item in items:
        req = item.get("request", {})
        name = item.get("name", "Imported Tool")
        description = req.get("description", "") if isinstance(req.get("description"), str) else ""

        # Parse body to extract config schema
        body = req.get("body", {})
        raw = body.get("raw", "{}")
        try:
            body_data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            body_data = {}

        config_schema = {}
        for key, value in body_data.items():
            config_schema[key] = {"type": type(value).__name__, "description": f"Imported field: {key}"}

        # Extract URL info
        url = req.get("url", {})
        url_raw = url.get("raw", "") if isinstance(url, dict) else str(url)

        tool_payload = {
            "user_id": user_id,
            "tool_name": name.lower().replace(" ", "_"),
            "display_name": name,
            "description": description or f"Imported from Postman: {name}",
            "category": "imported",
            "is_builtin": False,
            "is_enabled": True,
            "default_config": body_data,
            "config_schema": config_schema,
            "metadata": {
                "postman_import": True,
                "original_url": url_raw,
                "original_method": req.get("method", "POST"),
            },
        }

        resp = supabase.table("tools").insert(tool_payload).execute()
        if resp.data:
            created.append(resp.data[0])

    return created


def _schema_example(schema: dict) -> str | int | bool | list:
    """Generate a sample value from a config schema entry."""
    stype = schema.get("type", "string")
    if stype == "integer":
        return schema.get("min", 0)
    if stype == "boolean":
        return False
    if stype == "array":
        return []
    if stype == "enum":
        values = schema.get("values", [])
        return values[0] if values else ""
    return ""
