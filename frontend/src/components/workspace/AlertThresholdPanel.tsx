"use client";

import { useEffect, useState } from "react";
import { Trash2, Plus, Bell } from "lucide-react";
import { useExecutionStore, AlertThreshold } from "@/stores/execution-store";

const METRICS = [
  { value: "total_cost_usd", label: "Total Cost (USD)" },
  { value: "total_tokens", label: "Total Tokens" },
  { value: "total_duration_ms", label: "Duration (ms)" },
  { value: "step_count", label: "Step Count" },
];

const OPERATORS = [
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
];

const ACTIONS = [
  { value: "log", label: "Log" },
  { value: "notify", label: "Notify" },
  { value: "block", label: "Block" },
];

export default function AlertThresholdPanel() {
  const {
    alertThresholds,
    fetchAlertThresholds,
    createAlertThreshold,
    deleteAlertThreshold,
  } = useExecutionStore();

  const [metric, setMetric] = useState("total_cost_usd");
  const [operator, setOperator] = useState<AlertThreshold["operator"]>("gt");
  const [value, setValue] = useState("");
  const [action, setAction] = useState<AlertThreshold["action"]>("log");

  useEffect(() => {
    fetchAlertThresholds();
  }, [fetchAlertThresholds]);

  const handleAdd = () => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    createAlertThreshold({ metric, operator, value: num, action });
    setValue("");
  };

  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        <Bell className="size-3" />
        Alert Thresholds
      </div>

      {/* Existing thresholds */}
      {alertThresholds.length > 0 && (
        <div className="space-y-1">
          {alertThresholds.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-2 rounded border px-2 py-1 text-xs"
            >
              <span className="font-medium text-slate-700">
                {METRICS.find((m) => m.value === t.metric)?.label ?? t.metric}
              </span>
              <span className="text-slate-400">
                {OPERATORS.find((o) => o.value === t.operator)?.label ?? t.operator}
              </span>
              <span className="font-mono text-slate-600">{t.value}</span>
              <span className={`rounded px-1 text-[9px] font-medium ${
                t.action === "block" ? "bg-red-50 text-red-600" :
                t.action === "notify" ? "bg-amber-50 text-amber-600" :
                "bg-slate-50 text-slate-500"
              }`}>
                {t.action}
              </span>
              <div className="flex-1" />
              <button
                onClick={() => deleteAlertThreshold(t.id)}
                className="text-slate-300 hover:text-red-500"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add new threshold */}
      <div className="flex items-end gap-1.5">
        <div className="flex-1">
          <label className="text-[9px] text-slate-400">Metric</label>
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="w-full rounded border px-1.5 py-1 text-xs"
          >
            {METRICS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="w-14">
          <label className="text-[9px] text-slate-400">Op</label>
          <select
            value={operator}
            onChange={(e) => setOperator(e.target.value as AlertThreshold["operator"])}
            className="w-full rounded border px-1 py-1 text-xs"
          >
            {OPERATORS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="w-20">
          <label className="text-[9px] text-slate-400">Value</label>
          <input
            type="number"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0"
            className="w-full rounded border px-1.5 py-1 text-xs"
          />
        </div>
        <div className="w-16">
          <label className="text-[9px] text-slate-400">Action</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value as AlertThreshold["action"])}
            className="w-full rounded border px-1 py-1 text-xs"
          >
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleAdd}
          className="rounded bg-slate-700 px-2 py-1 text-xs text-white hover:bg-slate-800"
        >
          <Plus className="size-3" />
        </button>
      </div>
    </div>
  );
}
