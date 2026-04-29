"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { UserCheck } from "lucide-react";
import type { WorkflowNodeData } from "@/types";

function GateNode({ data, selected }: NodeProps) {
  const d = data as unknown as WorkflowNodeData;

  const waitDuration = d.waitDuration || "24h";
  const onTimeout = d.onTimeout || "auto_approve";
  const reviewInstructions = d.reviewInstructions || d.displayContent || "";

  return (
    <div
      className={`w-[220px] rounded-lg border-l-4 border-amber-400 bg-white shadow-sm transition-shadow ${
        selected ? "ring-2 ring-amber-400 ring-offset-1 shadow-md" : "hover:shadow-md"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2.5 !border-2 !border-white !bg-slate-400"
      />

      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <UserCheck className="size-3.5 shrink-0 text-amber-600" />
        <span className="truncate text-xs font-semibold text-slate-800">
          {d.label || "Review Gate"}
        </span>
      </div>

      {/* Body */}
      <div className="border-t border-slate-100 px-3 py-1.5">
        <p className="truncate text-[10px] text-slate-500">
          Review: {reviewInstructions ? reviewInstructions.slice(0, 35) + "..." : "prev step output"}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-400">
          {waitDuration} &rarr; {onTimeout.replace(/_/g, "-")}
        </p>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!size-2.5 !border-2 !border-white !bg-slate-400"
      />
    </div>
  );
}

export default memo(GateNode);
