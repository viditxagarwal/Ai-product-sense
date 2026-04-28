from uuid import UUID

from fastapi import HTTPException

from app.database import supabase
from app.models.tool import ToolCreate, ToolUpdate

DEFAULT_TOOLS: list[dict] = [
    {
        "tool_name": "calculator",
        "display_name": "Calculator",
        "description": "Performs mathematical calculations with configurable precision and verification.",
        "category": "computation",
        "is_builtin": True,
        "is_enabled": True,
        "default_config": {
            "precision": 10,
            "verification_mode": "double_check",
            "allowed_operations": ["arithmetic", "algebra", "statistics", "financial"],
        },
        "config_schema": {
            "precision": {"type": "integer", "min": 1, "max": 50, "description": "Decimal precision"},
            "verification_mode": {"type": "enum", "values": ["none", "double_check", "symbolic"], "description": "How to verify results"},
            "allowed_operations": {"type": "array", "items": "string", "description": "Allowed operation categories"},
        },
    },
    {
        "tool_name": "code_interpreter",
        "display_name": "Code Interpreter",
        "description": "Executes Python code in a sandboxed environment for data analysis and computation.",
        "category": "computation",
        "is_builtin": True,
        "is_enabled": True,
        "default_config": {
            "allowed_libraries": ["numpy", "pandas", "scipy", "matplotlib", "sympy"],
            "timeout_seconds": 30,
            "max_executions_per_turn": 5,
            "allow_file_output": True,
        },
        "config_schema": {
            "allowed_libraries": {"type": "array", "items": "string", "description": "Python libraries the interpreter can import"},
            "timeout_seconds": {"type": "integer", "min": 5, "max": 120, "description": "Max execution time per run"},
            "max_executions_per_turn": {"type": "integer", "min": 1, "max": 20, "description": "Max code executions per agent turn"},
            "allow_file_output": {"type": "boolean", "description": "Whether code can write output files"},
        },
    },
    {
        "tool_name": "document_reader",
        "display_name": "Document Reader",
        "description": "Extracts and parses content from uploaded documents (PDF, DOCX, TXT, etc.).",
        "category": "data_extraction",
        "is_builtin": True,
        "is_enabled": True,
        "default_config": {
            "extraction_mode": "structured",
            "metadata_extraction": True,
            "max_pages": 100,
            "ocr_enabled": False,
        },
        "config_schema": {
            "extraction_mode": {"type": "enum", "values": ["raw_text", "structured", "markdown", "html"], "description": "Output format for extracted content"},
            "metadata_extraction": {"type": "boolean", "description": "Extract document metadata (author, date, etc.)"},
            "max_pages": {"type": "integer", "min": 1, "max": 500, "description": "Max pages to process"},
            "ocr_enabled": {"type": "boolean", "description": "Enable OCR for scanned documents"},
        },
    },
    {
        "tool_name": "table_parser",
        "display_name": "Table Parser",
        "description": "Parses tabular data from documents, spreadsheets, and HTML into structured formats.",
        "category": "data_extraction",
        "is_builtin": True,
        "is_enabled": True,
        "default_config": {
            "parser_type": "auto_detect",
            "output_format": "json",
            "header_detection": True,
            "max_rows": 10000,
        },
        "config_schema": {
            "parser_type": {"type": "enum", "values": ["auto_detect", "csv", "excel", "html_table", "markdown_table"], "description": "Parser to use"},
            "output_format": {"type": "enum", "values": ["json", "csv", "markdown", "dataframe"], "description": "Output format for parsed tables"},
            "header_detection": {"type": "boolean", "description": "Automatically detect table headers"},
            "max_rows": {"type": "integer", "min": 1, "max": 100000, "description": "Max rows to parse"},
        },
    },
    {
        "tool_name": "web_search",
        "display_name": "Web Search (Tavily)",
        "description": "Searches the web for real-time information using the Tavily API.",
        "category": "external_data",
        "is_builtin": True,
        "is_enabled": False,
        "default_config": {
            "search_depth": "advanced",
            "max_results": 5,
            "domain_whitelist": [],
            "domain_blacklist": [],
            "include_raw_content": False,
        },
        "config_schema": {
            "search_depth": {"type": "enum", "values": ["basic", "advanced"], "description": "Search thoroughness"},
            "max_results": {"type": "integer", "min": 1, "max": 20, "description": "Maximum search results to return"},
            "domain_whitelist": {"type": "array", "items": "string", "description": "Only search these domains (empty = all)"},
            "domain_blacklist": {"type": "array", "items": "string", "description": "Exclude these domains"},
            "include_raw_content": {"type": "boolean", "description": "Include full page content in results"},
        },
    },
    {
        "tool_name": "financial_data_api",
        "display_name": "Financial Data API",
        "description": "Fetches financial data including stock prices, company financials, and market data.",
        "category": "external_data",
        "is_builtin": True,
        "is_enabled": False,
        "default_config": {
            "provider": "yahoo_finance",
            "data_types": ["price", "financials", "ratios"],
            "cache_ttl_minutes": 60,
            "max_lookback_years": 10,
        },
        "config_schema": {
            "provider": {"type": "enum", "values": ["yahoo_finance", "alpha_vantage", "polygon", "custom_api"], "description": "Data provider"},
            "data_types": {"type": "array", "items": "string", "description": "Types of financial data to fetch"},
            "cache_ttl_minutes": {"type": "integer", "min": 0, "max": 1440, "description": "Cache duration in minutes"},
            "max_lookback_years": {"type": "integer", "min": 1, "max": 30, "description": "Max historical data range"},
        },
    },
    {
        "tool_name": "file_writer",
        "display_name": "File Writer",
        "description": "Generates and writes output files in various formats (PDF, DOCX, CSV, JSON).",
        "category": "output",
        "is_builtin": True,
        "is_enabled": True,
        "default_config": {
            "allowed_formats": ["pdf", "docx", "csv", "json", "xlsx", "md", "txt"],
            "max_file_size_mb": 10,
            "template_support": True,
        },
        "config_schema": {
            "allowed_formats": {"type": "array", "items": "string", "description": "File formats the tool can generate"},
            "max_file_size_mb": {"type": "integer", "min": 1, "max": 100, "description": "Maximum output file size in MB"},
            "template_support": {"type": "boolean", "description": "Enable template-based file generation"},
        },
    },
    {
        "tool_name": "database_query",
        "display_name": "Database Query",
        "description": "Executes read-only SQL queries against connected databases.",
        "category": "data_extraction",
        "is_builtin": True,
        "is_enabled": False,
        "default_config": {
            "read_only": True,
            "max_rows": 1000,
            "timeout_seconds": 30,
            "allowed_tables": [],
        },
        "config_schema": {
            "read_only": {"type": "boolean", "description": "Restrict to SELECT queries only"},
            "max_rows": {"type": "integer", "min": 1, "max": 100000, "description": "Maximum rows to return"},
            "timeout_seconds": {"type": "integer", "min": 5, "max": 120, "description": "Query timeout"},
            "allowed_tables": {"type": "array", "items": "string", "description": "Tables the tool can query (empty = all)"},
        },
    },
    {
        "tool_name": "summarizer",
        "display_name": "Summarizer",
        "description": "Generates summaries of long documents or conversation history.",
        "category": "text_processing",
        "is_builtin": True,
        "is_enabled": True,
        "default_config": {
            "summary_length": "medium",
            "preserve_key_figures": True,
            "preserve_citations": True,
            "summary_style": "extractive_abstractive",
        },
        "config_schema": {
            "summary_length": {"type": "enum", "values": ["short", "medium", "long", "custom_token_count"], "description": "Target summary length"},
            "preserve_key_figures": {"type": "boolean", "description": "Keep numerical data and key figures intact"},
            "preserve_citations": {"type": "boolean", "description": "Maintain source citations in summary"},
            "summary_style": {"type": "enum", "values": ["extractive", "abstractive", "extractive_abstractive", "bullet_points"], "description": "Summarization approach"},
        },
    },
    {
        "tool_name": "notification_sender",
        "display_name": "Notification Sender",
        "description": "Sends notifications via email, Slack, or webhook when tasks complete or need attention.",
        "category": "integration",
        "is_builtin": True,
        "is_enabled": False,
        "default_config": {
            "channels": ["email"],
            "template": "default",
            "throttle_minutes": 5,
            "include_summary": True,
        },
        "config_schema": {
            "channels": {"type": "array", "items": "string", "description": "Notification channels (email, slack, webhook)"},
            "template": {"type": "enum", "values": ["default", "minimal", "detailed", "custom"], "description": "Notification template"},
            "throttle_minutes": {"type": "integer", "min": 0, "max": 60, "description": "Minimum minutes between notifications"},
            "include_summary": {"type": "boolean", "description": "Include task summary in notification"},
        },
    },
    {
        "tool_name": "validator",
        "display_name": "Validator",
        "description": "Validates agent outputs against rules, schemas, and quality checks before delivery.",
        "category": "quality",
        "is_builtin": True,
        "is_enabled": True,
        "default_config": {
            "check_types": ["format", "completeness", "consistency", "numerical_accuracy"],
            "failure_action": "flag_and_continue",
            "strict_mode": False,
            "custom_rules": [],
        },
        "config_schema": {
            "check_types": {"type": "array", "items": "string", "description": "Validation checks to perform"},
            "failure_action": {"type": "enum", "values": ["flag_and_continue", "retry", "halt", "fallback"], "description": "Action on validation failure"},
            "strict_mode": {"type": "boolean", "description": "Treat warnings as failures"},
            "custom_rules": {"type": "array", "items": "object", "description": "Custom validation rules"},
        },
    },
]


def list_tools(user_id: UUID, page: int = 1, per_page: int = 20) -> dict:
    offset = (page - 1) * per_page
    count_resp = (
        supabase.table("tools")
        .select("*", count="exact")
        .eq("user_id", str(user_id))
        .execute()
    )
    total = count_resp.count or 0

    resp = (
        supabase.table("tools")
        .select("*")
        .eq("user_id", str(user_id))
        .order("created_at", desc=True)
        .range(offset, offset + per_page - 1)
        .execute()
    )
    return {"data": resp.data, "count": total, "page": page}


def get_tool(user_id: UUID, tool_id: UUID) -> dict:
    resp = (
        supabase.table("tools")
        .select("*")
        .eq("id", str(tool_id))
        .eq("user_id", str(user_id))
        .single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Tool not found")
    return resp.data


def create_tool(user_id: UUID, data: ToolCreate) -> dict:
    payload = data.model_dump(mode="json")
    payload["user_id"] = str(user_id)
    resp = supabase.table("tools").insert(payload).execute()
    return resp.data[0]


def update_tool(user_id: UUID, tool_id: UUID, data: ToolUpdate) -> dict:
    get_tool(user_id, tool_id)
    payload = data.model_dump(exclude_none=True, mode="json")
    if not payload:
        raise HTTPException(status_code=400, detail="No fields to update")
    resp = (
        supabase.table("tools")
        .update(payload)
        .eq("id", str(tool_id))
        .eq("user_id", str(user_id))
        .execute()
    )
    return resp.data[0]


def delete_tool(user_id: UUID, tool_id: UUID) -> dict:
    get_tool(user_id, tool_id)
    supabase.table("tools").delete().eq("id", str(tool_id)).eq(
        "user_id", str(user_id)
    ).execute()
    return {"success": True}


def seed_default_tools(user_id: UUID) -> list[dict]:
    rows = []
    for tool in DEFAULT_TOOLS:
        payload = {**tool, "user_id": str(user_id)}
        rows.append(payload)
    resp = supabase.table("tools").upsert(rows, on_conflict="user_id,tool_name").execute()
    return resp.data
