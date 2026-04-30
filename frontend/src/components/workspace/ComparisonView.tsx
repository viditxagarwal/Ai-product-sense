"use client";

import { useEffect, useState } from "react";
import { ArrowUp, ArrowDown, Minus, X, GitCompare, Loader2 } from "lucide-react";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ExecutionSummary } from "@/types";

interface ComparisonViewProps {
  runIdA: string;
  runIdB: string;
  onClose: () => void;
}

// --- Format helpers ---

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatDuration(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(2)}s`;
  return `${ms}ms`;
}

function formatCost(usd: number): string {
  if (usd < 0.0001) return "<$0.0001";
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(3)}`;
}

// --- Delta helpers ---

type DeltaDirection = "better" | "worse" | "neutral";

interface Delta {
  value: number;       // absolute difference (B - A)
  pct: number;         // percentage change relative to A
  direction: DeltaDirection;
}

/**
 * Compute delta from A to B.
 * `lowerIsBetter` = true for cost/tokens/duration (decrease = improvement).
 */
function computeDelta(a: number, b: number, lowerIsBetter = true): Delta {
  const value = b - a;
  const pct = a === 0 ? 0 : (value / a) * 100;
  let direction: DeltaDirection = "neutral";
  if (value !== 0) {
    direction = (lowerIsBetter ? value < 0 : value > 0) ? "better" : "worse";
  }
  return { value, pct, direction };
}

function DeltaBadge({
  delta,
  format,
}: {
  delta: Delta;
  format: (n: number) => string;
}) {
  const abs = Math.abs(delta.value);
  const sign = delta.value > 0 ? "+" : delta.value < 0 ? "-" : "";
  const pctStr = Math.abs(delta.pct) < 0.1 ? "<0.1%" : `${Math.abs(delta.pct).toFixed(1)}%`;

  if (delta.direction === "neutral") {
    return (
      <span className="inline-flex items-center gap-0.5 text-slate-400">
        <Minus className="w-3 h-3" />
        <span className="text-xs">—</span>
      </span>
    );
  }

  const colorClass =
    delta.direction === "better"
      ? "text-emerald-400"
      : "text-red-400";

  const Icon = delta.value < 0 ? ArrowDown : ArrowUp;

  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-medium", colorClass)}>
      <Icon className="w-3 h-3" />
      {sign}{format(abs)} ({pctStr})
    </span>
  );
}

// --- Path diff helpers ---

function PathDiff({ pathA, pathB }: { pathA: string[]; pathB: string[] }) {
  const setA = new Set(pathA);
  const setB = new Set(pathB);
  const allNodes = Array.from(new Set([...pathA, ...pathB]));

  return (
    <div className="space-y-1">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs text-slate-400 mb-1">Run A path</p>
          <div className="flex flex-wrap gap-1">
            {pathA.length === 0 ? (
              <span className="text-xs text-slate-500 italic">empty</span>
            ) : (
              pathA.map((node, i) => (
                <span
                  key={i}
                  className={cn(
                    "text-xs px-1.5 py-0.5 rounded border",
                    setB.has(node)
                      ? "border-slate-600 text-slate-300 bg-slate-800"
                      : "border-emerald-700 text-emerald-300 bg-emerald-900/40"
                  )}
                >
                  {node}
                </span>
              ))
            )}
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-400 mb-1">Run B path</p>
          <div className="flex flex-wrap gap-1">
            {pathB.length === 0 ? (
              <span className="text-xs text-slate-500 italic">empty</span>
            ) : (
              pathB.map((node, i) => (
                <span
                  key={i}
                  className={cn(
                    "text-xs px-1.5 py-0.5 rounded border",
                    setA.has(node)
                      ? "border-slate-600 text-slate-300 bg-slate-800"
                      : "border-red-700 text-red-300 bg-red-900/40"
                  )}
                >
                  {node}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
      {allNodes.some((n) => !setA.has(n) || !setB.has(n)) && (
        <p className="text-xs text-slate-500">
          <span className="text-emerald-400">green</span> = only in A &nbsp;|&nbsp;
          <span className="text-red-400">red</span> = only in B &nbsp;|&nbsp;
          <span className="text-slate-300">white</span> = shared
        </p>
      )}
    </div>
  );
}

// --- Per-node cost comparison ---

function NodeCostTable({
  costA,
  costB,
}: {
  costA: Record<string, number>;
  costB: Record<string, number>;
}) {
  const allNodes = Array.from(new Set([...Object.keys(costA), ...Object.keys(costB)]));
  if (allNodes.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-medium text-slate-300 mb-1">Per-node cost</p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-400">
            <th className="text-left pb-1 font-normal">Node</th>
            <th className="text-right pb-1 font-normal">Run A</th>
            <th className="text-right pb-1 font-normal">Run B</th>
            <th className="text-right pb-1 font-normal">Delta</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {allNodes.map((node) => {
            const a = costA[node] ?? 0;
            const b = costB[node] ?? 0;
            const delta = computeDelta(a, b, true);
            return (
              <tr key={node} className="text-slate-300">
                <td className="py-1 pr-2 truncate max-w-[120px]" title={node}>
                  {node}
                </td>
                <td className="py-1 text-right">{formatCost(a)}</td>
                <td className="py-1 text-right">{formatCost(b)}</td>
                <td className="py-1 text-right">
                  <DeltaBadge delta={delta} format={formatCost} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Models comparison ---

function ModelsComparison({
  modelsA,
  modelsB,
}: {
  modelsA: string[];
  modelsB: string[];
}) {
  const setA = new Set(modelsA);
  const setB = new Set(modelsB);
  const all = Array.from(new Set([...modelsA, ...modelsB]));

  if (all.length === 0) return null;

  return (
    <div>
      <p className="text-xs font-medium text-slate-300 mb-1">Models used</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-wrap gap-1">
          {modelsA.length === 0 ? (
            <span className="text-xs text-slate-500 italic">none</span>
          ) : (
            modelsA.map((m, i) => (
              <span
                key={i}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded border",
                  setB.has(m)
                    ? "border-slate-600 text-slate-300 bg-slate-800"
                    : "border-emerald-700 text-emerald-300 bg-emerald-900/40"
                )}
              >
                {m}
              </span>
            ))
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {modelsB.length === 0 ? (
            <span className="text-xs text-slate-500 italic">none</span>
          ) : (
            modelsB.map((m, i) => (
              <span
                key={i}
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded border",
                  setA.has(m)
                    ? "border-slate-600 text-slate-300 bg-slate-800"
                    : "border-red-700 text-red-300 bg-red-900/40"
                )}
              >
                {m}
              </span>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// --- Main component ---

export default function ComparisonView({ runIdA, runIdB, onClose }: ComparisonViewProps) {
  const [summaryA, setSummaryA] = useState<ExecutionSummary | null>(null);
  const [summaryB, setSummaryB] = useState<ExecutionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      apiGet<ExecutionSummary>(`/runs/${runIdA}/summary`),
      apiGet<ExecutionSummary>(`/runs/${runIdB}/summary`),
    ])
      .then(([a, b]) => {
        setSummaryA(a);
        setSummaryB(b);
      })
      .catch((err) => {
        setError(err?.message ?? "Failed to load run summaries");
      })
      .finally(() => setLoading(false));
  }, [runIdA, runIdB]);

  const truncateId = (id: string) =>
    id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;

  // --- Render states ---

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        <span className="text-sm">Loading comparison…</span>
      </div>
    );
  }

  if (error || !summaryA || !summaryB) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-400">
        <p className="text-sm text-red-400">{error ?? "Missing run data"}</p>
        <button
          onClick={onClose}
          className="text-xs underline text-slate-400 hover:text-slate-200"
        >
          Close
        </button>
      </div>
    );
  }

  // Deltas (all "lower is better" for cost/tokens/duration; counts are neutral)
  const tokenDelta = computeDelta(summaryA.total_tokens, summaryB.total_tokens, true);
  const costDelta = computeDelta(summaryA.total_cost_usd, summaryB.total_cost_usd, true);
  const durationDelta = computeDelta(summaryA.total_duration_ms, summaryB.total_duration_ms, true);
  const llmDelta = computeDelta(summaryA.total_llm_calls, summaryB.total_llm_calls, true);
  const toolDelta = computeDelta(summaryA.total_tool_calls, summaryB.total_tool_calls, true);
  const stepDelta = computeDelta(summaryA.step_count, summaryB.step_count, true);

  const metrics: {
    label: string;
    valA: string;
    valB: string;
    delta: Delta;
    format: (n: number) => string;
  }[] = [
    {
      label: "Total Tokens",
      valA: formatTokens(summaryA.total_tokens),
      valB: formatTokens(summaryB.total_tokens),
      delta: tokenDelta,
      format: formatTokens,
    },
    {
      label: "Total Cost",
      valA: formatCost(summaryA.total_cost_usd),
      valB: formatCost(summaryB.total_cost_usd),
      delta: costDelta,
      format: formatCost,
    },
    {
      label: "Duration",
      valA: formatDuration(summaryA.total_duration_ms),
      valB: formatDuration(summaryB.total_duration_ms),
      delta: durationDelta,
      format: formatDuration,
    },
    {
      label: "LLM Calls",
      valA: String(summaryA.total_llm_calls),
      valB: String(summaryB.total_llm_calls),
      delta: llmDelta,
      format: String,
    },
    {
      label: "Tool Calls",
      valA: String(summaryA.total_tool_calls),
      valB: String(summaryB.total_tool_calls),
      delta: toolDelta,
      format: String,
    },
    {
      label: "Steps",
      valA: String(summaryA.step_count),
      valB: String(summaryB.step_count),
      delta: stepDelta,
      format: String,
    },
  ];

  const hasCostByNode =
    summaryA.cost_by_node &&
    summaryB.cost_by_node &&
    (Object.keys(summaryA.cost_by_node).length > 0 ||
      Object.keys(summaryB.cost_by_node).length > 0);

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg overflow-hidden text-slate-200 text-sm">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700 bg-slate-800/60">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4 text-slate-400" />
          <span className="font-medium text-sm">Run Comparison</span>
          <span className="text-xs text-slate-400">
            <span className="text-slate-300">{truncateId(runIdA)}</span>
            <span className="mx-1 text-slate-500">vs</span>
            <span className="text-slate-300">{truncateId(runIdB)}</span>
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
          aria-label="Close comparison"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-5">
        {/* Run A / Run B column headers */}
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center">
          <div />
          <div className="text-xs font-semibold text-slate-300 text-right min-w-[64px]">
            Run A
            <span className="block text-slate-500 font-normal">{truncateId(runIdA)}</span>
          </div>
          <div className="text-xs font-semibold text-slate-300 text-right min-w-[64px]">
            Run B
            <span className="block text-slate-500 font-normal">{truncateId(runIdB)}</span>
          </div>
          <div className="text-xs font-semibold text-slate-400 text-right min-w-[96px]">
            Delta (B vs A)
          </div>
        </div>

        {/* Metrics table */}
        <div className="space-y-0 divide-y divide-slate-800">
          {metrics.map(({ label, valA, valB, delta, format }) => (
            <div
              key={label}
              className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 items-center py-1.5"
            >
              <span className="text-xs text-slate-400">{label}</span>
              <span className="text-xs text-slate-200 text-right min-w-[64px]">{valA}</span>
              <span className="text-xs text-slate-200 text-right min-w-[64px]">{valB}</span>
              <div className="text-right min-w-[96px]">
                <DeltaBadge delta={delta} format={format} />
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="border-t border-slate-800" />

        {/* Path comparison */}
        <div>
          <p className="text-xs font-medium text-slate-300 mb-2">Execution path</p>
          <PathDiff
            pathA={summaryA.path_taken ?? []}
            pathB={summaryB.path_taken ?? []}
          />
        </div>

        {/* Models comparison */}
        <ModelsComparison
          modelsA={summaryA.models_used ?? []}
          modelsB={summaryB.models_used ?? []}
        />

        {/* Per-node cost */}
        {hasCostByNode && (
          <NodeCostTable
            costA={summaryA.cost_by_node}
            costB={summaryB.cost_by_node}
          />
        )}

        {/* Status note */}
        <div className="flex items-center gap-3 text-xs text-slate-500 pt-1">
          <span>
            Status A:{" "}
            <span
              className={cn(
                "font-medium",
                summaryA.status === "completed" ? "text-emerald-400" : "text-red-400"
              )}
            >
              {summaryA.status}
            </span>
          </span>
          <span>
            Status B:{" "}
            <span
              className={cn(
                "font-medium",
                summaryB.status === "completed" ? "text-emerald-400" : "text-red-400"
              )}
            >
              {summaryB.status}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
