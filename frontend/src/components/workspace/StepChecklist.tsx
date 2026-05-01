"use client";

import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";

interface StepItem {
  nodeId: string;
  nodeName: string;
  status: "pending" | "running" | "completed" | "error";
  durationMs?: number;
}

interface StepChecklistProps {
  steps: StepItem[];
}

export default function StepChecklist({ steps }: StepChecklistProps) {
  if (!steps.length) return null;

  return (
    <div className="space-y-1 rounded-lg border bg-white p-3 text-xs">
      <div className="mb-1.5 text-[11px] font-medium text-slate-500 uppercase tracking-wider">Execution Steps</div>
      {steps.map((step) => (
        <div key={step.nodeId} className="flex items-center gap-2 py-0.5">
          {step.status === "pending" && <Circle className="size-3.5 text-slate-300" />}
          {step.status === "running" && <Loader2 className="size-3.5 text-blue-500 animate-spin" />}
          {step.status === "completed" && <CheckCircle2 className="size-3.5 text-emerald-500" />}
          {step.status === "error" && <XCircle className="size-3.5 text-red-500" />}
          <span className={step.status === "running" ? "font-medium text-blue-700" : "text-slate-600"}>
            {step.nodeName}
          </span>
          {step.status === "completed" && step.durationMs !== undefined && (
            <span className="ml-auto text-slate-400">
              {step.durationMs < 1000 ? `${step.durationMs}ms` : `${(step.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
