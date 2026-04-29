"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { NODE_TYPE_MAP, resolveNodeType } from "../nodeTypes";

export interface WorkflowNodeData {
  label: string;
  nodeType: string;
  purpose?: string;
  boundTools?: string[];
  // Common
  onMissingData?: string;
  onToolFailure?: string;
  onLowConfidence?: string;
  modelOverride?: string;
  guardrailOverride?: string;
  // Decision
  conditionType?: string;
  conditionPrompt?: string;
  pathMappings?: string;
  // Parallel
  branchCount?: number;
  fanOutMethod?: string;
  mergeMethod?: string;
  maxBranches?: number;
  // Human Review
  displayContent?: string;
  humanOptions?: string;
  timeoutBehavior?: string;
  timeoutMinutes?: number;
  // Retriever
  retrievalSource?: string;
  topK?: number;
  rerankingEnabled?: boolean;
  knowledgeLayers?: string;
  [key: string]: unknown;
}

function WorkflowNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as WorkflowNodeData;
  const resolved = resolveNodeType(nodeData.nodeType || "step");
  const config = NODE_TYPE_MAP[resolved] || NODE_TYPE_MAP["step"];
  const Icon = config.icon;

  return (
    <div
      className={`min-w-[160px] max-w-[220px] rounded-lg border-2 bg-white shadow-sm ${
        config.borderColor
      } ${selected ? "ring-2 ring-blue-400 ring-offset-1" : ""}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-3 !border-2 !border-white !bg-slate-400"
      />

      <div
        className={`flex items-center gap-2 rounded-t-md px-3 py-2 ${config.color} text-white`}
      >
        <Icon className="size-3.5" />
        <span className="truncate text-xs font-semibold">{config.label}</span>
      </div>

      <div className="px-3 py-2">
        <p className="truncate text-sm font-medium text-slate-800">
          {nodeData.label || "Untitled"}
        </p>
        {nodeData.purpose && (
          <p className="mt-0.5 truncate text-[10px] text-slate-400">
            {nodeData.purpose}
          </p>
        )}
        {nodeData.boundTools && nodeData.boundTools.length > 0 && (
          <p className="mt-1 text-[10px] text-slate-500">
            {nodeData.boundTools.length} tool
            {nodeData.boundTools.length !== 1 ? "s" : ""} bound
          </p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-3 !border-2 !border-white !bg-slate-400"
      />
    </div>
  );
}

export default memo(WorkflowNode);
