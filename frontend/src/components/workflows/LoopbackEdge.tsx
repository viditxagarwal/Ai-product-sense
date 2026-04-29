"use client";

import { useState } from "react";
import {
  EdgeLabelRenderer,
  getBezierPath,
  useReactFlow,
  type EdgeProps,
} from "@xyflow/react";
import { RefreshCw, X } from "lucide-react";

export interface LoopbackEdgeData {
  label?: string;
  loopCondition?: string;
  maxIterations?: number;
  exitThreshold?: number;
  exitNodeId?: string;
  [key: string]: unknown;
}

export default function LoopbackEdge({
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
  const [hovered, setHovered] = useState(false);
  const { setEdges } = useReactFlow();
  const edgeData = (data || {}) as LoopbackEdgeData;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEdges((eds) => eds.filter((edge) => edge.id !== id));
  };

  return (
    <>
      {/* Invisible wider path for hover detection */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      {/* Dashed teal loopback edge */}
      <path
        d={edgePath}
        fill="none"
        stroke="#14b8a6"
        strokeWidth={2.5}
        strokeDasharray="8 4"
        className={selected ? "stroke-teal-600" : ""}
      />
      {/* Loopback label + icon at midpoint */}
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <div className="flex items-center gap-1 rounded-full border border-teal-300 bg-teal-50 px-2 py-0.5 shadow-sm">
            <RefreshCw className="size-3 text-teal-600" />
            <span className="text-[10px] font-medium text-teal-700">
              {edgeData.label || "Loop"}
            </span>
            {edgeData.maxIterations && (
              <span className="text-[9px] text-teal-500">
                x{edgeData.maxIterations}
              </span>
            )}
          </div>
          {/* Delete button on hover */}
          {hovered && (
            <button
              className="absolute -right-2 -top-2 flex size-4 items-center justify-center rounded-full bg-red-500 text-white shadow-sm transition-colors hover:bg-red-600"
              onClick={handleDelete}
              title="Delete loopback edge"
            >
              <X className="size-2.5" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
