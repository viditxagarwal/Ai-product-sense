"use client";

import { forwardRef, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  XCircle,
  Clock,
  SkipForward,
  Loader2,
  FilePlus,
  FilePenLine,
  FileOutput,
  FileEdit,
} from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";
import AnnotationInput from "./AnnotationInput";
import type { ExecutionStep } from "@/types";

interface InspectorNodeProps {
  step: ExecutionStep;
  isSelected: boolean;
}

// Node type left bar colors
const NODE_BAR: Record<string, string> = {
  // New types (canvas revamp)
  node: "bg-blue-400",
  gate: "bg-amber-400",
  split: "bg-purple-400",
  start: "bg-gray-400",
  // Old types (backward compat)
  route: "bg-orange-400",
  retriever: "bg-emerald-400",
  calculator: "bg-blue-400",
  code_interpreter: "bg-indigo-400",
  validator: "bg-red-400",
  file_writer: "bg-amber-400",
  summarizer: "bg-purple-400",
  agent_node: "bg-slate-400",
  classifier: "bg-pink-400",
  parallelization: "bg-cyan-400",
  loop: "bg-violet-400",
  human_review: "bg-teal-400",
  human_checkpoint: "bg-teal-400",
  end: "bg-gray-300",
  step: "bg-blue-400",
  decision: "bg-orange-400",
  parallel: "bg-cyan-400",
  direct_llm: "bg-violet-400",
};

const FILE_OP_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; icon: typeof FilePlus }
> = {
  creation: { label: "Created", bg: "bg-blue-50", text: "text-blue-600", icon: FilePlus },
  targeted_edit: { label: "Modified", bg: "bg-amber-50", text: "text-amber-600", icon: FilePenLine },
  append: { label: "Appended", bg: "bg-emerald-50", text: "text-emerald-600", icon: FileOutput },
  bulk_rewrite: { label: "Rewrote", bg: "bg-purple-50", text: "text-purple-600", icon: FileEdit },
};

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

const InspectorNode = forwardRef<HTMLDivElement, InspectorNodeProps>(
  function InspectorNode({ step, isSelected }, ref) {
    const [expanded, setExpanded] = useState(false);
    const { setSelectedStepId } = useWorkspaceStore();

    const barColor = NODE_BAR[step.node_type] || "bg-slate-400";
    const fileOp = step.file_operation_type !== "none" ? FILE_OP_CONFIG[step.file_operation_type] : null;
    const output = step.output_payload as Record<string, unknown> | null;
    const resultSummary = output?.result_summary as string | undefined;

    function handleClick() {
      setExpanded(!expanded);
      setSelectedStepId(step.id);
    }

    return (
      <div
        ref={ref}
        className={cn(
          "border-b transition-colors",
          isSelected && "bg-blue-50/50"
        )}
      >
        {/* Collapsed row */}
        <button
          onClick={handleClick}
          className="flex w-full items-center gap-0 text-left"
        >
          {/* Left color bar */}
          <div className={cn("w-[3px] self-stretch shrink-0", barColor)} />

          <div className="flex flex-1 items-center gap-2 px-3 py-2">
            {expanded ? (
              <ChevronDown className="size-3 shrink-0 text-slate-400" />
            ) : (
              <ChevronRight className="size-3 shrink-0 text-slate-400" />
            )}

            <StatusIcon status={step.status} />

            <span className="shrink-0 text-[10px] font-bold text-slate-400">
              {step.step_number}
            </span>

            <span className="truncate text-xs font-medium text-slate-700">
              {step.node_name}
            </span>

            {/* File operation badge */}
            {fileOp && (
              <span
                className={cn(
                  "flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium",
                  fileOp.bg,
                  fileOp.text
                )}
              >
                <fileOp.icon className="size-2.5" />
                {fileOp.label}
              </span>
            )}

            <div className="flex-1" />

            {/* Duration */}
            {step.duration_ms != null && (
              <span className="shrink-0 text-[10px] text-slate-400">
                {(step.duration_ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </button>

        {/* One-line result summary (collapsed) */}
        {!expanded && resultSummary && (
          <div className="pb-1.5 pl-[3px]">
            <p className="truncate px-3 text-[10px] text-slate-400">
              → {resultSummary}
            </p>
          </div>
        )}

        {/* Expanded details */}
        {expanded && (
          <div className="space-y-3 border-t border-dashed border-slate-200 pb-3 pl-[3px]">
            <div className="space-y-3 px-3 pt-2">
              {/* Stats row */}
              <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
                {step.duration_ms != null && (
                  <span>
                    <strong className="text-slate-600">Duration:</strong>{" "}
                    {(step.duration_ms / 1000).toFixed(1)}s
                  </span>
                )}
                {step.tokens_used > 0 && (
                  <span>
                    <strong className="text-slate-600">Tokens:</strong>{" "}
                    {step.tokens_used.toLocaleString()}
                  </span>
                )}
                {step.cost_usd > 0 && (
                  <span>
                    <strong className="text-slate-600">Cost:</strong> $
                    {step.cost_usd.toFixed(4)}
                  </span>
                )}
                <span className="rounded bg-slate-100 px-1 py-0.5 font-medium text-slate-500">
                  {formatNodeType(step.node_type)}
                </span>
              </div>

              {/* Tool details */}
              {step.tool_name && (
                <div>
                  <h5 className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Tool
                  </h5>
                  <span className="text-xs text-slate-600">{step.tool_name}</span>
                  {step.tool_config !== null && Object.keys(step.tool_config).length > 0 && (
                    <CollapsibleJson label="Config" data={step.tool_config} />
                  )}
                </div>
              )}

              {/* Input payload */}
              {step.input_payload !== null && Object.keys(step.input_payload).length > 0 && (
                <CollapsibleJson label="Input Payload" data={step.input_payload} />
              )}

              {/* Output payload */}
              {output !== null && Object.keys(output).length > 0 && (
                <CollapsibleJson label="Output Payload" data={output as Record<string, unknown>} />
              )}

              {/* Routing decision */}
              {step.routing_decision !== null && Object.keys(step.routing_decision).length > 0 && (
                <div>
                  <h5 className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Routing Decision
                  </h5>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-600">
                      → {(step.routing_decision as Record<string, unknown>).chosen as string}
                    </span>
                    {step.confidence_score != null && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                        {(step.confidence_score * 100).toFixed(0)}% confidence
                      </span>
                    )}
                  </div>
                  <CollapsibleJson label="Full Decision" data={step.routing_decision} />
                </div>
              )}

              {/* Guardrails triggered */}
              {step.guardrails_fired !== null && (step.guardrails_fired as unknown[]).length > 0 && (
                <div>
                  <h5 className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Guardrails Triggered
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

              {/* Knowledge retrieved (retriever nodes) */}
              {step.node_type === "retriever" && output !== null && Array.isArray(output.documents) && (
                <div>
                  <h5 className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Knowledge Retrieved
                  </h5>
                  <div className="space-y-1">
                    {(output.documents as { title: string; relevance: number }[]).map(
                      (doc, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-xs text-slate-600"
                        >
                          <span className="truncate">{doc.title}</span>
                          <span className="shrink-0 rounded bg-emerald-50 px-1 py-0.5 text-[10px] text-emerald-600">
                            {(doc.relevance * 100).toFixed(0)}%
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* File operation details */}
              {fileOp && (
                <div>
                  <h5 className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    File Operation
                  </h5>
                  <div className="flex items-center gap-2 text-xs">
                    <span
                      className={cn(
                        "flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium",
                        fileOp.bg,
                        fileOp.text
                      )}
                    >
                      <fileOp.icon className="size-2.5" />
                      {fileOp.label}
                    </span>
                    <span className="text-slate-500">
                      {step.file_operation_type}
                    </span>
                  </div>
                </div>
              )}

              {/* Annotation section */}
              <div className="border-t border-dashed pt-2">
                <AnnotationInput stepId={step.id} />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
);

export default InspectorNode;

// ── Collapsible JSON ─────────────────────────────────────────
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
        {open ? <ChevronDown className="size-2.5" /> : <ChevronRight className="size-2.5" />}
        {label}
      </button>
      {open && (
        <pre className="mt-0.5 max-h-48 overflow-auto rounded bg-slate-100 p-2 text-[10px] text-slate-600">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function formatNodeType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
