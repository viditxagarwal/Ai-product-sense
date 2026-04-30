"use client";

import { useCallback } from "react";
import { ArrowRight, X, Trash2, RotateCcw, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Edge, Node } from "@xyflow/react";
import type { WorkflowNodeData, WorkflowEdgeData } from "@/types";

interface EdgeInspectorProps {
  edge: Edge;
  nodes: Node[];
  onUpdateEdge: (edgeId: string, data: Partial<WorkflowEdgeData>) => void;
  onDeleteEdge: (edgeId: string) => void;
  onClose: () => void;
}

const EDGE_TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  flow: { bg: "bg-slate-100", text: "text-slate-600", label: "Flow" },
  conditional: { bg: "bg-amber-100", text: "text-amber-700", label: "Conditional" },
  loop: { bg: "bg-cyan-100", text: "text-cyan-700", label: "Loop" },
};

const FIELD_COMPARISON_OPERATORS = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Not Equals" },
  { value: "greater_than", label: "Greater Than" },
  { value: "less_than", label: "Less Than" },
  { value: "greater_than_or_equal", label: "≥ Greater Than or Equal" },
  { value: "less_than_or_equal", label: "≤ Less Than or Equal" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Not Contains" },
  { value: "starts_with", label: "Starts With" },
  { value: "ends_with", label: "Ends With" },
  { value: "is_empty", label: "Is Empty" },
  { value: "is_not_empty", label: "Is Not Empty" },
  { value: "matches_regex", label: "Matches Regex" },
  { value: "in_list", label: "In List" },
  { value: "not_in_list", label: "Not In List" },
];

export default function EdgeInspector({
  edge,
  nodes,
  onUpdateEdge,
  onDeleteEdge,
  onClose,
}: EdgeInspectorProps) {
  const rawData = (edge.data || {}) as Record<string, unknown>;
  const edgeType = (rawData.edgeType as string) || (edge.type === "loopback" ? "loop" : "flow");
  const data = rawData as unknown as WorkflowEdgeData;

  const update = useCallback(
    (field: string, value: unknown) => {
      onUpdateEdge(edge.id, { [field]: value } as Partial<WorkflowEdgeData>);
    },
    [edge.id, onUpdateEdge]
  );

  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);
  const sourceLabel = (sourceNode?.data as WorkflowNodeData)?.label || edge.source;
  const targetLabel = (targetNode?.data as WorkflowNodeData)?.label || edge.target;

  const typeConfig = EDGE_TYPE_COLORS[edgeType] || EDGE_TYPE_COLORS.flow;

  // ── multi_condition helpers ──────────────────────────────────
  const conditionRules = data.conditionRules || [];

  const addRule = () => {
    update("conditionRules", [...conditionRules, { field: "", operator: "equals", value: "" }]);
  };

  const removeRule = (idx: number) => {
    update("conditionRules", conditionRules.filter((_, i) => i !== idx));
  };

  const updateRule = (idx: number, key: "field" | "operator" | "value", val: string) => {
    const next = conditionRules.map((r, i) => (i === idx ? { ...r, [key]: val } : r));
    update("conditionRules", next);
  };

  // ── evaluationResponseMapping helpers ───────────────────────
  const evalMapping = data.evaluationResponseMapping || {};

  const addEvalMappingRow = () => {
    update("evaluationResponseMapping", { ...evalMapping, "": "" });
  };

  const updateEvalMappingKey = (oldKey: string, newKey: string) => {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(evalMapping)) {
      next[k === oldKey ? newKey : k] = v as string;
    }
    update("evaluationResponseMapping", next);
  };

  const updateEvalMappingValue = (key: string, val: string) => {
    update("evaluationResponseMapping", { ...evalMapping, [key]: val });
  };

  const removeEvalMappingRow = (key: string) => {
    const next = { ...evalMapping };
    delete next[key];
    update("evaluationResponseMapping", next);
  };

  // ── inputOutputMapping helpers ───────────────────────────────
  const ioMapping = data.inputOutputMapping || [];

  const addIoRow = () => {
    update("inputOutputMapping", [
      ...ioMapping,
      { targetField: "", sourceExpression: "", transform: "direct", transformConfig: "" },
    ]);
  };

  const removeIoRow = (idx: number) => {
    update("inputOutputMapping", ioMapping.filter((_, i) => i !== idx));
  };

  const updateIoRow = (
    idx: number,
    key: "targetField" | "sourceExpression" | "transform" | "transformConfig",
    val: string
  ) => {
    const next = ioMapping.map((r, i) => (i === idx ? { ...r, [key]: val } : r));
    update("inputOutputMapping", next);
  };

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Edge Inspector</h3>
          <Badge className={`${typeConfig.bg} ${typeConfig.text} text-[10px] hover:${typeConfig.bg}`}>
            {edgeType === "loop" && <RotateCcw className="mr-1 size-2.5" />}
            {typeConfig.label}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Connection info */}
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <span className="text-xs font-medium text-slate-700">{sourceLabel}</span>
          <ArrowRight className="size-3.5 text-slate-400" />
          <span className="text-xs font-medium text-slate-700">{targetLabel}</span>
        </div>

        {/* Edge Type */}
        <div className="space-y-1.5">
          <Label className="text-xs">Edge Type</Label>
          <Select value={edgeType} onValueChange={(v) => update("edgeType", v)}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="flow">Flow (always follows)</SelectItem>
              <SelectItem value="conditional">Conditional (if condition met)</SelectItem>
              <SelectItem value="loop">Loop (backward edge)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Label */}
        <div className="space-y-1.5">
          <Label className="text-xs">Label</Label>
          <Input
            value={(data.label as string) || ""}
            onChange={(e) => update("label", e.target.value)}
            placeholder={edgeType === "loop" ? "Loop" : edgeType === "conditional" ? "Condition" : ""}
            className="h-8 text-xs"
          />
        </div>

        {/* === Conditional edge fields === */}
        {edgeType === "conditional" && (
          <div className="space-y-4 rounded-md border border-amber-200 bg-amber-50/50 p-3">
            <Label className="text-xs font-semibold text-amber-700">Condition</Label>

            {/* Routing level selector */}
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Routing Level</Label>
              <Select
                value={data.conditionMethod || "field_comparison"}
                onValueChange={(v) => update("conditionMethod", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="field_comparison">Level 1: Field Comparison</SelectItem>
                  <SelectItem value="pattern_match">Level 2: Pattern Match</SelectItem>
                  <SelectItem value="multi_condition">Level 3: Multi-Condition</SelectItem>
                  <SelectItem value="llm_evaluation">Level 4: LLM Evaluation</SelectItem>
                  <SelectItem value="webhook_function">Level 5: Webhook Function</SelectItem>
                  <SelectItem value="always">Always (fallback)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ── Level 1: Field Comparison ── */}
            {data.conditionMethod === "field_comparison" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Field</Label>
                  <Input
                    value={data.conditionField || ""}
                    onChange={(e) => update("conditionField", e.target.value)}
                    className="h-8 text-xs"
                    placeholder="output.category"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Operator</Label>
                  <Select
                    value={data.conditionOperator || "equals"}
                    onValueChange={(v) => update("conditionOperator", v)}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FIELD_COMPARISON_OPERATORS.map((op) => (
                        <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {!["is_empty", "is_not_empty"].includes(data.conditionOperator || "") && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] text-slate-500">Value</Label>
                    <Input
                      value={data.conditionValue || ""}
                      onChange={(e) => update("conditionValue", e.target.value)}
                      className="h-8 text-xs"
                      placeholder="approved"
                    />
                  </div>
                )}
              </>
            )}

            {/* ── Level 2: Pattern Match ── */}
            {data.conditionMethod === "pattern_match" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Match Against</Label>
                  <Select
                    value={data.patternField || "full_output"}
                    onValueChange={(v) => update("patternField", v)}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full_output">Full Output</SelectItem>
                      <SelectItem value="specific_field">Specific Field</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Operator</Label>
                  <Select
                    value={data.patternOperator || "contains"}
                    onValueChange={(v) => update("patternOperator", v)}
                  >
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="regex">Regex</SelectItem>
                      <SelectItem value="starts_with">Starts With</SelectItem>
                      <SelectItem value="ends_with">Ends With</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Pattern</Label>
                  <Input
                    value={data.patternValue || ""}
                    onChange={(e) => update("patternValue", e.target.value)}
                    className="h-8 text-xs"
                    placeholder={data.patternOperator === "regex" ? "^(yes|approved)" : "approved"}
                  />
                </div>
              </>
            )}

            {/* ── Level 3: Multi-Condition ── */}
            {data.conditionMethod === "multi_condition" && (
              <>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] text-slate-500">Combinator</Label>
                    <div className="flex rounded border border-slate-200 text-[10px] overflow-hidden">
                      <button
                        className={`px-2 py-0.5 ${data.conditionCombinator !== "OR" ? "bg-amber-500 text-white" : "bg-white text-slate-600"}`}
                        onClick={() => update("conditionCombinator", "AND")}
                      >
                        AND
                      </button>
                      <button
                        className={`px-2 py-0.5 ${data.conditionCombinator === "OR" ? "bg-amber-500 text-white" : "bg-white text-slate-600"}`}
                        onClick={() => update("conditionCombinator", "OR")}
                      >
                        OR
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  {conditionRules.map((rule, idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <Input
                        value={rule.field}
                        onChange={(e) => updateRule(idx, "field", e.target.value)}
                        className="h-7 min-w-0 flex-1 text-xs"
                        placeholder="field"
                      />
                      <Select value={rule.operator} onValueChange={(v) => updateRule(idx, "operator", v)}>
                        <SelectTrigger className="h-7 w-24 shrink-0 text-[10px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FIELD_COMPARISON_OPERATORS.map((op) => (
                            <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        value={rule.value}
                        onChange={(e) => updateRule(idx, "value", e.target.value)}
                        className="h-7 min-w-0 flex-1 text-xs"
                        placeholder="value"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-7 shrink-0 p-0 text-slate-400 hover:text-red-500"
                        onClick={() => removeRule(idx)}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-full text-xs"
                    onClick={addRule}
                  >
                    <Plus className="mr-1 size-3" />
                    Add Rule
                  </Button>
                </div>
              </>
            )}

            {/* ── Level 4: LLM Evaluation ── */}
            {data.conditionMethod === "llm_evaluation" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Evaluation Prompt</Label>
                  <Textarea
                    value={data.conditionPrompt || ""}
                    onChange={(e) => update("conditionPrompt", e.target.value)}
                    placeholder="Is the output complete and accurate? Reply YES or NO."
                    rows={3}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Evaluator Model</Label>
                  <Input
                    value={data.evaluatorModel || ""}
                    onChange={(e) => update("evaluatorModel", e.target.value)}
                    className="h-8 text-xs"
                    placeholder="gpt-4o-mini"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Confidence Threshold</Label>
                  <Slider
                    value={[data.confidenceThreshold ?? 0.7]}
                    onValueChange={([v]) => update("confidenceThreshold", v)}
                    min={0.5} max={1.0} step={0.05}
                  />
                  <span className="text-[10px] text-slate-400">{(data.confidenceThreshold ?? 0.7).toFixed(2)}</span>
                </div>
                {/* Response mapping */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[11px] text-slate-500">Response Mapping</Label>
                    <Button variant="ghost" size="sm" className="h-5 p-0 text-[10px] text-slate-400 hover:text-slate-600" onClick={addEvalMappingRow}>
                      <Plus className="mr-0.5 size-2.5" /> Add
                    </Button>
                  </div>
                  {Object.entries(evalMapping).map(([key, val], idx) => (
                    <div key={idx} className="flex items-center gap-1">
                      <Input
                        value={key}
                        onChange={(e) => updateEvalMappingKey(key, e.target.value)}
                        className="h-7 min-w-0 flex-1 text-xs"
                        placeholder="YES"
                      />
                      <span className="shrink-0 text-[10px] text-slate-400">→</span>
                      <Input
                        value={val as string}
                        onChange={(e) => updateEvalMappingValue(key, e.target.value)}
                        className="h-7 min-w-0 flex-1 text-xs"
                        placeholder="node_output"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-7 shrink-0 p-0 text-slate-400 hover:text-red-500"
                        onClick={() => removeEvalMappingRow(key)}
                      >
                        <X className="size-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ── Level 5: Webhook Function ── */}
            {data.conditionMethod === "webhook_function" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Webhook URL</Label>
                  <Input
                    value={data.webhookUrl || ""}
                    onChange={(e) => update("webhookUrl", e.target.value)}
                    className="h-8 text-xs"
                    placeholder="https://api.example.com/route"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Response Field</Label>
                  <Input
                    value={data.webhookResponseField || ""}
                    onChange={(e) => update("webhookResponseField", e.target.value)}
                    className="h-8 text-xs"
                    placeholder="result.route"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* === Loop edge fields === */}
        {edgeType === "loop" && (
          <div className="space-y-4 rounded-md border border-cyan-200 bg-cyan-50/50 p-3">
            <Label className="text-xs font-semibold text-cyan-700">Loop Control</Label>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Max Iterations</Label>
              <Input
                type="number" min={1} max={50}
                value={data.maxIterations ?? 3}
                onChange={(e) => update("maxIterations", parseInt(e.target.value, 10) || 3)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-[11px] text-slate-500">Exit Threshold</Label>
              <Slider
                value={[data.exitThreshold ?? 0.85]}
                onValueChange={([v]) => update("exitThreshold", v)}
                min={0.5} max={1.0} step={0.05}
              />
              <span className="text-[10px] text-slate-400">{(data.exitThreshold ?? 0.85).toFixed(2)}</span>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">On Max Reached</Label>
              <Select value={data.onMaxReached || "use_best"} onValueChange={(v) => update("onMaxReached", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="use_best">Use Best Result</SelectItem>
                  <SelectItem value="use_last">Use Last Result</SelectItem>
                  <SelectItem value="stop_error">Stop with Error</SelectItem>
                  <SelectItem value="route_fallback">Route to Fallback</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* === Input/Output Mapping (all edge types) === */}
        <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50/50 p-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-semibold text-slate-600">Input / Output Mapping</Label>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 p-0 text-[10px] text-slate-400 hover:text-slate-600"
              onClick={addIoRow}
            >
              <Plus className="mr-0.5 size-2.5" /> Add
            </Button>
          </div>

          {ioMapping.length === 0 && (
            <p className="text-[10px] text-slate-400">No mappings. Click Add to define field transforms.</p>
          )}

          {ioMapping.map((row, idx) => (
            <div key={idx} className="space-y-1 rounded border border-slate-200 bg-white p-2">
              <div className="flex items-center gap-1">
                <Input
                  value={row.targetField}
                  onChange={(e) => updateIoRow(idx, "targetField", e.target.value)}
                  className="h-7 min-w-0 flex-1 text-xs"
                  placeholder="target field"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-7 shrink-0 p-0 text-slate-400 hover:text-red-500"
                  onClick={() => removeIoRow(idx)}
                >
                  <X className="size-3" />
                </Button>
              </div>
              <Input
                value={row.sourceExpression}
                onChange={(e) => updateIoRow(idx, "sourceExpression", e.target.value)}
                className="h-7 text-xs"
                placeholder="source expression"
              />
              <Select value={row.transform} onValueChange={(v) => updateIoRow(idx, "transform", v)}>
                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="template">Template</SelectItem>
                  <SelectItem value="lookup">Lookup</SelectItem>
                  <SelectItem value="jsonpath">JSONPath</SelectItem>
                  <SelectItem value="type_cast">Type Cast</SelectItem>
                  <SelectItem value="expression">Expression</SelectItem>
                </SelectContent>
              </Select>
              {row.transform !== "direct" && (
                <Input
                  value={row.transformConfig || ""}
                  onChange={(e) => updateIoRow(idx, "transformConfig", e.target.value)}
                  className="h-7 text-xs"
                  placeholder="transform config"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Delete */}
      <div className="border-t border-slate-200 p-4">
        <Button
          variant="destructive"
          size="sm"
          className="w-full"
          onClick={() => onDeleteEdge(edge.id)}
        >
          <Trash2 className="mr-1.5 size-3.5" />
          Delete Edge
        </Button>
      </div>
    </div>
  );
}
