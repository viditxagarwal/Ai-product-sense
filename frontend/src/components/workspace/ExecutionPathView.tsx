"use client";

/**
 * B4: Execution Path Visualization
 * Shows the path taken through the workflow with edge condition results,
 * loop iteration counts, and token-based heatmap coloring.
 */

import { useState } from "react";
import {
  ArrowRight,
  RotateCw,
  GitBranch,
  Shield,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExecutionRun, ExecutionStep, ExecutionEvent } from "@/types";

interface Props {
  run: ExecutionRun;
  steps: ExecutionStep[];
  events: ExecutionEvent[];
  showHeatmap?: boolean;
}

export default function ExecutionPathView({ run, steps, events, showHeatmap = false }: Props) {
  const [expanded, setExpanded] = useState(true);

  const pathTaken = (run as unknown as Record<string, unknown>).path_taken as string[] | undefined;
  if (!pathTaken || pathTaken.length === 0) return null;

  // Build step map for quick lookup
  const stepByNode: Record<string, ExecutionStep> = {};
  for (const s of steps) {
    const nodeId = (s.input_payload as Record<string, unknown>)?.node_id as string;
    if (nodeId) stepByNode[nodeId] = s;
  }

  // Find max tokens for heatmap scaling
  const maxTokens = Math.max(...steps.map((s) => s.tokens_used || 0), 1);

  // Get edge evaluation events
  const edgeEvents = events.filter((e) => e.event_type === "edge_evaluated");
  const loopEvents = events.filter((e) => e.event_type === "loop_iteration");

  // Count loop iterations per node
  const loopCounts: Record<string, number> = {};
  for (const evt of loopEvents) {
    const d = evt.data as Record<string, unknown>;
    const target = d.target_node as string;
    loopCounts[target] = Math.max(loopCounts[target] || 0, d.iteration as number);
  }

  function getHeatmapColor(tokens: number): string {
    if (!showHeatmap || tokens === 0) return "bg-slate-100";
    const ratio = tokens / maxTokens;
    if (ratio < 0.25) return "bg-emerald-100 border-emerald-300";
    if (ratio < 0.5) return "bg-yellow-100 border-yellow-300";
    if (ratio < 0.75) return "bg-orange-100 border-orange-300";
    return "bg-red-100 border-red-300";
  }

  return (
    <div className="space-y-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-600"
      >
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        <GitBranch className="size-3" />
        Execution Path ({pathTaken.length} nodes)
      </button>

      {expanded && (
        <div className="flex flex-wrap items-center gap-1 py-1">
          {pathTaken.map((nodeId, i) => {
            const step = stepByNode[nodeId];
            const tokens = step?.tokens_used || 0;
            const nodeType = step?.node_type || "unknown";
            const nodeName = step?.node_name || nodeId.slice(0, 8);
            const loopCount = loopCounts[nodeId];

            // Find edge evaluation between this and previous node
            const prevNode = i > 0 ? pathTaken[i - 1] : null;
            const edgeEval = prevNode
              ? edgeEvents.find(
                  (e) =>
                    (e.data as Record<string, unknown>).source_node === prevNode &&
                    (e.data as Record<string, unknown>).target_node === nodeId
                )
              : null;

            return (
              <div key={`${nodeId}-${i}`} className="flex items-center gap-1">
                {/* Edge arrow with condition indicator */}
                {i > 0 && (
                  <div className="flex flex-col items-center">
                    {edgeEval ? (
                      <div className="flex items-center gap-0.5">
                        <ArrowRight className="size-3 text-slate-300" />
                        <span
                          className={cn(
                            "rounded px-0.5 text-[8px] font-medium",
                            (edgeEval.data as Record<string, unknown>).condition_result
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-red-50 text-red-600"
                          )}
                        >
                          {((edgeEval.data as Record<string, unknown>).condition_method as string) || "flow"}
                        </span>
                      </div>
                    ) : (
                      <ArrowRight className="size-3 text-slate-300" />
                    )}
                  </div>
                )}

                {/* Node pill */}
                <div
                  className={cn(
                    "relative flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px]",
                    showHeatmap ? getHeatmapColor(tokens) : "bg-slate-50 border-slate-200",
                    nodeType === "start" && "border-slate-300",
                    nodeType === "end" && "border-slate-300",
                    nodeType === "gate" && "border-amber-300 bg-amber-50",
                    nodeType === "split" && "border-purple-300 bg-purple-50",
                    step?.status === "failed" && "border-red-300 bg-red-50"
                  )}
                >
                  {nodeType === "gate" && <Shield className="size-2.5 text-amber-500" />}
                  <span className="font-medium text-slate-700 max-w-[80px] truncate">
                    {nodeName}
                  </span>
                  {tokens > 0 && showHeatmap && (
                    <span className="text-[8px] text-slate-400">
                      {tokens.toLocaleString()}
                    </span>
                  )}

                  {/* Loop counter badge */}
                  {loopCount && (
                    <span className="absolute -top-1.5 -right-1.5 flex items-center gap-0.5 rounded-full bg-violet-500 px-1 py-0.5 text-[7px] font-bold text-white">
                      <RotateCw className="size-2" />
                      {loopCount}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
