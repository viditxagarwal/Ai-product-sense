"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { RotateCcw } from "lucide-react";
import type { WorkflowEdgeData } from "@/types";

export default function SmartEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const edgeData = (data || {}) as unknown as WorkflowEdgeData;
  const edgeType = edgeData.edgeType || "flow";

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  // Style based on edge type
  let stroke = "#94a3b8"; // gray (flow)
  let strokeDasharray: string | undefined;
  const strokeWidth = selected ? 3 : 2;
  let label = edgeData.label || "";
  let labelBg = "bg-white";
  let labelText = "text-slate-600";

  if (edgeType === "conditional") {
    stroke = "#f59e0b"; // amber
    labelBg = "bg-amber-50";
    labelText = "text-amber-700";
    if (!label) label = "condition?";
  } else if (edgeType === "loop") {
    stroke = "#06b6d4"; // cyan
    strokeDasharray = "6 4";
    labelBg = "bg-cyan-50";
    labelText = "text-cyan-700";
    const maxIter = edgeData.maxIterations ?? 3;
    if (!label) label = `Loop (max ${maxIter})`;
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke,
          strokeWidth,
          strokeDasharray,
          filter: selected ? `drop-shadow(0 0 3px ${stroke})` : undefined,
        }}
        markerEnd="url(#react-flow__arrowclosed)"
      />
      <EdgeLabelRenderer>
        {/* Label pill */}
        {(edgeType !== "flow" || label) && (
          <div
            className={`absolute rounded-full border px-2 py-0.5 text-[10px] font-medium shadow-sm ${labelBg} ${labelText} border-slate-200 pointer-events-auto cursor-pointer`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {edgeType === "loop" && (
              <RotateCcw className="mr-1 inline-block size-3" />
            )}
            {label}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}
