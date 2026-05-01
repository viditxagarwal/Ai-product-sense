"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Activity,
  Filter,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useExecutionStore, type ActivityLogEntry } from "@/stores/execution-store";

const EVENT_ICONS: Record<string, string> = {
  run_started: "play_arrow",
  run_completed: "check_circle",
  step_started: "arrow_forward",
  step_completed: "check",
  tool_started: "build",
  tool_completed: "build_circle",
  edge_evaluated: "call_split",
  loop_iteration: "loop",
  split_started: "fork_right",
  split_completed: "merge",
  gate_review_requested: "shield",
  human_review_completed: "gavel",
  error: "error",
};

const SEVERITY_COLORS: Record<string, string> = {
  info: "text-slate-500",
  warn: "text-amber-600",
  error: "text-red-600",
  success: "text-emerald-600",
};

const SEVERITY_BG: Record<string, string> = {
  info: "bg-slate-50",
  warn: "bg-amber-50",
  error: "bg-red-50",
  success: "bg-emerald-50",
};

export default function ActivityLog() {
  const { activityLog, clearActivityLog, displaySettings } = useExecutionStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<string>("");
  const [collapsed, setCollapsed] = useState(false);

  // Don't render if setting is off
  if (displaySettings && !displaySettings.show_activity_log) return null;

  const filtered = filter
    ? activityLog.filter((e) => e.eventType.includes(filter))
    : activityLog;

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activityLog.length]);

  if (activityLog.length === 0) return null;

  return (
    <div className="border-t border-slate-200 bg-white">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-50"
      >
        {collapsed ? (
          <ChevronRight className="size-3" />
        ) : (
          <ChevronDown className="size-3" />
        )}
        <Activity className="size-3" />
        Activity Log
        <span className="text-slate-400">({activityLog.length})</span>
        <div className="flex-1" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            clearActivityLog();
          }}
          className="text-slate-300 hover:text-slate-500"
          title="Clear log"
        >
          <Trash2 className="size-3" />
        </button>
      </button>

      {!collapsed && (
        <div className="max-h-48 overflow-y-auto px-3 pb-2 space-y-0.5">
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className={cn(
                "flex items-start gap-2 rounded px-1.5 py-0.5 text-[10px]",
                SEVERITY_BG[entry.severity]
              )}
            >
              <span className="shrink-0 text-slate-400 font-mono">
                {new Date(entry.timestamp).toISOString().slice(11, 23)}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded bg-slate-100 px-1 py-0.5 font-medium",
                  SEVERITY_COLORS[entry.severity]
                )}
              >
                {entry.eventType}
              </span>
              <span className="text-slate-600 truncate">
                {entry.description}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  );
}
