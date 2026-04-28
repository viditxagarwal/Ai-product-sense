"use client";

import { Activity, CheckCircle2, XCircle, Clock, Loader2 } from "lucide-react";
import { useExecutionStore } from "@/stores/execution-store";
import { cn } from "@/lib/utils";
import type { ExecutionStep } from "@/types";

interface ExecutionTraceCardProps {
  runId?: string;
}

const STATUS_ICON = {
  pending: Clock,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
  skipped: Clock,
} as const;

const STATUS_COLOR = {
  pending: "text-slate-400",
  running: "text-blue-500",
  completed: "text-emerald-500",
  failed: "text-red-500",
  skipped: "text-slate-300",
} as const;

export default function ExecutionTraceCard({ runId }: ExecutionTraceCardProps) {
  const { activeRun, activeSteps, isStreaming } = useExecutionStore();

  const run = activeRun;
  const steps = activeSteps;

  if (!run && !runId) return null;

  return (
    <div className="my-2 rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Activity className="size-3.5 text-purple-500" />
        <span className="text-xs font-semibold text-slate-700">
          Execution Trace
        </span>
        {isStreaming && (
          <span className="flex items-center gap-1 text-[10px] text-blue-500">
            <Loader2 className="size-3 animate-spin" />
            Running
          </span>
        )}
        {run?.status === "completed" && (
          <span className="text-[10px] text-emerald-600">
            Completed · {run.total_duration_ms ? `${(run.total_duration_ms / 1000).toFixed(1)}s` : ""}
          </span>
        )}
        {run?.status === "failed" && (
          <span className="text-[10px] text-red-500">Failed</span>
        )}
      </div>

      {/* Steps */}
      <div className="divide-y divide-slate-100">
        {steps.map((step) => (
          <StepRow key={step.id} step={step} />
        ))}
        {steps.length === 0 && (
          <div className="px-3 py-2 text-xs text-slate-400">
            Waiting for execution steps...
          </div>
        )}
      </div>
    </div>
  );
}

function StepRow({ step }: { step: ExecutionStep }) {
  const Icon = STATUS_ICON[step.status] || Clock;
  const color = STATUS_COLOR[step.status] || "text-slate-400";

  return (
    <div className="flex items-center gap-2 px-3 py-1.5">
      <Icon
        className={cn("size-3.5 shrink-0", color, step.status === "running" && "animate-spin")}
      />
      <span className="text-xs font-medium text-slate-700">
        {step.step_number}. {step.node_name}
      </span>
      <span className="text-[10px] text-slate-400">{step.node_type}</span>
      {step.tool_name && (
        <span className="rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-500">
          {step.tool_name}
        </span>
      )}
      <div className="flex-1" />
      {step.duration_ms != null && (
        <span className="text-[10px] text-slate-400">
          {(step.duration_ms / 1000).toFixed(1)}s
        </span>
      )}
    </div>
  );
}
