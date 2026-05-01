"use client";

import { Loader2, CheckCircle2, XCircle, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExecutionStore } from "@/stores/execution-store";

export default function LiveToolCards() {
  const { liveTools, isStreaming, displaySettings } = useExecutionStore();

  if (!isStreaming) return null;
  if (displaySettings && !displaySettings.show_live_tool_cards) return null;

  // Only show recent tool executions (last 10)
  const recent = liveTools.slice(-10);
  if (recent.length === 0) return null;

  return (
    <div className="px-4 py-1 space-y-1">
      {recent.map((tool) => (
        <div
          key={tool.id}
          className={cn(
            "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs",
            tool.status === "running"
              ? "border-blue-200 bg-blue-50"
              : tool.status === "error"
              ? "border-red-200 bg-red-50"
              : "border-emerald-200 bg-emerald-50"
          )}
        >
          {tool.status === "running" ? (
            <Loader2 className="size-3 animate-spin text-blue-500 shrink-0" />
          ) : tool.status === "error" ? (
            <XCircle className="size-3 text-red-500 shrink-0" />
          ) : (
            <CheckCircle2 className="size-3 text-emerald-500 shrink-0" />
          )}

          <Wrench className="size-3 text-slate-400 shrink-0" />

          <span className="font-medium text-slate-700">{tool.toolName}</span>

          {tool.inputSummary && (
            <span className="truncate text-slate-500 max-w-[200px]">
              {tool.inputSummary}
            </span>
          )}

          <div className="flex-1" />

          {tool.durationMs != null && (
            <span className="text-[10px] text-slate-400 shrink-0">
              {tool.durationMs}ms
            </span>
          )}

          {tool.outputSummary && tool.status === "completed" && (
            <span className="truncate text-[10px] text-emerald-600 max-w-[150px]">
              {tool.outputSummary}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
