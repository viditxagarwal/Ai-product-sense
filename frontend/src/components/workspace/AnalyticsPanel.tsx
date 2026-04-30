"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useExecutionStore } from "@/stores/execution-store";
import type { ExecutionSummary, ExecutionEvent, ExecutionStep, LLMCallData } from "@/types";

// ─── Color Palettes ───────────────────────────────────────────────────────────

const SEGMENT_COLORS = [
  "bg-blue-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-pink-500",
];

const SEGMENT_HEX = [
  "#3b82f6",
  "#8b5cf6",
  "#10b981",
  "#f59e0b",
  "#f43f5e",
  "#06b6d4",
  "#f97316",
  "#ec4899",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCost(usd: number): string {
  if (usd === 0) return "$0.00";
  if (usd < 0.001) return `$${(usd * 1000).toFixed(3)}m`;
  return `$${usd.toFixed(4)}`;
}

function formatMs(ms: number | null): string {
  if (ms === null || ms === undefined) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

// ─── Collapsible Section Wrapper ─────────────────────────────────────────────

interface SectionProps {
  title: string;
  badge?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ title, badge, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-neutral-800 rounded-md overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-neutral-900 hover:bg-neutral-800 transition-colors"
      >
        <span className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="w-3 h-3 text-neutral-400 shrink-0" />
          ) : (
            <ChevronRight className="w-3 h-3 text-neutral-400 shrink-0" />
          )}
          <span className="text-xs font-medium text-neutral-200">{title}</span>
          {badge && (
            <span className="text-[10px] text-neutral-500 bg-neutral-800 rounded px-1.5 py-0.5">
              {badge}
            </span>
          )}
        </span>
      </button>
      {open && <div className="px-3 py-3 bg-neutral-950">{children}</div>}
    </div>
  );
}

// ─── E1: Cost Breakdown ───────────────────────────────────────────────────────

interface CostBreakdownProps {
  summary: ExecutionSummary;
}

function CostBreakdown({ summary }: CostBreakdownProps) {
  const [view, setView] = useState<"model" | "node">("model");

  const data =
    view === "model" ? summary.cost_by_model : summary.cost_by_node;

  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  if (entries.length === 0 || total === 0) {
    return (
      <Section
        title="Cost Breakdown"
        badge={formatCost(summary.total_cost_usd)}
      >
        <p className="text-[10px] text-neutral-500">No cost data</p>
      </Section>
    );
  }

  return (
    <Section
      title="Cost Breakdown"
      badge={formatCost(summary.total_cost_usd)}
    >
      {/* View toggle */}
      <div className="flex gap-1 mb-3">
        {(["model", "node"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={cn(
              "text-[10px] px-2 py-0.5 rounded border transition-colors",
              view === v
                ? "bg-blue-600 border-blue-500 text-white"
                : "bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-neutral-200"
            )}
          >
            By {v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {/* Stacked horizontal bar */}
      <div className="w-full h-5 flex rounded overflow-hidden mb-3">
        {entries.map(([key, value], i) => {
          const pct = total > 0 ? (value / total) * 100 : 0;
          return (
            <div
              key={key}
              className={cn("h-full", SEGMENT_COLORS[i % SEGMENT_COLORS.length])}
              style={{ width: `${pct}%` }}
              title={`${key}: ${formatCost(value)} (${pct.toFixed(1)}%)`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-col gap-1">
        {entries.map(([key, value], i) => {
          const pct = total > 0 ? (value / total) * 100 : 0;
          return (
            <div key={key} className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{
                    backgroundColor:
                      SEGMENT_HEX[i % SEGMENT_HEX.length],
                  }}
                />
                <span
                  className="text-[10px] text-neutral-300 truncate"
                  title={key}
                >
                  {key}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-neutral-500">
                  {pct.toFixed(1)}%
                </span>
                <span className="text-[10px] text-neutral-300 font-mono">
                  {formatCost(value)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ─── E3: Latency Waterfall ────────────────────────────────────────────────────

interface LatencyWaterfallProps {
  summary: ExecutionSummary;
  steps: ExecutionStep[];
}

function LatencyWaterfall({ summary, steps }: LatencyWaterfallProps) {
  const totalMs = summary.total_duration_ms || 1;

  const stepsWithDuration = steps.filter(
    (s) => s.duration_ms !== null && s.duration_ms !== undefined
  );

  const maxTokens = Math.max(...stepsWithDuration.map((s) => s.tokens_used), 1);

  if (stepsWithDuration.length === 0) {
    return (
      <Section title="Latency Waterfall" badge={formatMs(summary.total_duration_ms)}>
        <p className="text-[10px] text-neutral-500">No timing data</p>
      </Section>
    );
  }

  return (
    <Section title="Latency Waterfall" badge={formatMs(summary.total_duration_ms)}>
      <div className="flex flex-col gap-1.5">
        {stepsWithDuration.map((step) => {
          const dur = step.duration_ms ?? 0;
          const widthPct = Math.max((dur / totalMs) * 100, 1);
          // Color intensity: 20% to 80% opacity based on token ratio
          const tokenRatio = maxTokens > 0 ? step.tokens_used / maxTokens : 0;
          const opacity = 0.2 + tokenRatio * 0.6;

          return (
            <div key={step.id} className="flex items-center gap-2">
              {/* Label */}
              <div className="w-24 shrink-0 text-right">
                <span
                  className="text-[10px] text-neutral-400 truncate block"
                  title={step.node_name}
                >
                  {step.node_name}
                </span>
              </div>

              {/* Bar track */}
              <div className="flex-1 h-5 bg-neutral-800 rounded overflow-hidden relative">
                <div
                  className="h-full rounded flex items-center px-1.5"
                  style={{
                    width: `${widthPct}%`,
                    backgroundColor: `rgba(59, 130, 246, ${opacity})`,
                    minWidth: "2px",
                  }}
                  title={`${step.node_name}: ${formatMs(dur)} | ${formatTokens(step.tokens_used)} tokens`}
                >
                  {widthPct > 12 && (
                    <span className="text-[9px] text-white truncate whitespace-nowrap">
                      {formatMs(dur)}
                    </span>
                  )}
                </div>
              </div>

              {/* Duration label */}
              <div className="w-12 shrink-0">
                <span className="text-[10px] text-neutral-500 font-mono">
                  {formatMs(dur)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend note */}
      <p className="text-[9px] text-neutral-600 mt-2">
        Bar opacity indicates relative token usage (darker = more tokens).
      </p>
    </Section>
  );
}

// ─── E4: Model Usage Table ────────────────────────────────────────────────────

interface ModelUsageTableProps {
  events: ExecutionEvent[];
}

interface ModelAgg {
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  total_latency_ms: number;
}

function ModelUsageTable({ events }: ModelUsageTableProps) {
  const llmEvents = events.filter((e) => e.event_type === "llm_call_completed");

  const agg: Record<string, ModelAgg> = {};

  for (const ev of llmEvents) {
    const d = ev.data as Partial<LLMCallData>;
    const model = (d.model_id as string) || "unknown";
    if (!agg[model]) {
      agg[model] = {
        calls: 0,
        input_tokens: 0,
        output_tokens: 0,
        cost_usd: 0,
        total_latency_ms: 0,
      };
    }
    agg[model].calls += 1;
    agg[model].input_tokens += (d.input_tokens as number) || 0;
    agg[model].output_tokens += (d.output_tokens as number) || 0;
    agg[model].cost_usd += (d.cost_usd as number) || 0;
    agg[model].total_latency_ms += (d.latency_ms as number) || 0;
  }

  const rows = Object.entries(agg).sort(([, a], [, b]) => b.cost_usd - a.cost_usd);

  const totals = rows.reduce(
    (acc, [, r]) => ({
      calls: acc.calls + r.calls,
      input_tokens: acc.input_tokens + r.input_tokens,
      output_tokens: acc.output_tokens + r.output_tokens,
      cost_usd: acc.cost_usd + r.cost_usd,
      total_latency_ms: acc.total_latency_ms + r.total_latency_ms,
    }),
    { calls: 0, input_tokens: 0, output_tokens: 0, cost_usd: 0, total_latency_ms: 0 }
  );

  if (rows.length === 0) {
    return (
      <Section title="Model Usage">
        <p className="text-[10px] text-neutral-500">No LLM call data</p>
      </Section>
    );
  }

  const thCls = "text-right text-[10px] text-neutral-500 font-medium pb-1 px-1";
  const tdCls = "text-right text-[10px] text-neutral-300 font-mono px-1 py-0.5";
  const tdLeftCls = "text-left text-[10px] text-neutral-300 px-1 py-0.5";

  return (
    <Section title="Model Usage" badge={`${rows.length} model${rows.length !== 1 ? "s" : ""}`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-neutral-800">
              <th className={cn(thCls, "text-left")}>Model</th>
              <th className={thCls}>Calls</th>
              <th className={thCls}>Input Tok</th>
              <th className={thCls}>Output Tok</th>
              <th className={thCls}>Cost</th>
              <th className={thCls}>Avg Latency</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([model, r]) => (
              <tr
                key={model}
                className="border-b border-neutral-900 hover:bg-neutral-900 transition-colors"
              >
                <td className={tdLeftCls}>
                  <span className="truncate block max-w-[120px]" title={model}>
                    {model}
                  </span>
                </td>
                <td className={tdCls}>{r.calls}</td>
                <td className={tdCls}>{formatTokens(r.input_tokens)}</td>
                <td className={tdCls}>{formatTokens(r.output_tokens)}</td>
                <td className={tdCls}>{formatCost(r.cost_usd)}</td>
                <td className={tdCls}>
                  {r.calls > 0 ? formatMs(Math.round(r.total_latency_ms / r.calls)) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-700">
              <td className={cn(tdLeftCls, "text-neutral-500 font-medium")}>Total</td>
              <td className={cn(tdCls, "text-neutral-400")}>{totals.calls}</td>
              <td className={cn(tdCls, "text-neutral-400")}>{formatTokens(totals.input_tokens)}</td>
              <td className={cn(tdCls, "text-neutral-400")}>{formatTokens(totals.output_tokens)}</td>
              <td className={cn(tdCls, "text-neutral-400")}>{formatCost(totals.cost_usd)}</td>
              <td className={cn(tdCls, "text-neutral-400")}>
                {totals.calls > 0
                  ? formatMs(Math.round(totals.total_latency_ms / totals.calls))
                  : "—"}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Section>
  );
}

// ─── E5: Tool Usage Table ─────────────────────────────────────────────────────

interface ToolUsageTableProps {
  events: ExecutionEvent[];
}

interface ToolAgg {
  calls: number;
  successes: number;
  total_duration_ms: number;
  total_cost_usd: number;
}

function ToolUsageTable({ events }: ToolUsageTableProps) {
  const toolEvents = events.filter((e) => e.event_type === "tool_completed");

  const agg: Record<string, ToolAgg> = {};

  for (const ev of toolEvents) {
    const d = ev.data as Record<string, unknown>;
    const toolName = (d.tool_name as string) || (d.name as string) || "unknown";
    if (!agg[toolName]) {
      agg[toolName] = {
        calls: 0,
        successes: 0,
        total_duration_ms: 0,
        total_cost_usd: 0,
      };
    }
    agg[toolName].calls += 1;
    const success =
      d.success === true ||
      d.status === "success" ||
      d.status === "completed";
    if (success) agg[toolName].successes += 1;
    agg[toolName].total_duration_ms += (d.duration_ms as number) || 0;
    agg[toolName].total_cost_usd += (d.cost_usd as number) || 0;
  }

  const rows = Object.entries(agg).sort(([, a], [, b]) => b.calls - a.calls);

  if (rows.length === 0) {
    return (
      <Section title="Tool Usage">
        <p className="text-[10px] text-neutral-500">No tool call data</p>
      </Section>
    );
  }

  const thCls = "text-right text-[10px] text-neutral-500 font-medium pb-1 px-1";
  const tdCls = "text-right text-[10px] text-neutral-300 font-mono px-1 py-0.5";
  const tdLeftCls = "text-left text-[10px] text-neutral-300 px-1 py-0.5";

  return (
    <Section title="Tool Usage" badge={`${rows.length} tool${rows.length !== 1 ? "s" : ""}`}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-neutral-800">
              <th className={cn(thCls, "text-left")}>Tool</th>
              <th className={thCls}>Calls</th>
              <th className={thCls}>Success %</th>
              <th className={thCls}>Avg Duration</th>
              <th className={thCls}>Total Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([tool, r]) => {
              const successRate = r.calls > 0 ? (r.successes / r.calls) * 100 : 100;
              const lowSuccess = successRate < 90;

              return (
                <tr
                  key={tool}
                  className="border-b border-neutral-900 hover:bg-neutral-900 transition-colors"
                >
                  <td className={tdLeftCls}>
                    <span className="truncate block max-w-[120px]" title={tool}>
                      {tool}
                    </span>
                  </td>
                  <td className={tdCls}>{r.calls}</td>
                  <td
                    className={cn(
                      tdCls,
                      lowSuccess ? "text-red-400" : "text-neutral-300"
                    )}
                  >
                    {successRate.toFixed(0)}%
                  </td>
                  <td className={tdCls}>
                    {r.calls > 0
                      ? formatMs(Math.round(r.total_duration_ms / r.calls))
                      : "—"}
                  </td>
                  <td className={tdCls}>{formatCost(r.total_cost_usd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.some(([, r]) => r.calls > 0 && (r.successes / r.calls) * 100 < 90) && (
        <p className="text-[9px] text-red-400 mt-2">
          Tools in red have a success rate below 90%.
        </p>
      )}
    </Section>
  );
}

// ─── Main AnalyticsPanel ──────────────────────────────────────────────────────

interface AnalyticsPanelProps {
  summary: ExecutionSummary;
  steps: ExecutionStep[];
  events: ExecutionEvent[];
}

export default function AnalyticsPanel({
  summary,
  steps,
  events,
}: AnalyticsPanelProps) {
  const { displaySettings: ds } = useExecutionStore();

  return (
    <div className="flex flex-col gap-3 p-3 overflow-y-auto">
      {/* Quick stats strip */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Duration", value: formatMs(summary.total_duration_ms) },
          { label: "Total Cost", value: formatCost(summary.total_cost_usd) },
          { label: "Tokens", value: formatTokens(summary.total_tokens) },
          { label: "LLM Calls", value: summary.total_llm_calls },
          { label: "Tool Calls", value: summary.total_tool_calls },
          { label: "Steps", value: summary.step_count },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="bg-neutral-900 border border-neutral-800 rounded-md px-2 py-1.5"
          >
            <p className="text-[9px] text-neutral-500 uppercase tracking-wide">
              {label}
            </p>
            <p className="text-xs font-mono text-neutral-200 mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      {/* E1 — gated by show_cost_breakdown */}
      {(ds?.show_cost_breakdown ?? true) && (
        <CostBreakdown summary={summary} />
      )}

      {/* E3 — gated by show_latency_waterfall */}
      {(ds?.show_latency_waterfall ?? true) && (
        <LatencyWaterfall summary={summary} steps={steps} />
      )}

      {/* E4 */}
      <ModelUsageTable events={events} />

      {/* E5 */}
      <ToolUsageTable events={events} />
    </div>
  );
}
