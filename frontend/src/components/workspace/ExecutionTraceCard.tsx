"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Loader2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useExecutionStore } from "@/stores/execution-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { apiGet } from "@/lib/api";
import TraceStep from "./TraceStep";
import { cn } from "@/lib/utils";
import type { ExecutionRun, ExecutionStep } from "@/types";

interface Props {
  /** When provided, renders in "historical" mode using API data instead of live store. */
  runId?: string | null;
}

export default function ExecutionTraceCard({ runId }: Props) {
  const { activeRun, activeSteps, isStreaming, runError, configSnapshot } =
    useExecutionStore();
  const { setSelectedRunId, setActiveRightTab } = useWorkspaceStore();

  // Historical mode: fetch run + steps from API when runId is provided
  const [histRun, setHistRun] = useState<Partial<ExecutionRun> | null>(null);
  const [histSteps, setHistSteps] = useState<ExecutionStep[]>([]);
  const [histLoading, setHistLoading] = useState(false);

  const isHistorical = !!runId;

  useEffect(() => {
    if (!runId) return;
    // Don't fetch if this run is currently the active run
    if (activeRun?.id === runId && activeSteps.length > 0) return;

    let cancelled = false;
    setHistLoading(true);

    Promise.all([
      apiGet<ExecutionRun>(`/runs/${runId}`).catch(() => null),
      apiGet<ExecutionStep[]>(`/runs/${runId}/steps`).catch(() => []),
    ]).then(([run, steps]) => {
      if (cancelled) return;
      setHistRun(run);
      setHistSteps(steps as ExecutionStep[]);
      setHistLoading(false);
    });

    return () => { cancelled = true; };
  }, [runId, activeRun?.id, activeSteps.length]);

  // Choose data source: historical or live
  // If runId matches the currently active run, use live data (not historical fetch)
  const isCurrentRun = isHistorical && activeRun?.id === runId;
  const run = isHistorical
    ? (isCurrentRun ? activeRun : histRun)
    : activeRun;
  const steps = isHistorical
    ? (isCurrentRun ? activeSteps : histSteps)
    : activeSteps;
  // Use live streaming state for the current active run, false for truly historical runs
  // But always respect run.status — if the run is done, streaming is done
  const runStatus = run?.status;
  const runIsDone = runStatus === "completed" || runStatus === "failed" || runStatus === "cancelled";
  const streaming = runIsDone ? false : (isCurrentRun ? isStreaming : (isHistorical ? false : isStreaming));
  const error = isCurrentRun ? runError : (isHistorical ? null : runError);

  const status = runStatus ?? (streaming ? "running" : "pending");
  const isComplete = status === "completed";
  const isFailed = status === "failed" || status === "cancelled";

  // Config-driven display mode (only for live mode)
  const displayMode = !isHistorical
    ? (configSnapshot?.harness_display_mode ?? "sequential_visible")
    : "sequential_visible";
  const stepsMode = !isHistorical
    ? (configSnapshot?.intermediate_steps_in_chat ?? "status_pills")
    : "status_pills";

  // Collapsed state
  const [collapsed, setCollapsed] = useState(displayMode === "collapsed_summary");

  // If mode is "final_only", show only final result — no trace at all while running
  if (displayMode === "final_only" && streaming) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <Loader2 className="size-3.5 animate-spin text-blue-500" />
        <span className="text-xs text-slate-500">Processing...</span>
      </div>
    );
  }

  // Historical loading state
  if (isHistorical && histLoading) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <Loader2 className="size-3.5 animate-spin text-slate-400" />
        <span className="text-xs text-slate-400">Loading execution trace...</span>
      </div>
    );
  }

  // No data available
  if (isHistorical && !run && !histLoading) {
    return (
      <div className="my-2 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <Activity className="size-3.5 text-slate-300" />
        <span className="text-xs text-slate-400">Execution trace unavailable</span>
      </div>
    );
  }

  const effectiveRunId = runId || activeRun?.id;

  function handleInspect() {
    if (effectiveRunId) {
      setSelectedRunId(effectiveRunId);
      setActiveRightTab("inspector");
    }
  }

  // Render steps based on intermediate_steps_in_chat mode
  function renderSteps() {
    if (stepsMode === "none" && streaming) {
      return null;
    }

    if (stepsMode === "progress_bar") {
      const total = run?.step_count ?? steps.length;
      const completed = steps.filter(
        (s) => s.status === "completed" || s.status === "failed"
      ).length;
      const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
      return (
        <div className="px-3 py-2">
          <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
            <span>
              {completed}/{total} steps
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                isFailed ? "bg-red-400" : "bg-blue-500"
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          {streaming && steps.length > 0 && (
            <p className="mt-1 truncate text-[10px] text-slate-400 italic">
              {steps[steps.length - 1].node_name}...
            </p>
          )}
        </div>
      );
    }

    if (stepsMode === "status_pills") {
      return (
        <div className="flex flex-wrap gap-1 px-3 py-2">
          {steps.map((step) => (
            <span
              key={step.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                step.status === "completed"
                  ? "bg-emerald-50 text-emerald-600"
                  : step.status === "failed"
                  ? "bg-red-50 text-red-600"
                  : step.status === "running"
                  ? "bg-blue-50 text-blue-600"
                  : "bg-slate-50 text-slate-400"
              )}
            >
              {step.status === "running" && (
                <Loader2 className="size-2.5 animate-spin" />
              )}
              {step.status === "completed" && (
                <CheckCircle2 className="size-2.5" />
              )}
              {step.status === "failed" && <XCircle className="size-2.5" />}
              {step.node_name}
            </span>
          ))}
        </div>
      );
    }

    // "full_output" — default detailed view
    return (
      <div className="divide-y divide-slate-100">
        {steps.map((step) => (
          <TraceStep key={step.id} step={step} />
        ))}
      </div>
    );
  }

  const isCollapsible =
    displayMode === "collapsed_summary" || displayMode === "collapsible_below";

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition-all duration-300">
      {/* Header */}
      <button
        onClick={() => isCollapsible && setCollapsed(!collapsed)}
        className={cn(
          "flex w-full items-center gap-2 border-b bg-slate-50/50 px-3 py-2",
          isCollapsible && "cursor-pointer hover:bg-slate-100/50"
        )}
      >
        {isCollapsible &&
          (collapsed ? (
            <ChevronRight className="size-3 text-slate-400" />
          ) : (
            <ChevronDown className="size-3 text-slate-400" />
          ))}

        {streaming ? (
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

        {streaming && (
          <span className="text-[10px] text-blue-500">Running...</span>
        )}

        {isComplete && run && (
          <span className="text-[10px] text-slate-400">
            {run.step_count ?? steps.length} steps
            {run.total_duration_ms
              ? ` · ${(run.total_duration_ms / 1000).toFixed(1)}s`
              : ""}
            {run.total_cost_usd
              ? ` · $${run.total_cost_usd.toFixed(2)}`
              : ""}
          </span>
        )}

        {isFailed && error && (
          <span className="truncate text-[10px] font-medium text-red-500">
            Error: {error}
          </span>
        )}

        <div className="flex-1" />

        {(isComplete || isFailed) && effectiveRunId && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              handleInspect();
            }}
            className="flex items-center gap-0.5 text-[10px] font-medium text-blue-500 transition-colors hover:text-blue-700"
          >
            Inspect
            <ExternalLink className="size-2.5" />
          </span>
        )}
      </button>

      {/* Steps */}
      {!collapsed && (
        <>
          {renderSteps()}
          {steps.length === 0 && streaming && (
            <div className="flex items-center gap-2 px-3 py-3">
              <Loader2 className="size-3.5 animate-spin text-slate-300" />
              <span className="text-xs text-slate-400">
                Waiting for execution steps...
              </span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
