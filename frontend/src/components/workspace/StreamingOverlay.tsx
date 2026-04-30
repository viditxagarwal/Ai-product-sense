"use client";

import { useEffect, useRef, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Circle,
  ChevronDown,
  ChevronRight,
  Clock,
  Cpu,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useExecutionStore } from "@/stores/execution-store";
import type { ExecutionStep } from "@/types";

// ─── helpers ────────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(4)}`;
}

function stepStatusIcon(step: ExecutionStep) {
  switch (step.status) {
    case "completed":
      return <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />;
    case "failed":
      return <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />;
    case "running":
      return (
        <Loader2 className="h-3.5 w-3.5 text-blue-500 shrink-0 animate-spin" />
      );
    default:
      return <Circle className="h-3.5 w-3.5 text-gray-300 shrink-0" />;
  }
}

// ─── sub-components ──────────────────────────────────────────────────────────

interface D5Props {
  completed: number;
  total: number;
  isStreaming: boolean;
}

function ProgressBar({ completed, total, isStreaming }: D5Props) {
  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);

  return (
    <div className="flex items-center gap-2 min-w-0 flex-1">
      <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">
        Step {completed} of {total}
      </span>
      <div className="relative flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full bg-blue-500 transition-all duration-300",
            isStreaming && "animate-pulse"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-400 shrink-0">{pct}%</span>
    </div>
  );
}

interface D6Props {
  tokens: number;
  cost: number;
  elapsedMs: number;
}

function RunningCounters({ tokens, cost, elapsedMs }: D6Props) {
  return (
    <div className="flex items-center gap-3 shrink-0">
      <span className="flex items-center gap-1 text-xs text-gray-600">
        <Cpu className="h-3 w-3 text-gray-400" />
        {tokens.toLocaleString()}
        <span className="text-gray-400">tok</span>
      </span>
      <span className="flex items-center gap-1 text-xs text-gray-600">
        <DollarSign className="h-3 w-3 text-gray-400" />
        {formatCost(cost)}
      </span>
      <span className="flex items-center gap-1 text-xs text-gray-600">
        <Clock className="h-3 w-3 text-gray-400" />
        {formatElapsed(elapsedMs)}
      </span>
    </div>
  );
}

interface D7Props {
  steps: ExecutionStep[];
}

function StepChecklist({ steps }: D7Props) {
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the current running step
  useEffect(() => {
    if (!open || !listRef.current) return;
    const runningIndex = steps.findIndex((s) => s.status === "running");
    const target = runningIndex >= 0 ? runningIndex : steps.length - 1;
    const items = listRef.current.querySelectorAll("[data-step-item]");
    if (items[target]) {
      (items[target] as HTMLElement).scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [steps, open]);

  return (
    <div className="border-t border-gray-100">
      {/* Toggle row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-3 py-1 w-full text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronRight className="h-3 w-3" />
        )}
        Steps
        <span className="ml-1 text-gray-400">({steps.length})</span>
      </button>

      {/* Collapsible list */}
      {open && (
        <div
          ref={listRef}
          className="max-h-40 overflow-y-auto px-3 pb-2 space-y-0.5"
        >
          {steps.map((step) => (
            <div
              key={step.id}
              data-step-item
              className={cn(
                "flex items-center gap-2 py-0.5",
                step.status === "running" && "bg-blue-50 -mx-3 px-3 rounded"
              )}
            >
              {stepStatusIcon(step)}
              <span
                className={cn(
                  "text-xs truncate",
                  step.status === "completed"
                    ? "text-gray-600"
                    : step.status === "failed"
                    ? "text-red-600"
                    : step.status === "running"
                    ? "text-blue-700 font-medium"
                    : "text-gray-400"
                )}
              >
                {step.node_name}
              </span>
              <span className="ml-auto text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
                {step.node_type}
              </span>
            </div>
          ))}
          {steps.length === 0 && (
            <p className="text-xs text-gray-400 py-1">No steps yet…</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── main component ───────────────────────────────────────────────────────────

export default function StreamingOverlay() {
  const { isStreaming, activeRun, activeSteps } = useExecutionStore();

  // Elapsed timer
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    if (!isStreaming) {
      setElapsedMs(0);
      return;
    }

    // Seed elapsed from run creation time if available
    const startTime = activeRun?.created_at
      ? new Date(activeRun.created_at).getTime()
      : Date.now();

    const id = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 1000);

    return () => clearInterval(id);
  }, [isStreaming, activeRun?.created_at]);

  // Don't show overlay if not streaming or if the run already completed/failed
  const runDone = activeRun?.status === "completed" || activeRun?.status === "failed" || activeRun?.status === "cancelled";
  if (!isStreaming || runDone) return null;

  // Derived counters
  const totalTokens = activeSteps.reduce(
    (acc, s) => acc + (s.tokens_used ?? 0),
    0
  );
  const totalCost = activeSteps.reduce(
    (acc, s) => acc + (s.cost_usd ?? 0),
    0
  );
  const completedSteps = activeSteps.filter(
    (s) => s.status === "completed" || s.status === "failed"
  ).length;
  const totalSteps = activeSteps.length;

  return (
    <div className="bg-white border-t border-gray-200 shadow-sm text-xs select-none">
      {/* D5 + D6 row */}
      <div className="flex items-center gap-4 px-3 py-2">
        <ProgressBar
          completed={completedSteps}
          total={totalSteps}
          isStreaming={isStreaming}
        />
        <RunningCounters
          tokens={totalTokens}
          cost={totalCost}
          elapsedMs={elapsedMs}
        />
      </div>

      {/* D7 collapsible checklist */}
      <StepChecklist steps={activeSteps} />
    </div>
  );
}
