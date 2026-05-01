"use client";

import { CheckCircle2, XCircle, Clock } from "lucide-react";

interface BranchResult {
  branchIndex: number;
  targetNodeId: string;
  targetNodeName: string;
  status: "completed" | "failed" | "running";
  durationMs?: number;
  tokens?: number;
  costUsd?: number;
  output?: string;
}

interface ParallelBranchViewProps {
  nodeLabel: string;
  mergeMethod: string;
  branches: BranchResult[];
  mergedOutput?: string;
}

export default function ParallelBranchView({
  nodeLabel,
  mergeMethod,
  branches,
  mergedOutput,
}: ParallelBranchViewProps) {
  return (
    <div className="rounded-lg border bg-white p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium text-slate-700">{nodeLabel} — Parallel Branches</span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
          merge: {mergeMethod}
        </span>
      </div>
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(branches.length, 3)}, 1fr)` }}>
        {branches.map((branch) => (
          <div
            key={branch.branchIndex}
            className={`rounded border p-2 ${
              branch.status === "failed" ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"
            }`}
          >
            <div className="mb-1 flex items-center gap-1.5">
              {branch.status === "completed" && <CheckCircle2 className="size-3 text-emerald-500" />}
              {branch.status === "failed" && <XCircle className="size-3 text-red-500" />}
              {branch.status === "running" && <Clock className="size-3 text-blue-500" />}
              <span className="font-medium truncate">{branch.targetNodeName}</span>
            </div>
            <div className="flex gap-2 text-[10px] text-slate-400">
              {branch.durationMs !== undefined && (
                <span>{branch.durationMs < 1000 ? `${branch.durationMs}ms` : `${(branch.durationMs / 1000).toFixed(1)}s`}</span>
              )}
              {branch.tokens !== undefined && <span>{branch.tokens} tok</span>}
              {branch.costUsd !== undefined && <span>${branch.costUsd.toFixed(4)}</span>}
            </div>
            {branch.output && (
              <div className="mt-1.5 max-h-24 overflow-y-auto rounded bg-white p-1.5 text-[10px] text-slate-500 border">
                {branch.output.slice(0, 300)}
                {branch.output.length > 300 && "\u2026"}
              </div>
            )}
          </div>
        ))}
      </div>
      {mergedOutput && (
        <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-2">
          <div className="mb-1 text-[10px] font-medium text-blue-600">Merged Output</div>
          <div className="max-h-32 overflow-y-auto text-[10px] text-slate-600">
            {mergedOutput.slice(0, 500)}
            {mergedOutput.length > 500 && "\u2026"}
          </div>
        </div>
      )}
    </div>
  );
}
