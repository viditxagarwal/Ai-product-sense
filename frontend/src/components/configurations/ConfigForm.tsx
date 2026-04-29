"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import ModelSelect from "@/components/shared/ModelSelect";
import ConfigSection from "./ConfigSection";
import GuardrailReorder from "./GuardrailReorder";
import { CONFIG_DEFAULTS } from "./configDefaults";
import { useConfigStore } from "@/stores/config-store";
import { usePromptStore } from "@/stores/prompt-store";
import { useAvailableModels } from "@/hooks/useAvailableModels";
import { apiGet } from "@/lib/api";
import type { ConfigurationResponse } from "@/types";

// Tracks which fields user has changed
type FormData = Record<string, unknown>;

function isModified(key: string, value: unknown): boolean {
  const def = CONFIG_DEFAULTS[key];
  if (Array.isArray(def) && Array.isArray(value)) {
    return JSON.stringify(def) !== JSON.stringify(value);
  }
  return def !== value;
}

interface FieldProps {
  label: string;
  fieldKey: string;
  form: FormData;
  onChange: (key: string, val: unknown) => void;
  children: React.ReactNode;
  description?: string;
}

function Field({ label, fieldKey, form, children, description }: FieldProps) {
  const modified = isModified(fieldKey, form[fieldKey]);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label className="text-xs">{label}</Label>
        {modified && (
          <Badge className="bg-amber-50 px-1.5 text-[9px] text-amber-700 hover:bg-amber-50">
            modified
          </Badge>
        )}
      </div>
      {description && (
        <p className="text-[10px] text-muted-foreground">{description}</p>
      )}
      {children}
    </div>
  );
}

function SelectField({
  label,
  fieldKey,
  options,
  form,
  onChange,
  description,
}: {
  label: string;
  fieldKey: string;
  options: { value: string; label: string }[];
  form: FormData;
  onChange: (key: string, val: unknown) => void;
  description?: string;
}) {
  return (
    <Field label={label} fieldKey={fieldKey} form={form} onChange={onChange} description={description}>
      <Select
        value={String(form[fieldKey] ?? "")}
        onValueChange={(v) => onChange(fieldKey, v)}
      >
        <SelectTrigger className="h-9 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function NumberField({
  label,
  fieldKey,
  form,
  onChange,
  min,
  max,
  step,
  prefix,
  description,
}: {
  label: string;
  fieldKey: string;
  form: FormData;
  onChange: (key: string, val: unknown) => void;
  min?: number;
  max?: number;
  step?: number;
  prefix?: string;
  description?: string;
}) {
  return (
    <Field label={label} fieldKey={fieldKey} form={form} onChange={onChange} description={description}>
      <div className="flex items-center gap-1">
        {prefix && <span className="text-xs text-slate-500">{prefix}</span>}
        <Input
          type="number"
          className="h-9 text-xs"
          value={Number(form[fieldKey] ?? 0)}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            const v = step && step < 1 ? parseFloat(e.target.value) : parseInt(e.target.value, 10);
            onChange(fieldKey, isNaN(v) ? 0 : v);
          }}
        />
      </div>
    </Field>
  );
}

function SliderField({
  label,
  fieldKey,
  form,
  onChange,
  min,
  max,
  step,
  description,
}: {
  label: string;
  fieldKey: string;
  form: FormData;
  onChange: (key: string, val: unknown) => void;
  min: number;
  max: number;
  step: number;
  description?: string;
}) {
  const val = Number(form[fieldKey] ?? min);
  return (
    <Field label={`${label}: ${val}`} fieldKey={fieldKey} form={form} onChange={onChange} description={description}>
      <input
        type="range"
        className="w-full accent-slate-800"
        min={min}
        max={max}
        step={step}
        value={val}
        onChange={(e) => onChange(fieldKey, parseFloat(e.target.value))}
      />
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{min}</span>
        <span>{max}</span>
      </div>
    </Field>
  );
}

function ToggleField({
  label,
  fieldKey,
  form,
  onChange,
  description,
}: {
  label: string;
  fieldKey: string;
  form: FormData;
  onChange: (key: string, val: unknown) => void;
  description?: string;
}) {
  const modified = isModified(fieldKey, form[fieldKey]);
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{label}</span>
          {modified && (
            <Badge className="bg-amber-50 px-1.5 text-[9px] text-amber-700 hover:bg-amber-50">
              modified
            </Badge>
          )}
        </div>
        {description && (
          <p className="text-[10px] text-muted-foreground">{description}</p>
        )}
      </div>
      <Switch
        checked={Boolean(form[fieldKey])}
        onCheckedChange={(v) => onChange(fieldKey, v)}
      />
    </div>
  );
}

// Options maps
const opts = (vals: string[]) => vals.map((v) => ({ value: v, label: v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) }));

export default function ConfigForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { createConfig } = useConfigStore();
  const { prompts, fetchPrompts } = usePromptStore();
  const { providers } = useAvailableModels();

  const [form, setForm] = useState<FormData>({ ...CONFIG_DEFAULTS });
  const [creating, setCreating] = useState(false);

  // Load prompts for dropdown
  useEffect(() => {
    fetchPrompts();
  }, [fetchPrompts]);

  // Pre-fill from duplicated config
  useEffect(() => {
    const fromId = searchParams.get("from");
    if (fromId) {
      apiGet<ConfigurationResponse>(`/configurations/${fromId}`).then((cfg) => {
        const rest = Object.fromEntries(
          Object.entries(cfg).filter(
            ([k]) => !["id", "user_id", "created_at"].includes(k)
          )
        );
        setForm({
          ...rest,
          config_name: `Copy of ${cfg.config_name}`,
          created_from: cfg.id,
          is_baseline: false,
        });
      });
    }
  }, [searchParams]);

  const update = (key: string, value: unknown) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async () => {
    if (!(form.config_name as string)?.trim()) return;
    setCreating(true);
    try {
      const cfg = await createConfig(form);
      router.push(`/configurations/${cfg.id}`);
    } finally {
      setCreating(false);
    }
  };

  const kbEnabled = Boolean(form.kb_enabled);

  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-12">
      <div>
        <Breadcrumbs
          items={[
            { label: "Configurations", href: "/configurations" },
            { label: "New Configuration" },
          ]}
        />
        <h1 className="text-2xl font-bold tracking-tight">
          New Configuration
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure all behavioral settings. Once created, this configuration
          is immutable.
        </p>
      </div>

      {/* Section 1: Properties */}
      <ConfigSection title="Properties" description="Name, description, tags, and prompt selection">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Configuration Name *" fieldKey="config_name" form={form} onChange={update}>
            <Input
              className="h-9 text-xs"
              value={String(form.config_name ?? "")}
              onChange={(e) => update("config_name", e.target.value)}
              placeholder="e.g., Conservative Financial v1"
            />
          </Field>

          <SelectField
            label="Prompt Version"
            fieldKey="prompt_version_id"
            form={{ ...form, prompt_version_id: form.prompt_version_id || "none" }}
            onChange={(k, v) => update(k, v === "none" ? null : v)}
            options={[
              { value: "none", label: "None" },
              ...prompts.map((p) => ({
                value: p.id,
                label: `${p.prompt_name} v${p.version_number}`,
              })),
            ]}
          />
        </div>

        <div className="mt-4">
          <Field label="Description" fieldKey="config_description" form={form} onChange={update}>
            <Textarea
              className="text-xs"
              value={String(form.config_description ?? "")}
              onChange={(e) => update("config_description", e.target.value)}
              rows={2}
              placeholder="What is this configuration for?"
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="Tags" fieldKey="tags" form={form} onChange={update} description="Comma-separated">
            <Input
              className="h-9 text-xs"
              value={Array.isArray(form.tags) ? (form.tags as string[]).join(", ") : ""}
              onChange={(e) =>
                update(
                  "tags",
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                )
              }
              placeholder="production, financial, conservative"
            />
          </Field>
        </div>

        <div className="mt-4">
          <ToggleField label="Baseline Configuration" fieldKey="is_baseline" form={form} onChange={update} description="Mark as the baseline for A/B comparisons" />
        </div>
      </ConfigSection>

      {/* Section 2: Model Settings */}
      <ConfigSection title="Model Settings" description="Primary model, fallback, temperature, and token limits">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Primary Model" fieldKey="primary_model" form={form} onChange={update}>
            <ModelSelect
              value={String(form.primary_model ?? "")}
              onValueChange={(v) => update("primary_model", v)}
              providers={providers}
              showTooltip
            />
          </Field>
          <Field label="Fallback Model" fieldKey="fallback_model" form={form} onChange={update}>
            <ModelSelect
              value={String(form.fallback_model ?? "")}
              onValueChange={(v) => update("fallback_model", v)}
              providers={providers}
              allowNone
              noneLabel="None"
            />
          </Field>
          <SelectField label="Model Selection Strategy" fieldKey="model_selection_strategy" form={form} onChange={update} options={opts(["fixed", "cost_optimized", "quality_optimized", "adaptive"])} />
          <NumberField label="Max Output Tokens" fieldKey="max_output_tokens" form={form} onChange={update} min={256} max={32768} step={256} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <SliderField label="Temperature" fieldKey="temperature" form={form} onChange={update} min={0} max={2} step={0.1} />
          <SliderField label="Top P" fieldKey="top_p" form={form} onChange={update} min={0.1} max={1.0} step={0.05} />
        </div>
        <div className="mt-4">
          <ToggleField label="Per-Node Model Override" fieldKey="per_node_model_override" form={form} onChange={update} description="Allow individual workflow nodes to use different models" />
        </div>
      </ConfigSection>

      {/* Section 3: Memory & Context */}
      <ConfigSection title="Memory & Context" description="Memory buffer, summarization, and context window settings">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Memory Type" fieldKey="memory_type" form={form} onChange={update} options={opts(["buffer", "buffer_window", "summary", "token_buffer", "vector_store", "combined"])} />
          <NumberField label="Buffer Size (Messages)" fieldKey="buffer_size_messages" form={form} onChange={update} min={1} max={100} />
          <NumberField label="Buffer Size (Tokens)" fieldKey="buffer_size_tokens" form={form} onChange={update} min={1024} max={32768} step={1024} />
          <NumberField label="Max Context Tokens" fieldKey="max_context_tokens" form={form} onChange={update} min={1024} max={128000} step={1024} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <SelectField label="Summary Model" fieldKey="summary_model" form={form} onChange={update} options={opts(["same_as_primary", "lighter_model"])} />
          <SelectField label="Summary Trigger" fieldKey="summary_trigger" form={form} onChange={update} options={opts(["every_N_messages", "token_threshold", "manual"])} />
          <SelectField label="Cross-Thread Memory" fieldKey="cross_thread_memory" form={form} onChange={update} options={opts(["disabled", "same_domain_only", "user_profile_only", "full_cross_thread"])} />
          <SelectField label="Context Source" fieldKey="context_source" form={form} onChange={update} options={opts(["system_prompt_only", "file_context", "rag", "structured_extraction", "combined"])} />
          <SelectField label="File Context Strategy" fieldKey="file_context_strategy" form={form} onChange={update} options={opts(["full_file", "relevant_sections", "chunked_retrieval", "metadata_only"])} />
          <SelectField label="Persistent Knowledge" fieldKey="persistent_knowledge" form={form} onChange={update} options={opts(["disabled", "knowledge_base_only", "user_profile", "both"])} />
        </div>
        <div className="mt-4">
          <Field label="Context Priority Order" fieldKey="context_priority_order" form={form} onChange={update}>
            <Input className="h-9 text-xs" value={String(form.context_priority_order ?? "")} onChange={(e) => update("context_priority_order", e.target.value)} />
          </Field>
        </div>
      </ConfigSection>

      {/* Section 4: RAG Settings */}
      <ConfigSection title="RAG Settings" description="Knowledge retrieval, chunking, and reranking">
        <ToggleField label="Knowledge Base Enabled" fieldKey="kb_enabled" form={form} onChange={update} />
        <div className={`mt-4 grid gap-4 sm:grid-cols-2 ${!kbEnabled ? "pointer-events-none opacity-40" : ""}`}>
          <SelectField label="Chunk Strategy" fieldKey="chunk_strategy" form={form} onChange={update} options={opts(["fixed_size", "semantic", "recursive", "structural", "sentence", "paragraph", "page"])} />
          <NumberField label="Chunk Size (Tokens)" fieldKey="chunk_size_tokens" form={form} onChange={update} min={64} max={4096} step={64} />
          <NumberField label="Chunk Overlap (Tokens)" fieldKey="chunk_overlap_tokens" form={form} onChange={update} min={0} max={512} step={16} />
          <Field label="Embedding Model" fieldKey="embedding_model" form={form} onChange={update}>
            <Input className="h-9 text-xs" value={String(form.embedding_model ?? "")} onChange={(e) => update("embedding_model", e.target.value)} />
          </Field>
          <SelectField label="Retrieval Strategy" fieldKey="retrieval_strategy" form={form} onChange={update} options={opts(["vector_similarity", "keyword_bm25", "hybrid_rrf", "multi_query", "contextual_compression", "parent_document", "self_query"])} />
          <NumberField label="Top K Results" fieldKey="top_k_results" form={form} onChange={update} min={1} max={20} />
          <SelectField label="Reranking" fieldKey="reranking" form={form} onChange={update} options={opts(["none", "cross_encoder", "llm_rerank", "cohere_rerank"])} />
          <NumberField label="Rerank Top N" fieldKey="rerank_top_n" form={form} onChange={update} min={1} max={20} />
          <SelectField label="Freshness Preference" fieldKey="kb_freshness_preference" form={form} onChange={update} options={opts(["prefer_recent", "prefer_authoritative", "no_preference"])} />
        </div>
      </ConfigSection>

      {/* Section 5: Output & Streaming */}
      <ConfigSection title="Output & Streaming" description="Streaming mode, explanation depth, and output formatting">
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Streaming Mode" fieldKey="streaming_mode" form={form} onChange={update} options={[
            { value: "token_by_token", label: "Token-by-Token (ChatGPT-style)" },
            { value: "chunk_by_section", label: "Chunk-by-Section (blocks appear)" },
            { value: "structured_blocks", label: "Structured Blocks" },
            { value: "complete_then_render", label: "Complete Then Render" },
          ]} />
          <SelectField label="Explanation Depth" fieldKey="explanation_depth" form={form} onChange={update} options={opts(["result_only", "brief_rationale", "full_reasoning_chain", "reasoning_plus_sources"])} />
          <SelectField label="Confidence Display" fieldKey="confidence_display" form={form} onChange={update} options={opts(["none", "color_coded_bands", "explicit_percentage", "natural_language_hedging", "icon_indicators"])} />
          <SelectField label="Output Format" fieldKey="output_format" form={form} onChange={update} options={opts(["markdown", "structured_json", "html", "auto_detect"])} />
          <SelectField label="Citation Format" fieldKey="citation_format" form={form} onChange={update} options={opts(["none", "inline_parenthetical", "footnotes", "end_references", "linked_highlights"])} />
          <NumberField label="Max Output Length" fieldKey="max_output_length" form={form} onChange={update} min={100} max={32000} step={100} />
          <SelectField label="Chain-of-Thought Visibility" fieldKey="chain_of_thought_visibility" form={form} onChange={update} options={opts(["always_show", "always_hide", "auto", "user_toggleable"])} />
        </div>
      </ConfigSection>

      {/* Section 6: Routing & Control Flow */}
      <ConfigSection title="Routing & Control Flow" description="Routing strategy, loop settings, and condition evaluation" defaultOpen={false}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Routing Strategy" fieldKey="routing_strategy" form={form} onChange={update} options={opts(["llm_based", "rule_based", "classifier_based", "hybrid", "semantic_router"])} />
          <SelectField label="Routing Model" fieldKey="routing_model" form={form} onChange={update} options={opts(["same_as_primary", "lighter_model", "dedicated_classifier"])} />
          <SelectField label="Routing Fallback" fieldKey="routing_fallback" form={form} onChange={update} options={opts(["default_path", "error_node", "human_review", "retry_with_primary"])} />
          <SliderField label="Route Confidence Threshold" fieldKey="route_confidence_threshold" form={form} onChange={update} min={0.1} max={1.0} step={0.05} />
          <NumberField label="Loop Max Count" fieldKey="loop_max_count" form={form} onChange={update} min={1} max={20} />
          <SelectField label="Loop Exit Condition" fieldKey="loop_exit_condition" form={form} onChange={update} options={opts(["max_reached", "quality_threshold", "no_improvement", "human_approval", "timeout"])} />
          <SliderField label="Loop Exit Threshold" fieldKey="loop_exit_threshold" form={form} onChange={update} min={0.5} max={1.0} step={0.05} />
          <SelectField label="Condition Evaluation Method" fieldKey="condition_evaluation_method" form={form} onChange={update} options={opts(["state_field_check", "llm_evaluation", "score_comparison", "regex_match"])} />
        </div>
      </ConfigSection>

      {/* Section 7: Cost & Performance */}
      <ConfigSection title="Cost & Performance" description="Budget limits, token caps, and caching" defaultOpen={false}>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Max Cost Per Run" fieldKey="max_cost_per_run_usd" form={form} onChange={update} min={0.01} max={100} step={0.5} prefix="$" />
          <NumberField label="Max Total Tokens" fieldKey="max_total_tokens" form={form} onChange={update} min={1000} max={1000000} step={10000} />
          <NumberField label="Max Latency (Seconds)" fieldKey="max_latency_seconds" form={form} onChange={update} min={10} max={3600} />
          <SelectField label="Caching" fieldKey="caching" form={form} onChange={update} options={opts(["none", "exact_match", "semantic_cache"])} />
          <NumberField label="Cache TTL (Hours)" fieldKey="cache_ttl_hours" form={form} onChange={update} min={1} max={720} />
        </div>
      </ConfigSection>

      {/* Section 8: Tool Behavior */}
      <ConfigSection title="Tool Behavior" description="Tool selection, timeouts, and retry behavior" defaultOpen={false}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Tool Selection Strategy" fieldKey="tool_selection_strategy" form={form} onChange={update} options={opts(["llm_decides", "always_available", "whitelist_per_node"])} />
          <NumberField label="Tool Call Timeout (s)" fieldKey="tool_call_timeout" form={form} onChange={update} min={5} max={300} />
          <NumberField label="Retry on Failure" fieldKey="tool_retry_on_failure" form={form} onChange={update} min={0} max={5} />
          <SelectField label="Result Handling" fieldKey="tool_result_handling" form={form} onChange={update} options={opts(["raw", "summarized", "structured", "truncated"])} />
          <NumberField label="Max Tool Calls Per Node" fieldKey="max_tool_calls_per_node" form={form} onChange={update} min={1} max={50} />
        </div>
        <div className="mt-4">
          <ToggleField label="Parallel Tool Calls" fieldKey="parallel_tool_calls" form={form} onChange={update} description="Allow tools to be called in parallel within a node" />
        </div>
      </ConfigSection>

      {/* Section 9: Guardrail Ordering & Trigger */}
      <ConfigSection title="Guardrail Ordering & Trigger" description="Set guardrail priority and trigger behavior for this configuration">
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-semibold">Priority Order</Label>
            <p className="mb-2 text-[10px] text-muted-foreground">
              Drag to set the guardrail evaluation order for this configuration.
            </p>
            <GuardrailReorder
              items={form.guardrail_priority_order as string[]}
              onChange={(items) => update("guardrail_priority_order", items)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Trigger Action" fieldKey="guardrail_trigger_action" form={form} onChange={update} options={opts(["graceful_fallback", "explicit_warning", "hard_block", "silent_retry", "escalate_to_human"])} />
            <NumberField label="Max Guardrail Retries" fieldKey="max_guardrail_retries" form={form} onChange={update} min={0} max={5} />
            <SelectField label="Hallucination Detection" fieldKey="hallucination_detection" form={form} onChange={update} options={opts(["none", "self_check", "cross_reference", "citation_verification", "all"])} />
            <SelectField label="Numerical Validation" fieldKey="numerical_validation" form={form} onChange={update} options={opts(["none", "formula_check", "range_check", "cross_reference", "full_audit"])} />
            <SelectField label="Source Grounding Level" fieldKey="source_grounding_level" form={form} onChange={update} options={opts(["none", "require_citation", "verify_citation", "strict_attribution"])} />
            <SelectField label="Contradictory Data Handling" fieldKey="contradictory_data_handling" form={form} onChange={update} options={opts(["flag_both_with_sources", "use_most_recent", "use_most_authoritative", "halt_and_clarify"])} />
            <SelectField label="Uncertainty Handling" fieldKey="uncertainty_handling" form={form} onChange={update} options={opts(["present_with_confidence", "show_range", "escalate_to_human", "omit_and_note", "best_guess_with_caveat"])} />
            <SliderField label="Confidence Threshold" fieldKey="confidence_threshold" form={form} onChange={update} min={0.1} max={1.0} step={0.05} />
          </div>
        </div>
      </ConfigSection>

      {/* Section 10: Persona & Prompt Parameters */}
      <ConfigSection title="Persona & Prompt Parameters" description="Risk tolerance, detail level, and output style" defaultOpen={false}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Risk Tolerance" fieldKey="risk_tolerance" form={form} onChange={update} options={opts(["very_conservative", "conservative", "moderate", "aggressive"])} />
          <SelectField label="Detail Level" fieldKey="detail_level" form={form} onChange={update} options={opts(["concise", "standard", "detailed", "exhaustive"])} />
          <SelectField label="Language Formality" fieldKey="language_formality" form={form} onChange={update} options={opts(["formal", "semi_formal", "conversational"])} />
          <SelectField label="Disclaimer Inclusion" fieldKey="disclaimer_inclusion" form={form} onChange={update} options={opts(["always", "when_uncertain", "never"])} />
          <SelectField label="Few-Shot Examples" fieldKey="few_shot_examples" form={form} onChange={update} options={opts(["none", "domain_default", "auto_select"])} />
          <NumberField label="Few-Shot Count" fieldKey="few_shot_count" form={form} onChange={update} min={0} max={10} />
          <SelectField label="Output Template" fieldKey="output_template" form={form} onChange={update} options={opts(["standard_report", "executive_summary", "detailed_analysis", "data_table", "domain_default"])} />
        </div>
      </ConfigSection>

      {/* Section 11: Missing Information Strategy */}
      <ConfigSection title="Missing Information Strategy" description="How the system handles gaps in data" defaultOpen={false}>
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Missing Info Strategy" fieldKey="missing_info_strategy" form={form} onChange={update} options={opts(["ask_user", "search_external", "use_defaults", "estimate_with_reasoning", "hybrid"])} />
          <SelectField label="Missing Info Autonomy" fieldKey="missing_info_autonomy" form={form} onChange={update} options={opts(["low", "medium", "high"])} />
          <SelectField label="External Data Freshness" fieldKey="external_data_freshness" form={form} onChange={update} options={opts(["real_time", "cached_24h", "cached_7d", "manual_refresh"])} />
        </div>
        <div className="mt-4">
          <Field label="Assumption Source Priority" fieldKey="assumption_source_priority" form={form} onChange={update}>
            <Input className="h-9 text-xs" value={String(form.assumption_source_priority ?? "")} onChange={(e) => update("assumption_source_priority", e.target.value)} />
          </Field>
        </div>
      </ConfigSection>

      {/* Create button */}
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-5">
        <p className="text-xs text-muted-foreground">
          Once created, this configuration cannot be edited. To change settings,
          duplicate and create a new version.
        </p>
        <Button
          size="lg"
          onClick={handleCreate}
          disabled={!(form.config_name as string)?.trim() || creating}
        >
          {creating ? "Creating..." : "Create Configuration"}
        </Button>
      </div>
    </div>
  );
}
