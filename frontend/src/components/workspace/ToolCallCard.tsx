"use client";

/**
 * Section C.3: Tool Call Cards (C3)
 * Shows each tool call as a card with input/output, duration, status.
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Wrench,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExecutionEvent, ToolCallData } from "@/types";

interface Props {
  event: ExecutionEvent;
}

export default function ToolCallCard({ event }: Props) {
  const [expanded, setExpanded] = useState(false);
  const d: ToolCallData = event.data as unknown as ToolCallData;
  const isError = d.status === "error";

  return (
    <div className={cn(
      "my-1 rounded border",
      isError ? "border-red-200 bg-red-50/30" : "border-slate-200 bg-white"
    )}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2 py-1 text-left"
      >
        {expanded ? <ChevronDown className="size-3 text-slate-400" /> : <ChevronRight className="size-3 text-slate-400" />}
        <Wrench className={cn("size-3", isError ? "text-red-400" : "text-orange-400")} />
        <span className="text-[10px] font-medium text-slate-600">
          {d.tool_display_name || d.tool_name}
        </span>

        {/* Status badge */}
        {isError ? (
          <XCircle className="size-3 text-red-500" />
        ) : (
          <CheckCircle2 className="size-3 text-emerald-500" />
        )}

        {/* Input summary */}
        {d.input_summary && (
          <span className="truncate text-[9px] text-slate-400">
            {d.input_summary}
          </span>
        )}

        <div className="flex-1" />

        <span className="text-[9px] text-slate-400">{d.duration_ms}ms</span>
        {d.cache_hit && (
          <span className="rounded bg-emerald-50 px-1 py-0.5 text-[8px] text-emerald-600">cached</span>
        )}
      </button>

      {/* Error message (always visible if error) */}
      {isError && d.error_message && (
        <div className="mx-2 mb-1 rounded bg-red-50 px-2 py-1 text-[10px] text-red-600">
          {d.error_message}
        </div>
      )}

      {expanded && (
        <div className="space-y-1.5 border-t px-2 pb-2 pt-1">
          {/* Input arguments */}
          {d.input_arguments && Object.keys(d.input_arguments).length > 0 && (
            <div>
              <h6 className="text-[9px] font-semibold text-slate-400">Input</h6>
              <pre className="max-h-24 overflow-auto rounded bg-slate-50 p-1.5 text-[9px] text-slate-600">
                {JSON.stringify(d.input_arguments, null, 2)}
              </pre>
            </div>
          )}

          {/* Output result */}
          {d.output_result != null && (
            <div>
              <h6 className="text-[9px] font-semibold text-slate-400">
                Output ({d.output_type}, {formatBytes(d.output_size_bytes)})
              </h6>
              <pre className="max-h-32 overflow-auto rounded bg-slate-50 p-1.5 text-[9px] text-slate-600">
                {(() => {
                  try {
                    const text = typeof d.output_result === "string"
                      ? d.output_result
                      : JSON.stringify(d.output_result, null, 2);
                    return text.length > 500 ? text.slice(0, 500) + "..." : text;
                  } catch {
                    return String(d.output_result);
                  }
                })()}
              </pre>
            </div>
          )}

          {/* Metadata */}
          <div className="flex flex-wrap gap-2 text-[9px] text-slate-400">
            <span>Triggered by: {d.triggered_by}</span>
            {d.retry_count > 0 && <span className="text-amber-500">Retries: {d.retry_count}</span>}
            {d.tool_category && <span>Category: {d.tool_category}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
