"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  Search,
  Loader2,
  Clock,
  Cpu,
  DollarSign,
  Shield,
  Layers,
} from "lucide-react";
import { useExecutionStore } from "@/stores/execution-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import TimingBar from "./TimingBar";
import InspectorNode from "./InspectorNode";

export default function ExecutionInspector() {
  const { selectedRunId, selectedStepId } = useWorkspaceStore();
  const {
    inspectorRun,
    inspectorSteps,
    inspectorLoading,
    isStreaming,
    fetchRun,
    fetchRunSteps,
  } = useExecutionStore();

  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Fetch run and steps when selectedRunId changes
  useEffect(() => {
    if (!selectedRunId) return;
    fetchRun(selectedRunId);
    fetchRunSteps(selectedRunId);
  }, [selectedRunId, fetchRun, fetchRunSteps]);

  // Scroll to node when clicking timing bar segment
  const scrollToNode = useCallback((stepId: string) => {
    const el = nodeRefs.current[stepId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Also select it in workspace store
    useWorkspaceStore.getState().setSelectedStepId(stepId);
  }, []);

  // ── Empty state: no run selected ────────────────────────
  if (!selectedRunId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Search className="size-8 text-slate-200" />
        <p className="mt-2 text-sm text-slate-400">
          Click &quot;Inspect&quot; on an execution trace in the chat to analyze
          it here.
        </p>
      </div>
    );
  }

  // ── Loading state ───────────────────────────────────────
  if (inspectorLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-slate-300" />
      </div>
    );
  }

  // ── Streaming in progress ───────────────────────────────
  if (isStreaming) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Loader2 className="size-6 animate-spin text-blue-400" />
        <p className="mt-2 text-sm text-slate-400">
          Execution in progress — inspector available after completion.
        </p>
      </div>
    );
  }

  if (!inspectorRun) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-slate-400">Run not found</p>
      </div>
    );
  }

  // ── Compute summary stats ──────────────────────────────
  const totalSteps = inspectorSteps.length;
  const totalDuration = inspectorRun.total_duration_ms ?? 0;
  const totalTokens = inspectorRun.total_tokens ?? 0;
  const totalCost = inspectorRun.total_cost_usd ?? 0;
  const guardrailsFired = inspectorSteps.reduce((count, s) => {
    const fired = s.guardrails_fired as unknown[] | null;
    return count + (fired?.length ?? 0);
  }, 0);

  return (
    <div className="flex h-full flex-col">
      {/* ── Run summary bar ─────────────────────────────── */}
      <div className="border-b bg-slate-50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-3 text-[10px]">
          <span className="flex items-center gap-1 text-slate-500">
            <Layers className="size-3" />
            <strong className="text-slate-700">{totalSteps}</strong> steps
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <Clock className="size-3" />
            <strong className="text-slate-700">
              {(totalDuration / 1000).toFixed(1)}s
            </strong>
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <Cpu className="size-3" />
            <strong className="text-slate-700">
              {totalTokens.toLocaleString()}
            </strong>{" "}
            tokens
          </span>
          <span className="flex items-center gap-1 text-slate-500">
            <DollarSign className="size-3" />
            <strong className="text-slate-700">
              ${totalCost.toFixed(2)}
            </strong>
          </span>
          {guardrailsFired > 0 && (
            <span className="flex items-center gap-1 text-amber-600">
              <Shield className="size-3" />
              <strong>{guardrailsFired}</strong> guardrail
              {guardrailsFired > 1 ? "s" : ""} fired
            </span>
          )}
          <span
            className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium ${
              inspectorRun.status === "completed"
                ? "bg-emerald-50 text-emerald-600"
                : inspectorRun.status === "failed"
                  ? "bg-red-50 text-red-600"
                  : "bg-slate-100 text-slate-500"
            }`}
          >
            {inspectorRun.status}
          </span>
        </div>
      </div>

      {/* ── Timing bar ──────────────────────────────────── */}
      <div className="border-b">
        <TimingBar steps={inspectorSteps} onSegmentClick={scrollToNode} />
      </div>

      {/* ── Node timeline ───────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {inspectorSteps.map((step) => (
          <InspectorNode
            key={step.id}
            ref={(el) => {
              nodeRefs.current[step.id] = el;
            }}
            step={step}
            isSelected={step.id === selectedStepId}
          />
        ))}
        {inspectorSteps.length === 0 && (
          <div className="flex items-center justify-center p-6">
            <p className="text-xs text-slate-400">No execution steps found</p>
          </div>
        )}
      </div>
    </div>
  );
}
