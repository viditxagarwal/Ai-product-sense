"use client";

import { Settings } from "lucide-react";
import { useExecutionStore } from "@/stores/execution-store";
import { cn } from "@/lib/utils";
import type { DisplaySettings } from "@/types";

interface ToggleItemProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}

function ToggleItem({ label, description, checked, onChange }: ToggleItemProps) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-slate-800 leading-tight">{label}</p>
        <p className="text-xs text-slate-500 leading-tight mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={cn(
          "relative flex-shrink-0 mt-0.5 w-8 h-4 rounded-full transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
          checked ? "bg-blue-500" : "bg-slate-200"
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform duration-150",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

function Section({ title, children }: SectionProps) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1 px-1">
        {title}
      </p>
      <div className="divide-y divide-slate-100 px-1">{children}</div>
    </div>
  );
}

const INSPECTOR_SETTINGS: { key: keyof DisplaySettings; label: string; description: string }[] = [
  { key: "show_inner_llm_calls", label: "Inner LLM Calls", description: "Show sub-agent and chained LLM invocations" },
  { key: "show_tool_call_details", label: "Tool Call Details", description: "Show tool inputs, outputs, and metadata" },
  { key: "show_thinking", label: "Thinking", description: "Show model reasoning / chain-of-thought" },
  { key: "show_system_prompts", label: "System Prompts", description: "Show the injected system prompt in each step" },
  { key: "show_raw_messages", label: "Raw Messages", description: "Show unformatted message payloads" },
  { key: "show_token_counts", label: "Token Counts", description: "Show prompt and completion token counts per step" },
  { key: "show_costs", label: "Costs", description: "Show estimated dollar cost per step" },
  { key: "show_edge_evaluations", label: "Edge Evaluations", description: "Show routing decisions and edge conditions" },
  { key: "show_mapping_details", label: "Mapping Details", description: "Show input/output mapping transformations" },
];

const STREAMING_SETTINGS: { key: keyof DisplaySettings; label: string; description: string }[] = [
  { key: "stream_text", label: "Stream Text", description: "Stream assistant text tokens as they arrive" },
  { key: "stream_thinking", label: "Stream Thinking", description: "Stream thinking tokens in real-time" },
  { key: "show_live_tool_cards", label: "Live Tool Cards", description: "Show inline tool-call cards while streaming" },
  { key: "show_progress_bar", label: "Progress Bar", description: "Show a step progress bar during execution" },
  { key: "show_activity_log", label: "Activity Log", description: "Show a running log of all execution events" },
];

const ANALYTICS_SETTINGS: { key: keyof DisplaySettings; label: string; description: string }[] = [
  { key: "show_cost_breakdown", label: "Cost Breakdown", description: "Show per-node cost breakdown in Analytics tab" },
  { key: "show_token_heatmap", label: "Token Heatmap", description: "Visualize token usage across workflow nodes" },
  { key: "show_latency_waterfall", label: "Latency Waterfall", description: "Show a waterfall chart of step durations" },
  { key: "enable_comparison_view", label: "Comparison View", description: "Enable side-by-side run comparison mode" },
];

export function DisplaySettingsPanel() {
  const { displaySettings, updateDisplaySettings } = useExecutionStore();

  if (!displaySettings) {
    return (
      <div className="p-3 text-xs text-slate-400">Loading settings...</div>
    );
  }

  const toggle = (key: keyof DisplaySettings) => {
    updateDisplaySettings({ [key]: !displaySettings[key] });
  };

  return (
    <div className="flex flex-col gap-4 p-3 bg-white border border-slate-200 rounded-lg shadow-sm w-72">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Settings className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
        <span className="text-xs font-semibold text-slate-700">Display Settings</span>
      </div>

      {/* Inspector */}
      <Section title="Inspector">
        {INSPECTOR_SETTINGS.map(({ key, label, description }) => (
          <ToggleItem
            key={key}
            label={label}
            description={description}
            checked={displaySettings[key] as boolean}
            onChange={() => toggle(key)}
          />
        ))}
      </Section>

      {/* Streaming */}
      <Section title="Streaming">
        {STREAMING_SETTINGS.map(({ key, label, description }) => (
          <ToggleItem
            key={key}
            label={label}
            description={description}
            checked={displaySettings[key] as boolean}
            onChange={() => toggle(key)}
          />
        ))}
      </Section>

      {/* Analytics */}
      <Section title="Analytics">
        {ANALYTICS_SETTINGS.map(({ key, label, description }) => (
          <ToggleItem
            key={key}
            label={label}
            description={description}
            checked={displaySettings[key] as boolean}
            onChange={() => toggle(key)}
          />
        ))}
      </Section>
    </div>
  );
}
