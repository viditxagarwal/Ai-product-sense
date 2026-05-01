"""Compile the product workflow DSL into LangGraph primitives.

The frontend stores a PM-friendly React Flow graph. This module keeps that as
the source of truth and translates it into a LangGraph StateGraph at runtime.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, NotRequired, Protocol, TypedDict


END_ROUTE = "__end__"
SUPPORTED_NODE_TYPES = {"start", "end", "node", "gate", "split"}
SUPPORTED_EDGE_TYPES = {"flow", "conditional", "loop"}
SUPPORTED_CONDITION_METHODS = {
    "always",
    "field_comparison",
    "pattern_match",
    "multi_condition",
    "llm_evaluation",
    "webhook_function",
}


class AgentGraphState(TypedDict, total=False):
    user_message: str
    current_input: str
    node_outputs: dict[str, Any]
    path_taken: list[str]
    loop_counts: dict[str, int]
    next_node: str | None
    final_output: str
    total_duration_ms: int
    total_tokens: int
    total_input_tokens: int
    total_output_tokens: int
    total_thinking_tokens: int
    total_cost_usd: float
    total_llm_calls: int
    total_tool_calls: int
    models_used: list[str]
    tools_used: list[str]
    cost_by_model: dict[str, float]
    cost_by_node: dict[str, float]
    created_files: list[dict[str, Any]]
    langsmith_trace_url: NotRequired[str | None]


class RuntimeCompilerHooks(Protocol):
    def make_node(self, node_id: str, node: dict[str, Any]) -> Callable[[AgentGraphState], Any]:
        ...


@dataclass(frozen=True)
class GraphSnapshot:
    nodes: dict[str, dict[str, Any]]
    edges: list[dict[str, Any]]
    outgoing: dict[str, list[dict[str, Any]]]
    incoming: dict[str, list[dict[str, Any]]]
    start_node_id: str | None
    end_node_ids: set[str]


def component_type(node: dict[str, Any]) -> str:
    data = node.get("data") or {}
    return data.get("componentType") or data.get("nodeType") or node.get("type") or "node"


def edge_type(edge: dict[str, Any]) -> str:
    data = edge.get("data") or {}
    return data.get("edgeType") or edge.get("type") or "flow"


def graph_snapshot(graph_data: dict[str, Any]) -> GraphSnapshot:
    nodes = {node["id"]: node for node in graph_data.get("nodes", []) if node.get("id")}
    edges = [edge for edge in graph_data.get("edges", []) if edge.get("source") and edge.get("target")]
    outgoing = {node_id: [] for node_id in nodes}
    incoming = {node_id: [] for node_id in nodes}

    for edge in edges:
        source = edge.get("source")
        target = edge.get("target")
        if source in outgoing:
            outgoing[source].append(edge)
        if target in incoming:
            incoming[target].append(edge)

    start_node_id = next((node_id for node_id, node in nodes.items() if component_type(node) == "start"), None)
    if start_node_id is None:
        start_node_id = next((node_id for node_id in nodes if not incoming.get(node_id)), None)
    end_node_ids = {node_id for node_id, node in nodes.items() if component_type(node) == "end"}

    return GraphSnapshot(
        nodes=nodes,
        edges=edges,
        outgoing=outgoing,
        incoming=incoming,
        start_node_id=start_node_id,
        end_node_ids=end_node_ids,
    )


def validate_langgraph_compatibility(graph_data: dict[str, Any]) -> dict[str, Any]:
    """Return compile-readiness details for the LangGraph runtime."""
    snapshot = graph_snapshot(graph_data)
    errors: list[str] = []
    warnings: list[str] = []
    capabilities = {
        "simple_flow": True,
        "conditional_edges": False,
        "loop_edges": False,
        "gate_nodes": False,
        "split_nodes": False,
        "tool_bound_nodes": False,
    }

    if not snapshot.nodes:
        errors.append("LangGraph compiler requires at least one node.")
    if not snapshot.start_node_id:
        errors.append("LangGraph compiler requires a START node or a node with no incoming edges.")
    if not snapshot.end_node_ids:
        warnings.append("No END node found. The compiler will terminate when a node has no outgoing edge.")

    node_ids = set(snapshot.nodes)
    for node_id, node in snapshot.nodes.items():
        ctype = component_type(node)
        label = (node.get("data") or {}).get("label", node_id)
        if ctype not in SUPPORTED_NODE_TYPES:
            warnings.append(f"Node '{label}' uses legacy type '{ctype}' and will run as a standard LLM node.")
        if ctype == "gate":
            capabilities["gate_nodes"] = True
        if ctype == "split":
            capabilities["split_nodes"] = True
        if (node.get("data") or {}).get("boundTools"):
            capabilities["tool_bound_nodes"] = True

    for edge in snapshot.edges:
        source = edge.get("source")
        target = edge.get("target")
        label = edge.get("id", f"{source}->{target}")
        etype = edge_type(edge)
        data = edge.get("data") or {}

        if source not in node_ids:
            errors.append(f"Edge '{label}' references missing source node '{source}'.")
        if target not in node_ids:
            errors.append(f"Edge '{label}' references missing target node '{target}'.")
        if etype not in SUPPORTED_EDGE_TYPES:
            warnings.append(f"Edge '{label}' uses legacy type '{etype}' and will be treated as a flow edge.")
        if etype == "conditional":
            capabilities["conditional_edges"] = True
            method = data.get("conditionMethod", "always")
            if method not in SUPPORTED_CONDITION_METHODS:
                warnings.append(f"Conditional edge '{label}' uses unsupported method '{method}'.")
        if etype == "loop":
            capabilities["loop_edges"] = True

    return {
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "capabilities": capabilities,
        "runtime": "langgraph",
    }


def route_from_state(state: AgentGraphState) -> str:
    return state.get("next_node") or END_ROUTE


def build_state_graph(graph_data: dict[str, Any], runtime: RuntimeCompilerHooks):
    """Build and compile a LangGraph StateGraph.

    Imports are intentionally local so the legacy runtime can boot without
    LangGraph installed. Selecting AGENT_RUNTIME=langgraph requires the deps.
    """
    try:
        from langgraph.graph import END, START, StateGraph
    except ImportError as exc:
        raise RuntimeError(
            "LangGraph runtime selected but langgraph is not installed. "
            "Install backend requirements or set AGENT_RUNTIME=legacy."
        ) from exc

    snapshot = graph_snapshot(graph_data)
    validation = validate_langgraph_compatibility(graph_data)
    if not validation["valid"]:
        raise RuntimeError("; ".join(validation["errors"]))
    if not snapshot.start_node_id:
        raise RuntimeError("No start node found for LangGraph compilation.")

    builder = StateGraph(AgentGraphState)
    all_routes = {node_id: node_id for node_id in snapshot.nodes}
    all_routes[END_ROUTE] = END

    for node_id, node in snapshot.nodes.items():
        builder.add_node(node_id, runtime.make_node(node_id, node))

    builder.add_edge(START, snapshot.start_node_id)

    for node_id, node in snapshot.nodes.items():
        if node_id in snapshot.end_node_ids:
            builder.add_edge(node_id, END)
            continue
        builder.add_conditional_edges(node_id, route_from_state, all_routes)

    try:
        from langgraph.checkpoint.memory import MemorySaver

        return builder.compile(checkpointer=MemorySaver())
    except Exception:
        return builder.compile()
