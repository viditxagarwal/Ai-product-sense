"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Brain, Wrench, Zap, Settings } from "lucide-react";
import type { WorkflowNodeData } from "@/types";

function WorkflowNode({ data, selected }: NodeProps) {
  const d = data as unknown as WorkflowNodeData;
  const llmEnabled = d.llmEnabled !== false; // default true

  // Color based on LLM toggle
  const borderColor = llmEnabled ? "border-blue-400" : "border-green-400";
  const accentBg = llmEnabled ? "bg-blue-500" : "bg-green-500";
  const Icon = llmEnabled ? Brain : Wrench;
  const BadgeIcon = llmEnabled ? Zap : Settings;

  // System prompt preview
  const prompt = d.systemPrompt || d.systemPromptHint || d.purpose || "";
  const promptPreview = prompt ? prompt.slice(0, 40) + (prompt.length > 40 ? "..." : "") : "";

  // Tool info
  const boundTools = d.boundTools || [];
  const selectedTool = d.selectedToolId || "";

  return (
    <div
      className={`w-[220px] rounded-lg border-l-4 bg-white shadow-sm transition-shadow ${borderColor} ${
        selected ? "ring-2 ring-blue-400 ring-offset-1 shadow-md" : "hover:shadow-md"
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-2.5 !border-2 !border-white !bg-slate-400"
      />

      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon className="size-3.5 shrink-0 text-slate-600" />
          <span className="truncate text-xs font-semibold text-slate-800">
            {d.label || "Untitled"}
          </span>
        </div>
        <div className={`flex size-5 items-center justify-center rounded ${accentBg}`}>
          <BadgeIcon className="size-3 text-white" />
        </div>
      </div>

      {/* Body */}
      <div className="border-t border-slate-100 px-3 py-1.5">
        {llmEnabled ? (
          <>
            <p className="truncate text-[10px] text-slate-400 italic">
              {promptPreview || "No prompt set"}
            </p>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
              {boundTools.length > 0 && (
                <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600">
                  {boundTools.length} tool{boundTools.length !== 1 ? "s" : ""}
                </span>
              )}
              {d.modelOverride && (
                <span className="truncate rounded bg-slate-100 px-1.5 py-0.5">
                  {d.modelOverride}
                </span>
              )}
              {!d.modelOverride && !boundTools.length && (
                <span className="text-slate-300">config default</span>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="truncate text-[10px] text-slate-500">
              Tool: {selectedTool || <span className="italic text-slate-300">No tool selected</span>}
            </p>
            {d.inputMapping && (
              <p className="mt-0.5 truncate text-[10px] text-slate-400">
                Source: {d.inputMapping}
              </p>
            )}
          </>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!size-2.5 !border-2 !border-white !bg-slate-400"
      />
    </div>
  );
}

export default memo(WorkflowNode);
export type { WorkflowNodeData };
