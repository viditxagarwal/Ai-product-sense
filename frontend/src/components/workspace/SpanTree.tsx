"use client";

import { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Layers,
  Box,
  Zap,
  Wrench,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExecutionEvent, ExecutionSummary } from "@/types";

interface SpanTreeProps {
  events: ExecutionEvent[];
  summary: ExecutionSummary;
}

interface TreeNode {
  event: ExecutionEvent;
  children: TreeNode[];
  depth: number;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function buildTree(events: ExecutionEvent[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const e of events) {
    byId.set(e.id, { event: e, children: [], depth: 0 });
  }

  const roots: TreeNode[] = [];
  for (const node of Array.from(byId.values())) {
    const pid = node.event.parent_event_id;
    if (pid && byId.has(pid)) {
      const parent = byId.get(pid)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function eventIcon(eventType: string) {
  if (eventType.startsWith("workflow_")) return <Layers className="h-3 w-3 shrink-0" />;
  if (eventType.startsWith("node_")) return <Box className="h-3 w-3 shrink-0" />;
  if (eventType.startsWith("llm_call_")) return <Zap className="h-3 w-3 shrink-0" />;
  if (eventType.startsWith("tool_")) return <Wrench className="h-3 w-3 shrink-0" />;
  return <Box className="h-3 w-3 shrink-0" />;
}

function iconColor(eventType: string) {
  if (eventType.startsWith("workflow_")) return "text-purple-500";
  if (eventType.startsWith("node_")) return "text-blue-500";
  if (eventType.startsWith("llm_call_")) return "text-yellow-500";
  if (eventType.startsWith("tool_")) return "text-orange-500";
  return "text-muted-foreground";
}

function labelForEvent(event: ExecutionEvent): string {
  const d = event.data as Record<string, unknown>;
  // Prefer explicit name fields
  if (typeof d.node_name === "string") return d.node_name;
  if (typeof d.workflow_name === "string") return d.workflow_name;
  if (typeof d.tool_name === "string") return d.tool_name;
  if (typeof d.model_id === "string") return d.model_id;
  // Fall back to readable event_type
  return event.event_type.replace(/_/g, " ");
}

function durationMs(event: ExecutionEvent): number | null {
  const d = event.data as Record<string, unknown>;
  if (typeof d.duration_ms === "number") return d.duration_ms;
  if (typeof d.latency_ms === "number") return d.latency_ms;
  return null;
}

function tokenCount(event: ExecutionEvent): number | null {
  const d = event.data as Record<string, unknown>;
  if (typeof d.total_tokens === "number") return d.total_tokens;
  if (typeof d.input_tokens === "number" && typeof d.output_tokens === "number")
    return (d.input_tokens as number) + (d.output_tokens as number);
  return null;
}

function isCompleted(eventType: string) {
  return (
    eventType.endsWith("_completed") ||
    eventType.endsWith("_finished") ||
    eventType.endsWith("_success")
  );
}

function isFailed(event: ExecutionEvent) {
  const d = event.data as Record<string, unknown>;
  return (
    event.event_type.endsWith("_failed") ||
    event.event_type.endsWith("_error") ||
    d.status === "failed" ||
    d.status === "error"
  );
}

// ─── single span row ─────────────────────────────────────────────────────────

interface SpanRowProps {
  node: TreeNode;
}

function SpanRow({ node }: SpanRowProps) {
  const [expanded, setExpanded] = useState(true);
  const { event, children, depth } = node;

  const label = labelForEvent(event);
  const dur = durationMs(event);
  const tokens = tokenCount(event);
  const failed = isFailed(event);
  const completed = isCompleted(event.event_type);
  const hasChildren = children.length > 0;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 py-0.5 rounded hover:bg-muted/50 transition-colors cursor-default text-xs",
          depth === 0 ? "font-semibold" : "font-normal"
        )}
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={() => hasChildren && setExpanded((v) => !v)}
      >
        {/* expand / collapse arrow */}
        <span className="w-3 h-3 flex items-center justify-center text-muted-foreground">
          {hasChildren ? (
            expanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )
          ) : null}
        </span>

        {/* icon */}
        <span className={cn(iconColor(event.event_type))}>{eventIcon(event.event_type)}</span>

        {/* label */}
        <span className="truncate max-w-[160px] text-foreground" title={label}>
          {label}
        </span>

        {/* duration */}
        {dur !== null && (
          <span className="ml-1 text-muted-foreground shrink-0">
            {dur < 1000 ? `${dur}ms` : `${(dur / 1000).toFixed(2)}s`}
          </span>
        )}

        {/* tokens */}
        {tokens !== null && (
          <span className="ml-1 text-muted-foreground shrink-0">{tokens} tok</span>
        )}

        {/* status */}
        <span className="ml-auto shrink-0">
          {failed ? (
            <XCircle className="h-3 w-3 text-red-500" />
          ) : completed ? (
            <CheckCircle2 className="h-3 w-3 text-green-500" />
          ) : null}
        </span>
      </div>

      {/* children */}
      {hasChildren && expanded && (
        <div>
          {children.map((child) => (
            <SpanRow key={child.event.id} node={child} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function SpanTree({ events, summary }: SpanTreeProps) {
  const roots = useMemo(() => buildTree(events), [events]);

  return (
    <div className="text-xs space-y-0.5">
      {/* summary row */}
      <div className="flex items-center gap-3 px-1 py-1.5 border-b border-border text-muted-foreground mb-1 flex-wrap">
        <span>
          <span className="font-medium text-foreground">{summary.step_count}</span> steps
        </span>
        <span>
          <span className="font-medium text-foreground">{summary.total_llm_calls}</span> LLM calls
        </span>
        <span>
          <span className="font-medium text-foreground">{summary.total_tool_calls}</span> tool calls
        </span>
        <span>
          <span className="font-medium text-foreground">{summary.total_tokens.toLocaleString()}</span> tokens
        </span>
        {summary.total_duration_ms > 0 && (
          <span>
            <span className="font-medium text-foreground">
              {summary.total_duration_ms < 1000
                ? `${summary.total_duration_ms}ms`
                : `${(summary.total_duration_ms / 1000).toFixed(2)}s`}
            </span>
          </span>
        )}
      </div>

      {roots.length === 0 ? (
        <p className="px-2 py-4 text-center text-muted-foreground">No events</p>
      ) : (
        roots.map((root) => <SpanRow key={root.event.id} node={root} />)
      )}
    </div>
  );
}
