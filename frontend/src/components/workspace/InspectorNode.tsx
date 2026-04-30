"use client";

/**
 * Enhanced InspectorNode (Section C.3)
 * Shows step details including LLM call timeline, tool call cards,
 * thinking blocks, config snapshots, and token breakdowns.
 */

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
  Settings,
  AlertTriangle,
} from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";
import AnnotationInput from "./AnnotationInput";
import LLMCallTimeline from "./LLMCallTimeline";
import type { ExecutionStep, ExecutionEvent, DisplaySettings } from "@/types";

interface InspectorNodeProps {
  step: ExecutionStep;
  isSelected: boolean;
  events?: ExecutionEvent[];
  displaySettings?: DisplaySettings | null;
}

const NODE_BAR: Record<string, string> = {
  node: "bg-blue-400",
  gate: "bg-amber-400",
  split: "bg-purple-400",
  start: "bg-gray-400",
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
  function InspectorNode({ step, isSelected, events = [], displaySettings }, ref) {
    const [expanded, setExpanded] = useState(false);
    const [showConfig, setShowConfig] = useState(false);
    const { setSelectedStepId } = useWorkspaceStore();

    const barColor = NODE_BAR[step.node_type] || "bg-slate-400";
    const fileOp = step.file_operation_type !== "none" ? FILE_OP_CONFIG[step.file_operation_type] : null;
    const output = step.output_payload as Record<string, unknown> | null;

    // Extract enhanced data from output_payload
    const inputTokens = (output?.input_tokens as number) || 0;
    const outputTokens = (output?.output_tokens as number) || 0;
    const thinkingTokens = (output?.thinking_tokens as number) || 0;
    const llmCalls = (output?.llm_calls as number) || 0;
    const toolCalls = (output?.tool_calls as number) || 0;
    const modelUsed = (output?.model as string) || "";

    // Filter events by type
    const llmCallEvents = events.filter((e) => e.event_type === "llm_call_completed");
    const toolCallEvents = events.filter((e) => e.event_type === "tool_completed");
    const errorEvents = events.filter((e) => e.event_type === "error");
    const nodeStartEvent = events.find((e) => e.event_type === "node_started");
    const componentConfig = nodeStartEvent
      ? (nodeStartEvent.data as Record<string, unknown>).component_config as Record<string, unknown>
      : null;

    // Check for stop_reason warnings
    const hasMaxTokensWarning = llmCallEvents.some(
      (e) => (e.data as Record<string, unknown>).stop_reason === "max_tokens"
    );
    const hasContentFilterWarning = llmCallEvents.some(
      (e) => (e.data as Record<string, unknown>).stop_reason === "content_filter"
    );

    const ds = displaySettings;

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

            {fileOp && (
              <span className={cn("flex shrink-0 items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium", fileOp.bg, fileOp.text)}>
                <fileOp.icon className="size-2.5" />
                {fileOp.label}
              </span>
            )}

            {/* Warning indicators */}
            {(hasMaxTokensWarning || hasContentFilterWarning) && (
              <AlertTriangle className="size-3 shrink-0 text-amber-500" />
            )}

            {/* Model tag */}
            {modelUsed && (
              <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-500">
                {modelUsed}
              </span>
            )}

            <div className="flex-1" />

            {/* Enhanced metrics in collapsed view */}
            {(ds?.show_token_counts ?? true) && step.tokens_used > 0 && (
              <span className="shrink-0 text-[9px] text-slate-400">
                {inputTokens > 0 ? `${inputTokens}/${outputTokens}` : step.tokens_used.toLocaleString()} tok
              </span>
            )}
            {(ds?.show_costs ?? true) && step.cost_usd > 0 && (
              <span className="shrink-0 text-[9px] text-slate-500 font-medium">
                ${step.cost_usd.toFixed(4)}
              </span>
            )}
            {step.duration_ms != null && (
              <span className="shrink-0 text-[10px] text-slate-400">
                {(step.duration_ms / 1000).toFixed(1)}s
              </span>
            )}
          </div>
        </button>

        {/* Warning banners */}
        {hasMaxTokensWarning && (
          <div className="mx-3 mb-1 rounded bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
            Response was truncated — consider increasing max_output_tokens
          </div>
        )}
        {hasContentFilterWarning && (
          <div className="mx-3 mb-1 rounded bg-red-50 px-2 py-1 text-[10px] text-red-700">
            Response was blocked by content filter
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
                {(ds?.show_token_counts ?? true) && step.tokens_used > 0 && (
                  <span>
                    <strong className="text-slate-600">Tokens:</strong>{" "}
                    {inputTokens > 0 ? `${inputTokens} in / ${outputTokens} out` : step.tokens_used.toLocaleString()}
                    {thinkingTokens > 0 && ` / ${thinkingTokens} thinking`}
                  </span>
                )}
                {(ds?.show_costs ?? true) && step.cost_usd > 0 && (
                  <span>
                    <strong className="text-slate-600">Cost:</strong> $
                    {step.cost_usd.toFixed(4)}
                  </span>
                )}
                {(ds?.show_inner_llm_calls ?? true) && llmCalls > 0 && (
                  <span className={llmCalls > 2 ? "text-amber-600" : ""}>
                    <strong>{llmCalls}</strong> LLM calls
                  </span>
                )}
                {(ds?.show_tool_call_details ?? true) && toolCalls > 0 && (
                  <span>
                    <strong>{toolCalls}</strong> tool calls
                  </span>
                )}
                <span className="rounded bg-slate-100 px-1 py-0.5 font-medium text-slate-500">
                  {formatNodeType(step.node_type)}
                </span>
              </div>

              {/* C6: Config Snapshot */}
              {componentConfig && (
                <div>
                  <button
                    onClick={() => setShowConfig(!showConfig)}
                    className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-slate-600"
                  >
                    <Settings className="size-2.5" />
                    {showConfig ? <ChevronDown className="size-2.5" /> : <ChevronRight className="size-2.5" />}
                    Config Snapshot
                  </button>
                  {showConfig && (
                    <div className="mt-1 space-y-0.5 text-[9px]">
                      {Object.entries(componentConfig).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <span className="text-slate-400">{k}:</span>
                          <span className="text-slate-600">
                            {typeof v === "string" ? v.slice(0, 100) : JSON.stringify(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* C4: LLM Call Timeline (inner loop visibility) */}
              {(ds?.show_inner_llm_calls ?? true) && llmCallEvents.length > 0 && (
                <LLMCallTimeline
                  llmEvents={llmCallEvents}
                  toolEvents={(ds?.show_tool_call_details ?? true) ? toolCallEvents : []}
                  showThinking={ds?.show_thinking ?? true}
                  showRawMessages={ds?.show_raw_messages ?? false}
                />
              )}

              {/* C7: Error Detail Panel */}
              {errorEvents.length > 0 && (
                <div className="rounded border border-red-200 bg-red-50 p-2">
                  <h5 className="text-[10px] font-semibold text-red-600">Errors</h5>
                  {errorEvents.map((evt) => {
                    const d = evt.data as Record<string, unknown>;
                    return (
                      <div key={evt.id} className="mt-1 text-[10px] text-red-700">
                        <span className="font-medium">{d.error_type as string}:</span>{" "}
                        {String(d.error_message)}
                        {d.retry_attempt ? (
                          <span className="ml-1 text-red-400">
                            (attempt {Number(d.retry_attempt)})
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Input/Output (C1) — gated by show_mapping_details */}
              {(ds?.show_mapping_details ?? true) && step.input_payload !== null && step.input_payload && Object.keys(step.input_payload).length > 0 && (
                <CollapsibleJson label="Input" data={step.input_payload} />
              )}
              {(ds?.show_mapping_details ?? true) && output !== null && output && Object.keys(output).length > 0 && (
                <CollapsibleJson label="Output" data={output as Record<string, unknown>} />
              )}

              {/* Routing decision — gated by show_edge_evaluations */}
              {(ds?.show_edge_evaluations ?? true) && step.routing_decision !== null && step.routing_decision && Object.keys(step.routing_decision).length > 0 && (
                <div>
                  <h5 className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Routing Decision
                  </h5>
                  <CollapsibleJson label="Full Decision" data={step.routing_decision} />
                </div>
              )}

              {/* Guardrails */}
              {step.guardrails_fired !== null && (step.guardrails_fired as unknown[]).length > 0 && (
                <div>
                  <h5 className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Guardrails Triggered
                  </h5>
                  <div className="flex flex-wrap gap-1">
                    {(step.guardrails_fired as string[]).map((g) => (
                      <span key={g} className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* File operation */}
              {fileOp && (
                <div>
                  <h5 className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    File Operation
                  </h5>
                  <span className={cn("flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium w-fit", fileOp.bg, fileOp.text)}>
                    <fileOp.icon className="size-2.5" />
                    {fileOp.label}
                  </span>
                </div>
              )}

              {/* Annotation */}
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
