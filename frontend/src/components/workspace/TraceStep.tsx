"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  SkipForward,
  FilePlus,
  FilePenLine,
} from "lucide-react";
import { useExecutionStore, type StepFileEvent } from "@/stores/execution-store";
import { cn } from "@/lib/utils";
import type { ExecutionStep } from "@/types";

interface TraceStepProps {
  step: ExecutionStep;
}

// ── Node type color map ──────────────────────────────────────
const NODE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  route:            { bg: "bg-orange-50",  text: "text-orange-600",  border: "border-orange-200" },
  retriever:        { bg: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" },
  calculator:       { bg: "bg-blue-50",    text: "text-blue-600",    border: "border-blue-200" },
  code_interpreter: { bg: "bg-indigo-50",  text: "text-indigo-600",  border: "border-indigo-200" },
  validator:        { bg: "bg-red-50",     text: "text-red-600",     border: "border-red-200" },
  file_writer:      { bg: "bg-amber-50",   text: "text-amber-600",   border: "border-amber-200" },
  summarizer:       { bg: "bg-purple-50",  text: "text-purple-600",  border: "border-purple-200" },
  agent_node:       { bg: "bg-slate-50",   text: "text-slate-600",   border: "border-slate-200" },
  classifier:       { bg: "bg-pink-50",    text: "text-pink-600",    border: "border-pink-200" },
  parallelization:  { bg: "bg-cyan-50",    text: "text-cyan-600",    border: "border-cyan-200" },
  loop:             { bg: "bg-violet-50",  text: "text-violet-600",  border: "border-violet-200" },
  human_review:     { bg: "bg-teal-50",    text: "text-teal-600",    border: "border-teal-200" },
  end:              { bg: "bg-gray-50",    text: "text-gray-500",    border: "border-gray-200" },
  step:             { bg: "bg-blue-50",    text: "text-blue-600",    border: "border-blue-200" },
  decision:         { bg: "bg-orange-50",  text: "text-orange-600",  border: "border-orange-200" },
  parallel:         { bg: "bg-cyan-50",    text: "text-cyan-600",    border: "border-cyan-200" },
  direct_llm:       { bg: "bg-violet-50",  text: "text-violet-600",  border: "border-violet-200" },
};

const DEFAULT_COLOR = { bg: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" };

// ── Status icons ─────────────────────────────────────────────
function StatusIcon({ status }: { status: ExecutionStep["status"] }) {
  switch (status) {
    case "running":
      return <Loader2 className="size-3.5 shrink-0 animate-spin text-blue-500" />;
    case "completed":
      return <CheckCircle2 className="size-3.5 shrink-0 text-emerald-500" />;
    case "failed":
      return <XCircle className="size-3.5 shrink-0 text-red-500" />;
    case "skipped":
      return <SkipForward className="size-3.5 shrink-0 text-slate-300" />;
    default:
      return <Clock className="size-3.5 shrink-0 text-slate-300" />;
  }
}

// ── Main component ───────────────────────────────────────────
export default function TraceStep({ step }: TraceStepProps) {
  const [expanded, setExpanded] = useState(false);
  const { stepProgress, stepFileEvents } = useExecutionStore();

  const colors = NODE_COLORS[step.node_type] || DEFAULT_COLOR;
  const progress = stepProgress[step.id] || [];
  const fileEvent = stepFileEvents[step.id] as StepFileEvent | undefined;

  // Build result summary
  const resultSummary =
    (step.output_payload as Record<string, unknown> | null)?.result_summary as string | undefined;

  return (
    <div
      className={cn(
        "transition-all duration-200",
        expanded && "bg-slate-50/50"
      )}
    >
      {/* ── Collapsed row ─────────────────────────────────── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-slate-50"
      >
        {expanded ? (
          <ChevronDown className="size-3 shrink-0 text-slate-400" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-slate-400" />
        )}

        <StatusIcon status={step.status} />

        {/* Step number */}
        <span className="shrink-0 text-[10px] font-bold text-slate-400">
          {step.step_number}
        </span>

        {/* Node type badge */}
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium border",
            colors.bg,
            colors.text,
            colors.border
          )}
        >
          {formatNodeType(step.node_type)}
        </span>

        {/* Node name */}
        <span className="truncate text-xs font-medium text-slate-700">
          {step.node_name}
        </span>

        {/* Result summary */}
        {resultSummary && (step.status === "completed" || step.status === "failed") && (
          <span className={cn(
            "hidden truncate text-[10px] sm:inline",
            resultSummary.startsWith("Error:") ? "font-medium text-red-500" : "text-slate-400"
          )}>
            → {resultSummary}
          </span>
        )}

        {/* Streaming progress */}
        {step.status === "running" && progress.length > 0 && (
          <span className="truncate text-[10px] italic text-blue-400">
            {progress[progress.length - 1]}
          </span>
        )}

        <div className="flex-1" />

        {/* File operation badge (inline) */}
        {fileEvent && (
          <span
            className={cn(
              "flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium",
              fileEvent.operation === "created"
                ? "bg-emerald-50 text-emerald-600"
                : "bg-amber-50 text-amber-600"
            )}
          >
            {fileEvent.operation === "created" ? (
              <FilePlus className="size-2.5" />
            ) : (
              <FilePenLine className="size-2.5" />
            )}
            {fileEvent.file_name}
          </span>
        )}

        {/* Duration or spinner */}
        {step.status === "running" ? (
          <span className="shrink-0 text-[10px] text-blue-400">...</span>
        ) : step.duration_ms != null ? (
          <span className="shrink-0 text-[10px] text-slate-400">
            {(step.duration_ms / 1000).toFixed(1)}s
          </span>
        ) : null}
      </button>

      {/* ── Expanded detail ───────────────────────────────── */}
      {expanded && (
        <div className="space-y-2 border-t border-dashed border-slate-200 px-3 py-2 pl-10 text-xs">
          {/* Thinking / progress */}
          {progress.length > 0 && (
            <div>
              <h5 className="mb-0.5 font-semibold text-slate-500">Thinking</h5>
              <div className="space-y-0.5 text-slate-500 italic">
                {progress.map((t, i) => (
                  <p key={i}>{t}</p>
                ))}
              </div>
            </div>
          )}

          {/* Tool call details */}
          {step.tool_name && (
            <div>
              <h5 className="mb-0.5 font-semibold text-slate-500">
                Tool: {step.tool_name}
              </h5>
              {step.input_payload && (
                <CollapsibleJson label="Input" data={step.input_payload} />
              )}
              {step.output_payload && (
                <CollapsibleJson label="Output" data={step.output_payload} />
              )}
            </div>
          )}

          {/* Output payload if no tool */}
          {!step.tool_name && step.output_payload && (
            <CollapsibleJson label="Output" data={step.output_payload} />
          )}

          {/* Routing decision */}
          {step.routing_decision &&
            Object.keys(step.routing_decision).length > 0 && (
              <div>
                <h5 className="mb-0.5 font-semibold text-slate-500">
                  Routing Decision
                </h5>
                <div className="flex items-center gap-2">
                  <span className="text-slate-600">
                    → {(step.routing_decision as Record<string, unknown>).chosen as string}
                  </span>
                  {step.confidence_score != null && (
                    <span className="rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-600">
                      {(step.confidence_score * 100).toFixed(0)}% confidence
                    </span>
                  )}
                </div>
              </div>
            )}

          {/* Guardrails fired */}
          {step.guardrails_fired && step.guardrails_fired.length > 0 && (
            <div>
              <h5 className="mb-0.5 font-semibold text-slate-500">
                Guardrails Fired
              </h5>
              <div className="flex flex-wrap gap-1">
                {(step.guardrails_fired as string[]).map((g) => (
                  <span
                    key={g}
                    className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600"
                  >
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* File operation */}
          {step.file_operation_type && step.file_operation_type !== "none" && (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-500">File Op:</span>
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[10px] font-medium",
                  step.file_operation_type === "creation"
                    ? "bg-emerald-50 text-emerald-600"
                    : step.file_operation_type === "targeted_edit"
                      ? "bg-amber-50 text-amber-600"
                      : "bg-slate-100 text-slate-500"
                )}
              >
                {step.file_operation_type}
              </span>
            </div>
          )}

          {/* Tokens and cost */}
          <div className="flex items-center gap-3 text-[10px] text-slate-400">
            {step.tokens_used > 0 && <span>{step.tokens_used} tokens</span>}
            {step.cost_usd > 0 && <span>${step.cost_usd.toFixed(4)}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Collapsible JSON viewer ──────────────────────────────────
function CollapsibleJson({
  label,
  data,
}: {
  label: string;
  data: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-slate-600"
      >
        {open ? (
          <ChevronDown className="size-2.5" />
        ) : (
          <ChevronRight className="size-2.5" />
        )}
        {label}
      </button>
      {open && (
        <pre className="mt-0.5 max-h-40 overflow-auto rounded bg-slate-100 p-2 text-[10px] text-slate-600">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────
function formatNodeType(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
