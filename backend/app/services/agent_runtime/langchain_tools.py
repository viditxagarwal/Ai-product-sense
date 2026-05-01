"""LangChain tool adapters for the product tool registry."""

from __future__ import annotations

from functools import partial
from typing import Any

from app.services.tool_executor import execute_tool_call


def _single_input_schema(tool_name: str):
    try:
        from pydantic import BaseModel, Field, create_model
    except ImportError as exc:
        raise RuntimeError("pydantic is required to build LangChain tool schemas.") from exc

    if tool_name == "web_search":
        return create_model(
            "WebSearchInput",
            query=(str, Field(..., description="The search query to look up on the web")),
            max_results=(int, Field(5, description="Number of search results to return")),
        )
    if tool_name == "calculator":
        return create_model(
            "CalculatorInput",
            expression=(str, Field(..., description="Math expression to evaluate")),
        )
    if tool_name == "file_writer":
        return create_model(
            "FileWriterInput",
            filename=(str, Field(..., description="Output filename including extension")),
            content=(str, Field(..., description="Artifact content")),
            file_type=(str | None, Field(None, description="Optional MIME type")),
        )

    return create_model(
        f"{tool_name.title().replace('_', '')}Input",
        input=(str, Field(..., description="Input for the tool")),
    )


def build_langchain_tools(
    tool_records: list[dict[str, Any]],
    *,
    user_id: str,
    thread_id: str | None,
) -> list[Any]:
    """Convert DB tool records into LangChain StructuredTool objects."""
    try:
        from langchain_core.tools import StructuredTool
    except ImportError as exc:
        raise RuntimeError(
            "LangChain runtime selected but langchain-core is not installed. "
            "Install backend requirements or set AGENT_RUNTIME=legacy."
        ) from exc

    tools = []
    for record in tool_records:
        name = record.get("tool_name") or "unknown_tool"
        description = record.get("description") or f"Execute {record.get('display_name') or name}."
        args_schema = _single_input_schema(name)

        async def _coroutine(_name: str, **kwargs):
            return await execute_tool_call(_name, kwargs, user_id=user_id, thread_id=thread_id)

        tools.append(
            StructuredTool.from_function(
                coroutine=partial(_coroutine, name),
                name=name,
                description=description,
                args_schema=args_schema,
            )
        )

    return tools
