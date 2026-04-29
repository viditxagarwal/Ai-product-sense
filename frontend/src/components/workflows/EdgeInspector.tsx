"use client";

import { useCallback } from "react";
import { ArrowRight, X, Trash2, RotateCcw } from "lucide-react";
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

export default function EdgeInspector({
  edge,
  nodes,
  onUpdateEdge,
  onDeleteEdge,
  onClose,
}: EdgeInspectorProps) {
  // Support both old LoopbackEdgeData and new WorkflowEdgeData
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

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Method</Label>
              <Select
                value={data.conditionMethod || "llm_evaluation"}
                onValueChange={(v) => update("conditionMethod", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rule_based">Rule-based</SelectItem>
                  <SelectItem value="llm_evaluation">LLM Evaluation</SelectItem>
                  <SelectItem value="score_comparison">Score Comparison</SelectItem>
                  <SelectItem value="regex_match">Regex Match</SelectItem>
                  <SelectItem value="always">Always (fallback)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {data.conditionMethod === "rule_based" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Field</Label>
                  <Input value={data.ruleField || ""} onChange={(e) => update("ruleField", e.target.value)} className="h-8 text-xs" placeholder="output.category" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Operator</Label>
                  <Select value={data.ruleOperator || "equals"} onValueChange={(v) => update("ruleOperator", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="equals">Equals</SelectItem>
                      <SelectItem value="contains">Contains</SelectItem>
                      <SelectItem value="greater_than">Greater Than</SelectItem>
                      <SelectItem value="less_than">Less Than</SelectItem>
                      <SelectItem value="is_empty">Is Empty</SelectItem>
                      <SelectItem value="is_not_empty">Is Not Empty</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Value</Label>
                  <Input value={data.ruleValue || ""} onChange={(e) => update("ruleValue", e.target.value)} className="h-8 text-xs" />
                </div>
              </>
            )}

            {data.conditionMethod === "llm_evaluation" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Evaluation Prompt</Label>
                  <Textarea
                    value={data.conditionPrompt || ""}
                    onChange={(e) => update("conditionPrompt", e.target.value)}
                    placeholder="Is the output complete and accurate?"
                    rows={3}
                    className="text-xs"
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
              </>
            )}

            {data.conditionMethod === "score_comparison" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-[11px] text-slate-500">Score Field</Label>
                  <Input value={data.scoreField || ""} onChange={(e) => update("scoreField", e.target.value)} className="h-8 text-xs" placeholder="confidence" />
                </div>
                <div className="flex gap-2">
                  <Select value={data.scoreOperator || ">"} onValueChange={(v) => update("scoreOperator", v)}>
                    <SelectTrigger className="h-8 w-20 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=">">{">"}</SelectItem>
                      <SelectItem value=">=">{">="}</SelectItem>
                      <SelectItem value="<">{"<"}</SelectItem>
                      <SelectItem value="<=">{"<="}</SelectItem>
                      <SelectItem value="==">{"=="}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" value={data.scoreThreshold ?? 0.5} onChange={(e) => update("scoreThreshold", parseFloat(e.target.value))} className="h-8 text-xs" />
                </div>
              </>
            )}

            {data.conditionMethod === "regex_match" && (
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-500">Regex Pattern</Label>
                <Input value={data.regexPattern || ""} onChange={(e) => update("regexPattern", e.target.value)} className="h-8 text-xs" placeholder="^(yes|approved)" />
              </div>
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
