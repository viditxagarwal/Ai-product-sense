"use client";

import { useEffect, useRef, useState } from "react";
import { Bug, X, Trash2, Activity } from "lucide-react";
import { useWsDebugLog, clearWsDebugLog } from "./ChatInput";
import { cn } from "@/lib/utils";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

export default function DebugPanel() {
  const [open, setOpen] = useState(false);
  const [backendStatus, setBackendStatus] = useState<Record<string, unknown> | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const log = useWsDebugLog();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new entries arrive
  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [log.length, open]);

  const fetchBackendStatus = async () => {
    setStatusLoading(true);
    try {
      const res = await fetch(`${API_BASE}/debug/status`);
      const data = await res.json();
      setBackendStatus(data);
    } catch (e) {
      setBackendStatus({ error: `Failed to reach backend: ${e}` });
    } finally {
      setStatusLoading(false);
    }
  };

  const errorCount = log.filter((e) => e.level === "error").length;
  const warnCount = log.filter((e) => e.level === "warn").length;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-4 right-4 z-50 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium shadow-lg transition-all hover:scale-105",
          errorCount > 0
            ? "bg-red-500 text-white animate-pulse"
            : warnCount > 0
            ? "bg-amber-500 text-white"
            : "bg-slate-700 text-slate-200 hover:bg-slate-600"
        )}
        title="Open debug panel"
      >
        <Bug className="size-3.5" />
        WS Debug
        {errorCount > 0 && (
          <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px]">
            {errorCount} err
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 z-50 flex w-[480px] max-w-[90vw] flex-col rounded-tl-lg border border-slate-200 bg-white shadow-2xl"
         style={{ maxHeight: "60vh" }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2">
          <Bug className="size-4 text-slate-500" />
          <span className="text-xs font-semibold text-slate-700">WebSocket Debug</span>
          <span className="rounded-full bg-slate-200 px-1.5 text-[10px] text-slate-600">
            {log.length} events
          </span>
          {errorCount > 0 && (
            <span className="rounded-full bg-red-100 px-1.5 text-[10px] text-red-700">
              {errorCount} errors
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={fetchBackendStatus}
            className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            title="Check backend status"
          >
            <Activity className={cn("size-3.5", statusLoading && "animate-spin")} />
          </button>
          <button
            onClick={clearWsDebugLog}
            className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
            title="Clear log"
          >
            <Trash2 className="size-3.5" />
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Backend status (collapsible) */}
      {backendStatus && (
        <div className="border-b bg-slate-50 px-3 py-2">
          <div className="text-[10px] font-semibold text-slate-500 uppercase mb-1">Backend Status</div>
          <pre className="text-[10px] leading-relaxed text-slate-600 whitespace-pre-wrap overflow-auto max-h-32">
            {JSON.stringify(backendStatus, null, 2)}
          </pre>
        </div>
      )}

      {/* Environment info */}
      <div className="border-b bg-blue-50 px-3 py-1.5">
        <div className="flex items-center gap-2 text-[10px] text-blue-700">
          <span className="font-medium">WS_BASE:</span>
          <code className="rounded bg-blue-100 px-1">{process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/api/v1 (default)"}</code>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-blue-700">
          <span className="font-medium">API_BASE:</span>
          <code className="rounded bg-blue-100 px-1">{process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1 (default)"}</code>
        </div>
      </div>

      {/* Log entries */}
      <div ref={scrollRef} className="flex-1 overflow-auto px-1 py-1" style={{ minHeight: "120px" }}>
        {log.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            No WebSocket events yet. Send a message to start.
          </div>
        ) : (
          log.map((entry, i) => (
            <div
              key={i}
              className={cn(
                "flex gap-2 rounded px-2 py-0.5 font-mono text-[10px] leading-relaxed",
                entry.level === "error" && "bg-red-50 text-red-800",
                entry.level === "warn" && "bg-amber-50 text-amber-800",
                entry.level === "info" && "text-slate-600"
              )}
            >
              <span className="shrink-0 text-slate-400">{entry.ts}</span>
              <span
                className={cn(
                  "shrink-0 w-8 text-center font-semibold uppercase",
                  entry.level === "error" && "text-red-600",
                  entry.level === "warn" && "text-amber-600",
                  entry.level === "info" && "text-slate-400"
                )}
              >
                {entry.level === "info" ? "INF" : entry.level === "warn" ? "WRN" : "ERR"}
              </span>
              <span className="break-all">{entry.msg}</span>
            </div>
          ))
        )}
      </div>

      {/* Quick tips */}
      <div className="border-t bg-slate-50 px-3 py-1.5 text-[10px] text-slate-500">
        Tip: Check Railway logs for backend-side [ws.stream] and [ws.execution] log lines.
        Click <Activity className="inline size-3" /> to ping backend /debug/status.
      </div>
    </div>
  );
}
