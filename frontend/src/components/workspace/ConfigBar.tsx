"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Cpu, Shield, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ConfigurationResponse } from "@/types";

interface ConfigBarProps {
  configurationId: string;
}

const SECTIONS: { label: string; keys: { key: keyof ConfigurationResponse; label: string }[] }[] = [
  {
    label: "Model Settings",
    keys: [
      { key: "primary_model", label: "Primary Model" },
      { key: "fallback_model", label: "Fallback Model" },
      { key: "temperature", label: "Temperature" },
      { key: "max_output_tokens", label: "Max Output Tokens" },
      { key: "top_p", label: "Top P" },
      { key: "model_selection_strategy", label: "Selection Strategy" },
    ],
  },
  {
    label: "Memory & Context",
    keys: [
      { key: "memory_type", label: "Memory Type" },
      { key: "buffer_size_messages", label: "Buffer Messages" },
      { key: "buffer_size_tokens", label: "Buffer Tokens" },
      { key: "cross_thread_memory", label: "Cross-Thread" },
      { key: "max_context_tokens", label: "Max Context Tokens" },
    ],
  },
  {
    label: "RAG Settings",
    keys: [
      { key: "kb_enabled", label: "KB Enabled" },
      { key: "chunk_strategy", label: "Chunk Strategy" },
      { key: "chunk_size_tokens", label: "Chunk Size" },
      { key: "embedding_model", label: "Embedding Model" },
      { key: "retrieval_strategy", label: "Retrieval Strategy" },
      { key: "top_k_results", label: "Top K" },
    ],
  },
  {
    label: "Output & Streaming",
    keys: [
      { key: "streaming_mode", label: "Streaming" },
      { key: "explanation_depth", label: "Explanation Depth" },
      { key: "output_format", label: "Output Format" },
      { key: "citation_format", label: "Citation Format" },
    ],
  },
  {
    label: "Routing & Control Flow",
    keys: [
      { key: "routing_strategy", label: "Routing Strategy" },
      { key: "loop_max_count", label: "Max Loops" },
      { key: "loop_exit_condition", label: "Loop Exit" },
    ],
  },
  {
    label: "Cost & Performance",
    keys: [
      { key: "max_cost_per_run_usd", label: "Max Cost/Run ($)" },
      { key: "max_total_tokens", label: "Max Tokens" },
      { key: "max_latency_seconds", label: "Max Latency (s)" },
      { key: "caching", label: "Caching" },
    ],
  },
  {
    label: "Tool Behavior",
    keys: [
      { key: "tool_selection_strategy", label: "Selection Strategy" },
      { key: "tool_call_timeout", label: "Timeout (s)" },
      { key: "tool_retry_on_failure", label: "Retries" },
      { key: "parallel_tool_calls", label: "Parallel Calls" },
    ],
  },
  {
    label: "Guardrails",
    keys: [
      { key: "guardrail_trigger_action", label: "Trigger Action" },
      { key: "hallucination_detection", label: "Hallucination Detection" },
      { key: "numerical_validation", label: "Numerical Validation" },
      { key: "uncertainty_handling", label: "Uncertainty Handling" },
    ],
  },
  {
    label: "Persona & Prompt",
    keys: [
      { key: "risk_tolerance", label: "Risk Tolerance" },
      { key: "detail_level", label: "Detail Level" },
      { key: "language_formality", label: "Formality" },
      { key: "few_shot_examples", label: "Few-Shot" },
    ],
  },
  {
    label: "Missing Information",
    keys: [
      { key: "missing_info_strategy", label: "Strategy" },
      { key: "missing_info_autonomy", label: "Autonomy" },
      { key: "external_data_freshness", label: "Data Freshness" },
    ],
  },
];

export default function ConfigBar({ configurationId }: ConfigBarProps) {
  const [config, setConfig] = useState<ConfigurationResponse | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    apiGet<ConfigurationResponse>(`/configurations/${configurationId}`)
      .then(setConfig)
      .catch(() => {});
  }, [configurationId]);

  if (!config) {
    return (
      <div className="border-b bg-slate-50 px-4 py-2">
        <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
      </div>
    );
  }

  return (
    <div className="border-b bg-slate-50">
      {/* Collapsed bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-slate-100"
      >
        <Cpu className="size-3.5 text-slate-400" />
        <span className="text-sm font-medium text-slate-700">
          {config.config_name}
        </span>
        <Badge variant="secondary" className="text-[10px]">
          {config.primary_model}
        </Badge>
        {config.kb_enabled && (
          <Badge variant="secondary" className="text-[10px]">
            <BookOpen className="mr-0.5 size-2.5" />
            RAG
          </Badge>
        )}
        <Badge variant="secondary" className="text-[10px]">
          <Shield className="mr-0.5 size-2.5" />
          {config.risk_tolerance}
        </Badge>
        <div className="flex-1" />
        {expanded ? (
          <ChevronUp className="size-4 text-slate-400" />
        ) : (
          <ChevronDown className="size-4 text-slate-400" />
        )}
      </button>

      {/* Expanded grid */}
      {expanded && (
        <div className="max-h-80 overflow-y-auto border-t px-4 py-3">
          <div className="space-y-3">
            {SECTIONS.map((section) => (
              <div key={section.label}>
                <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {section.label}
                </h4>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 sm:grid-cols-3">
                  {section.keys.map(({ key, label }) => (
                    <div key={key} className="flex items-baseline gap-1 text-xs">
                      <span className="text-slate-400">{label}:</span>
                      <span className="font-medium text-slate-700">
                        {formatValue(config[key])}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (Array.isArray(val)) return val.length ? val.join(", ") : "—";
  return String(val);
}
