"use client";

/**
 * Section C.1: Summary Indicators (A1-A10)
 * Always-visible metrics bar showing tokens, cost, duration, steps, etc.
 */

import {
  Cpu,
  DollarSign,
  Clock,
  Layers,
  Zap,
  Wrench,
  Database,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useExecutionStore } from "@/stores/execution-store";
import type { ExecutionSummary } from "@/types";

interface Props {
  summary: ExecutionSummary;
  status: string;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = ((ms % 60_000) / 1000).toFixed(0);
  return `${m}m ${s}s`;
}

function costColor(cost: number): string {
  if (cost < 0.01) return "text-emerald-600 bg-emerald-50";
  if (cost < 0.1) return "text-yellow-600 bg-yellow-50";
  if (cost < 1.0) return "text-orange-600 bg-orange-50";
  return "text-red-600 bg-red-50";
}

function durationColor(ms: number): string {
  if (ms < 3000) return "text-emerald-600";
  if (ms < 10000) return "text-yellow-600";
  if (ms < 30000) return "text-orange-600";
  return "text-red-600";
}

function statusColor(status: string): string {
  switch (status) {
    case "completed": return "bg-emerald-50 text-emerald-600";
    case "failed": return "bg-red-50 text-red-600";
    case "running": return "bg-amber-50 text-amber-600";
    case "cancelled": return "bg-slate-100 text-slate-500";
    default: return "bg-blue-50 text-blue-600";
  }
}

export default function ExecutionSummaryBar({ summary, status }: Props) {
  const { displaySettings: ds } = useExecutionStore();
  const hasThinking = summary.total_thinking_tokens > 0;
  const hasCacheRead = summary.total_cache_read_tokens > 0;
  const cachePercent = summary.total_input_tokens > 0
    ? Math.round((summary.total_cache_read_tokens / summary.total_input_tokens) * 100)
    : 0;

  return (
    <div className="border-b bg-slate-50 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-[10px]">
        {/* A7: Status Pill */}
        <span className={cn("rounded px-1.5 py-0.5 font-medium", statusColor(status))}>
          {status}
        </span>

        {/* A4: Step Count */}
        <Badge icon={Layers} label="steps" value={summary.step_count} />

        {/* A3: Duration */}
        <span className={cn("flex items-center gap-1 text-slate-500")}>
          <Clock className="size-3" />
          <strong className={durationColor(summary.total_duration_ms)}>
            {formatDuration(summary.total_duration_ms)}
          </strong>
        </span>

        {/* A1: Token Badge */}
        {(ds?.show_token_counts ?? true) && (
          <Badge icon={Cpu} label="tokens" value={formatTokens(summary.total_tokens)} />
        )}

        {/* A9: Token Split */}
        {(ds?.show_token_counts ?? true) && (
          <span className="text-slate-400">
            {formatTokens(summary.total_input_tokens)} in / {formatTokens(summary.total_output_tokens)} out
            {hasThinking && ` / ${formatTokens(summary.total_thinking_tokens)} think`}
          </span>
        )}

        {/* A2: Cost Badge */}
        {(ds?.show_costs ?? true) && (
          <span className={cn("flex items-center gap-1 rounded px-1.5 py-0.5 font-medium",
            costColor(summary.total_cost_usd))}>
            <DollarSign className="size-3" />
            ${summary.total_cost_usd.toFixed(4)}
          </span>
        )}

        {/* A5: LLM Call Count */}
        {(ds?.show_inner_llm_calls ?? true) && summary.total_llm_calls > 0 && (
          <Badge icon={Zap} label="LLM calls" value={summary.total_llm_calls}
            warn={summary.total_llm_calls > summary.step_count * 2} />
        )}

        {/* A6: Tool Call Count */}
        {(ds?.show_tool_call_details ?? true) && summary.total_tool_calls > 0 && (
          <Badge icon={Wrench} label="tool calls" value={summary.total_tool_calls} />
        )}

        {/* A10: Cache Indicator */}
        {hasCacheRead && (
          <span className={cn(
            "flex items-center gap-1 rounded px-1.5 py-0.5 font-medium",
            cachePercent > 50 ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"
          )}>
            <Database className="size-3" />
            {cachePercent}% cached
          </span>
        )}

        {/* A8: Model Tags */}
        <div className="ml-auto flex gap-1">
          {summary.models_used.map((m) => (
            <span key={m} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              {m}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Badge({
  icon: Icon,
  label,
  value,
  warn,
}: {
  icon: typeof Cpu;
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-1", warn ? "text-amber-600" : "text-slate-500")}>
      <Icon className="size-3" />
      <strong className={warn ? "text-amber-700" : "text-slate-700"}>{value}</strong>
      {label}
    </span>
  );
}
