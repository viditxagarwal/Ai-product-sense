"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { GitFork } from "lucide-react";
import type { WorkflowNodeData } from "@/types";

function SplitNode({ data, selected }: NodeProps) {
  const d = data as unknown as WorkflowNodeData;

  const branchCount = d.branchCount ?? 3;
  const mergeMethod = d.mergeMethod || "summarize";
  const waitStrategy = d.waitStrategy || "wait_all";

  return (
    <div
      className={`w-[220px] rounded-lg border-l-4 border-purple-400 bg-white shadow-sm transition-shadow ${
        selected ? "ring-2 ring-purple-400 ring-offset-1 shadow-md" : "hover:shadow-md"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2.5 !border-2 !border-white !bg-slate-400"
      />

      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <GitFork className="size-3.5 shrink-0 text-purple-600" />
        <span className="truncate text-xs font-semibold text-slate-800">
          {d.label || "Parallel Split"}
        </span>
      </div>

      {/* Body */}
      <div className="border-t border-slate-100 px-3 py-1.5">
        <p className="text-[10px] text-slate-500">
          {branchCount} branches &middot; {mergeMethod.replace(/_/g, " ")}
        </p>
        <p className="mt-0.5 text-[10px] text-slate-400">
          {waitStrategy === "wait_all" ? "Wait for all" : waitStrategy.replace(/_/g, " ")}
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

export default memo(SplitNode);
