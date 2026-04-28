"use client";

import {
  Activity,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
} from "lucide-react";
import { useExecutionStore } from "@/stores/execution-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import TraceStep from "./TraceStep";

export default function ExecutionTraceCard() {
  const { activeRun, activeSteps, isStreaming, runError } = useExecutionStore();
  const { setSelectedRunId, setActiveRightTab } = useWorkspaceStore();

  const status = activeRun?.status ?? (isStreaming ? "running" : "pending");
  const isComplete = status === "completed";
  const isFailed = status === "failed" || status === "cancelled";

  function handleInspect() {
    if (activeRun?.id) {
      setSelectedRunId(activeRun.id);
      setActiveRightTab("inspector");
    }
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-all duration-300">
      {/* ── Header ──────────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b bg-slate-50/50 px-3 py-2">
        {/* Status indicator */}
        {isStreaming ? (
          <Loader2 className="size-3.5 animate-spin text-blue-500" />
        ) : isComplete ? (
          <CheckCircle2 className="size-3.5 text-emerald-500" />
        ) : isFailed ? (
          <XCircle className="size-3.5 text-red-500" />
        ) : (
          <Activity className="size-3.5 text-purple-500" />
        )}

        <span className="text-xs font-semibold text-slate-700">
          Execution Trace
        </span>

        {/* Streaming indicator */}
        {isStreaming && (
          <span className="text-[10px] text-blue-500">Running...</span>
        )}

        {/* Summary stats (when complete) */}
        {isComplete && activeRun && (
          <span className="text-[10px] text-slate-400">
            {activeRun.step_count ?? activeSteps.length} steps
            {activeRun.total_duration_ms
              ? ` · ${(activeRun.total_duration_ms / 1000).toFixed(1)}s`
              : ""}
            {activeRun.total_cost_usd
              ? ` · $${activeRun.total_cost_usd.toFixed(2)}`
              : ""}
          </span>
        )}

        {/* Failed error */}
        {isFailed && runError && (
          <span className="truncate text-[10px] text-red-500">{runError}</span>
        )}

        <div className="flex-1" />

        {/* Inspect link — only after completion */}
        {(isComplete || isFailed) && activeRun?.id && (
          <button
            onClick={handleInspect}
            className="flex items-center gap-0.5 text-[10px] font-medium text-blue-500 transition-colors hover:text-blue-700"
          >
            Inspect
            <ExternalLink className="size-2.5" />
          </button>
        )}
      </div>

      {/* ── Steps ───────────────────────────────────────── */}
      <div className="divide-y divide-slate-100">
        {activeSteps.map((step) => (
          <TraceStep key={step.id} step={step} />
        ))}
        {activeSteps.length === 0 && isStreaming && (
          <div className="flex items-center gap-2 px-3 py-3">
            <Loader2 className="size-3.5 animate-spin text-slate-300" />
            <span className="text-xs text-slate-400">
              Waiting for execution steps...
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
