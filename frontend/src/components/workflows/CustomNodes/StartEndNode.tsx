"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { WorkflowNodeData } from "@/types";

function StartEndNode({ data }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const isStart = nodeData.componentType === "start" || nodeData.label === "START";

  return (
    <div className="relative flex items-center justify-center">
      {/* Input handle for END */}
      {!isStart && (
        <Handle
          type="target"
          position={Position.Left}
          className="!size-2.5 !border-2 !border-white !bg-gray-400"
        />
      )}

      <div
        className={`flex items-center justify-center rounded-full px-5 py-2 text-xs font-bold text-white shadow-sm ${
          isStart
            ? "animate-pulse-subtle bg-gray-500 ring-2 ring-gray-300 ring-offset-1"
            : "bg-gray-500"
        }`}
        style={{ minWidth: 80 }}
      >
        {isStart ? "START" : "END"}
      </div>

      {/* Output handle for START */}
      {isStart && (
        <Handle
          type="source"
          position={Position.Right}
          className="!size-2.5 !border-2 !border-white !bg-gray-400"
        />
      )}
    </div>
  );
}

export default memo(StartEndNode);
