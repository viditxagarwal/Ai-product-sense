"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, GitCompare, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import ConfigSection from "./ConfigSection";
import GuardrailReorder from "./GuardrailReorder";
import ConfigCompare from "./ConfigCompare";
import { CONFIG_DEFAULTS, GUARDRAIL_LABELS } from "./configDefaults";
import { FormSkeleton } from "@/components/ui/skeletons";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { useConfigStore } from "@/stores/config-store";

interface ConfigDetailProps {
  configId: string;
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (Array.isArray(val)) return val.map((v) => GUARDRAIL_LABELS[v] || String(v).replace(/_/g, " ")).join(", ");
  if (typeof val === "boolean") return val ? "Yes" : "No";
  if (typeof val === "number") return String(val);
  return String(val).replace(/_/g, " ");
}

function labelFromKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function isModified(key: string, value: unknown): boolean {
  const def = CONFIG_DEFAULTS[key];
  if (def === undefined) return false;
  if (Array.isArray(def) && Array.isArray(value)) {
    return JSON.stringify(def) !== JSON.stringify(value);
  }
  return def !== value;
}

function ReadOnlyField({
  label,
  fieldKey,
  value,
}: {
  label: string;
  fieldKey: string;
  value: unknown;
}) {
  const modified = isModified(fieldKey, value);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Label className="text-[11px] text-slate-500">{label}</Label>
        {modified && (
          <Badge className="bg-amber-50 px-1 text-[8px] text-amber-700 hover:bg-amber-50">
            modified
          </Badge>
        )}
      </div>
      <p className="text-sm font-medium">{formatValue(value)}</p>
    </div>
  );
}

const SECTION_FIELDS: { title: string; description: string; fields: string[] }[] = [
  {
    title: "Properties",
    description: "Name, description, and metadata",
    fields: ["config_name", "config_description", "config_version", "tags", "prompt_version_id", "is_baseline", "created_from"],
  },
  {
    title: "Model Settings",
    description: "Primary model, fallback, temperature",
    fields: ["primary_model", "fallback_model", "per_node_model_override", "model_selection_strategy", "temperature", "max_output_tokens", "top_p"],
  },
  {
    title: "Memory & Context",
    description: "Memory buffer, summarization, context",
    fields: ["memory_type", "buffer_size_messages", "buffer_size_tokens", "summary_model", "summary_trigger", "cross_thread_memory", "context_source", "file_context_strategy", "max_context_tokens", "context_priority_order", "persistent_knowledge"],
  },
  {
    title: "RAG Settings",
    description: "Knowledge retrieval and chunking",
    fields: ["kb_enabled", "chunk_strategy", "chunk_size_tokens", "chunk_overlap_tokens", "embedding_model", "retrieval_strategy", "top_k_results", "reranking", "rerank_top_n", "kb_freshness_preference"],
  },
  {
    title: "Output & Streaming",
    description: "Streaming mode, formatting, citations",
    fields: ["streaming_mode", "explanation_depth", "confidence_display", "output_format", "citation_format", "max_output_length", "chain_of_thought_visibility"],
  },
  {
    title: "Routing & Control Flow",
    description: "Routing strategy, loop settings",
    fields: ["routing_strategy", "routing_model", "routing_fallback", "route_confidence_threshold", "loop_max_count", "loop_exit_condition", "loop_exit_threshold", "condition_evaluation_method"],
  },
  {
    title: "Cost & Performance",
    description: "Budget limits and caching",
    fields: ["max_cost_per_run_usd", "max_total_tokens", "max_latency_seconds", "caching", "cache_ttl_hours"],
  },
  {
    title: "Tool Behavior",
    description: "Tool selection and retry behavior",
    fields: ["tool_selection_strategy", "tool_call_timeout", "tool_retry_on_failure", "tool_result_handling", "max_tool_calls_per_node", "parallel_tool_calls"],
  },
  {
    title: "Guardrail Ordering & Trigger",
    description: "Priority order and trigger behavior",
    fields: ["guardrail_priority_order", "guardrail_trigger_action", "max_guardrail_retries", "hallucination_detection", "numerical_validation", "source_grounding_level", "contradictory_data_handling", "uncertainty_handling", "confidence_threshold"],
  },
  {
    title: "Persona & Prompt Parameters",
    description: "Risk tolerance, detail level, style",
    fields: ["risk_tolerance", "detail_level", "language_formality", "disclaimer_inclusion", "few_shot_examples", "few_shot_count", "output_template"],
  },
  {
    title: "Missing Information Strategy",
    description: "How gaps in data are handled",
    fields: ["missing_info_strategy", "missing_info_autonomy", "external_data_freshness", "assumption_source_priority"],
  },
];

export default function ConfigDetail({ configId }: ConfigDetailProps) {
  const router = useRouter();
  const { currentConfig, configs, fetchConfig, fetchConfigs, loading } =
    useConfigStore();

  const [compareOpen, setCompareOpen] = useState(false);
  const [compareLeftId, setCompareLeftId] = useState("");
  const [compareRightId, setCompareRightId] = useState("");

  useEffect(() => {
    fetchConfig(configId);
    fetchConfigs();
  }, [configId, fetchConfig, fetchConfigs]);

  if (loading || !currentConfig) {
    return <FormSkeleton sections={5} />;
  }

  const cfg = currentConfig as unknown as Record<string, unknown>;

  const handleDuplicate = () => {
    router.push(`/configurations/new?from=${configId}`);
  };

  const handleCompare = () => {
    if (configs.length >= 2) {
      setCompareLeftId(configId);
      const other = configs.find((c) => c.id !== configId);
      setCompareRightId(other?.id || configId);
      setCompareOpen(true);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-12">
      {/* Immutable banner */}
      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-5 py-3">
        <Lock className="size-4 shrink-0 text-amber-600" />
        <p className="text-xs text-amber-800">
          This configuration is locked. To change settings, duplicate and create
          a new version.
        </p>
      </div>

      {/* Header */}
      <div>
        <Breadcrumbs
          items={[
            { label: "Configurations", href: "/configurations" },
            { label: `${currentConfig.config_name} v${currentConfig.config_version}` },
          ]}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/configurations")}
          className="mb-3"
        >
          <ArrowLeft className="mr-1 size-4" />
          Back to Configurations
        </Button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">
              {currentConfig.config_name}
            </h1>
            <Badge variant="secondary">v{currentConfig.config_version}</Badge>
            {currentConfig.is_baseline && (
              <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50">
                Baseline
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCompare} disabled={configs.length < 2}>
              <GitCompare className="mr-1 size-4" />
              Compare
            </Button>
            <Button size="sm" onClick={handleDuplicate}>
              <Copy className="mr-1 size-4" />
              Duplicate
            </Button>
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Created {new Date(currentConfig.created_at).toLocaleDateString()}
          {currentConfig.config_description &&
            ` · ${currentConfig.config_description}`}
        </p>
        {currentConfig.tags.length > 0 && (
          <div className="mt-2 flex gap-1">
            {currentConfig.tags.map((t) => (
              <Badge key={t} variant="secondary" className="text-[10px]">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Sections */}
      {SECTION_FIELDS.map((section) => (
        <ConfigSection
          key={section.title}
          title={section.title}
          description={section.description}
        >
          {section.title === "Guardrail Ordering & Trigger" && (
            <div className="mb-4">
              <Label className="text-xs font-semibold">Priority Order</Label>
              <div className="mt-2">
                <GuardrailReorder
                  items={
                    (cfg.guardrail_priority_order as string[]) ||
                    (CONFIG_DEFAULTS.guardrail_priority_order as string[])
                  }
                  onChange={() => {}}
                  readOnly
                />
              </div>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {section.fields
              .filter((f) => f !== "guardrail_priority_order")
              .map((fieldKey) => (
                <ReadOnlyField
                  key={fieldKey}
                  label={labelFromKey(fieldKey)}
                  fieldKey={fieldKey}
                  value={cfg[fieldKey]}
                />
              ))}
          </div>
        </ConfigSection>
      ))}

      {/* Compare modal */}
      {configs.length >= 2 && (
        <ConfigCompare
          open={compareOpen}
          onOpenChange={setCompareOpen}
          configs={configs}
          leftId={compareLeftId}
          rightId={compareRightId}
          onLeftChange={setCompareLeftId}
          onRightChange={setCompareRightId}
        />
      )}
    </div>
  );
}
