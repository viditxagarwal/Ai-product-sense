"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ExecutionStep } from "@/types";

interface TimingBarProps {
  steps: ExecutionStep[];
  onSegmentClick: (stepId: string) => void;
}

// Same node type palette as TraceStep
const NODE_BG: Record<string, string> = {
  route: "bg-orange-400",
  retriever: "bg-emerald-400",
  calculator: "bg-blue-400",
  code_interpreter: "bg-indigo-400",
  validator: "bg-red-400",
  file_writer: "bg-amber-400",
  summarizer: "bg-purple-400",
  agent_node: "bg-slate-400",
  classifier: "bg-pink-400",
  parallelization: "bg-cyan-400",
  loop: "bg-violet-400",
  human_review: "bg-teal-400",
  end: "bg-gray-300",
};

export default function TimingBar({ steps, onSegmentClick }: TimingBarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const totalDuration = steps.reduce((acc, s) => acc + (s.duration_ms ?? 0), 0);

  if (totalDuration === 0) return null;

  return (
    <div className="px-3 py-2">
      <div className="flex h-5 w-full overflow-hidden rounded-full bg-slate-100">
        {steps.map((step) => {
          const duration = step.duration_ms ?? 0;
          if (duration === 0) return null;
          const pct = (duration / totalDuration) * 100;
          const bg = NODE_BG[step.node_type] || "bg-slate-400";

          return (
            <div
              key={step.id}
              className="group relative"
              style={{ width: `${pct}%`, minWidth: "4px" }}
              onMouseEnter={() => setHoveredId(step.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onSegmentClick(step.id)}
            >
              <div
                className={cn(
                  "h-full cursor-pointer border-r border-white/50 transition-opacity",
                  bg,
                  hoveredId === step.id ? "opacity-100" : "opacity-75 hover:opacity-90"
                )}
              />
              {/* Tooltip */}
              {hoveredId === step.id && (
                <div className="absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-[10px] text-white shadow-lg">
                  Step {step.step_number}: {step.node_name} ({(duration / 1000).toFixed(1)}s)
                  <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {/* Total duration label */}
      <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400">
        <span>0s</span>
        <span>{(totalDuration / 1000).toFixed(1)}s total</span>
      </div>
    </div>
  );
}
