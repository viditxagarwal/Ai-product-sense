"use client";

import { useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";
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
import { NODE_TYPE_MAP } from "./nodeTypes";
import { useToolStore } from "@/stores/tool-store";
import ModelSelect from "@/components/shared/ModelSelect";
import { useAvailableModels } from "@/hooks/useAvailableModels";
import type { Node } from "@xyflow/react";
import type { WorkflowNodeData } from "./CustomNodes/WorkflowNode";

interface NodeInspectorProps {
  node: Node | null;
  onUpdate: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
  onClose: () => void;
}

export default function NodeInspector({
  node,
  onUpdate,
  onClose,
}: NodeInspectorProps) {
  const { tools, fetchTools } = useToolStore();
  const { providers } = useAvailableModels();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded && tools.length === 0) {
      fetchTools().then(() => setLoaded(true));
    } else {
      setLoaded(true);
    }
  }, [loaded, tools.length, fetchTools]);

  const data = (node?.data ?? {}) as unknown as WorkflowNodeData;
  const nodeType = data.nodeType || "agent_node";
  const config = NODE_TYPE_MAP[nodeType] || NODE_TYPE_MAP["agent_node"];

  const update = useCallback(
    (field: string, value: unknown) => {
      if (!node) return;
      onUpdate(node.id, { [field]: value });
    },
    [node, onUpdate]
  );

  const toggleTool = useCallback(
    (toolId: string) => {
      if (!node) return;
      const current = (data.boundTools as string[]) || [];
      const next = current.includes(toolId)
        ? current.filter((t) => t !== toolId)
        : [...current, toolId];
      onUpdate(node.id, { boundTools: next });
    },
    [node, data.boundTools, onUpdate]
  );

  if (!node) return null;

  const enabledTools = tools.filter((t) => t.is_enabled);

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Node Inspector</h3>
          <Badge
            className={`${config.color} text-[10px] text-white hover:${config.color}`}
          >
            {config.label}
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Name */}
        <div className="space-y-1.5">
          <Label className="text-xs">Node Name</Label>
          <Input
            value={(data.label as string) || ""}
            onChange={(e) => update("label", e.target.value)}
            placeholder="Enter node name"
          />
        </div>

        {/* Purpose */}
        <div className="space-y-1.5">
          <Label className="text-xs">Purpose</Label>
          <Textarea
            value={(data.purpose as string) || ""}
            onChange={(e) => update("purpose", e.target.value)}
            placeholder="What does this node do?"
            rows={2}
          />
        </div>

        {/* Bound Tools */}
        <div className="space-y-2">
          <Label className="text-xs">Bound Tools</Label>
          <p className="text-[10px] text-muted-foreground">
            Enable tools available to this node at runtime.
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
            {enabledTools.length === 0 ? (
              <p className="py-2 text-center text-[10px] text-slate-400">
                No enabled tools. Enable tools in the Tool Registry.
              </p>
            ) : (
              enabledTools.map((tool) => {
                const bound = ((data.boundTools as string[]) || []).includes(
                  tool.id
                );
                return (
                  <div
                    key={tool.id}
                    className="flex items-center justify-between rounded px-2 py-1 hover:bg-slate-50"
                  >
                    <span className="text-xs">{tool.display_name}</span>
                    <Switch
                      checked={bound}
                      onCheckedChange={() => toggleTool(tool.id)}
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Per-node conditions */}
        <div className="space-y-3">
          <Label className="text-xs font-semibold">Conditions</Label>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-500">On Missing Data</Label>
            <Select
              value={(data.onMissingData as string) || "flag"}
              onValueChange={(v) => update("onMissingData", v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skip">Skip</SelectItem>
                <SelectItem value="flag">Flag</SelectItem>
                <SelectItem value="halt">Halt</SelectItem>
                <SelectItem value="ask_user">Ask User</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-500">On Tool Failure</Label>
            <Select
              value={(data.onToolFailure as string) || "retry"}
              onValueChange={(v) => update("onToolFailure", v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="retry">Retry</SelectItem>
                <SelectItem value="skip">Skip</SelectItem>
                <SelectItem value="fallback">Fallback</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-[11px] text-slate-500">On Low Confidence</Label>
            <Select
              value={(data.onLowConfidence as string) || "proceed"}
              onValueChange={(v) => update("onLowConfidence", v)}
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="proceed">Proceed</SelectItem>
                <SelectItem value="flag">Flag</SelectItem>
                <SelectItem value="halt">Halt</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Model Override */}
        <div className="space-y-1.5">
          <Label className="text-xs">Model Override (optional)</Label>
          <ModelSelect
            value={(data.modelOverride as string) || ""}
            onValueChange={(v) => update("modelOverride", v)}
            providers={providers}
            allowNone
            noneLabel="Use Configuration Default"
            className="h-8 text-xs"
          />
        </div>

        {/* Guardrail Override */}
        <div className="space-y-1.5">
          <Label className="text-xs">Guardrail Override (optional)</Label>
          <Input
            value={(data.guardrailOverride as string) || ""}
            onChange={(e) => update("guardrailOverride", e.target.value)}
            placeholder="e.g., never_fabricate=strict"
            className="h-8 text-xs"
          />
        </div>

        {/* Parallelization-specific fields */}
        {nodeType === "parallelization" && (
          <div className="space-y-3 rounded-md border border-purple-200 bg-purple-50/50 p-3">
            <Label className="text-xs font-semibold text-purple-700">
              Parallelization Settings
            </Label>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Branch Count</Label>
              <Input
                type="number"
                min={2}
                max={10}
                value={Number(data.branchCount) || 3}
                onChange={(e) =>
                  update("branchCount", parseInt(e.target.value, 10))
                }
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Fan-out Method</Label>
              <Select
                value={(data.fanOutMethod as string) || "by_subtask"}
                onValueChange={(v) => update("fanOutMethod", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="by_section">By Section</SelectItem>
                  <SelectItem value="by_subtask">By Subtask</SelectItem>
                  <SelectItem value="by_perspective">By Perspective</SelectItem>
                  <SelectItem value="by_model">By Model</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Merge Method</Label>
              <Select
                value={(data.mergeMethod as string) || "synthesize"}
                onValueChange={(v) => update("mergeMethod", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="concatenate">Concatenate</SelectItem>
                  <SelectItem value="synthesize">Synthesize</SelectItem>
                  <SelectItem value="vote">Vote</SelectItem>
                  <SelectItem value="weighted">Weighted</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Loop-specific fields */}
        {nodeType === "loop" && (
          <div className="space-y-3 rounded-md border border-teal-200 bg-teal-50/50 p-3">
            <Label className="text-xs font-semibold text-teal-700">
              Loop Settings
            </Label>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Max Iterations</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={Number(data.maxIterations) || 5}
                onChange={(e) =>
                  update("maxIterations", parseInt(e.target.value, 10))
                }
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Exit Condition</Label>
              <Select
                value={(data.exitCondition as string) || "max_reached"}
                onValueChange={(v) => update("exitCondition", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="max_reached">Max Reached</SelectItem>
                  <SelectItem value="quality_threshold">
                    Quality Threshold
                  </SelectItem>
                  <SelectItem value="no_improvement">No Improvement</SelectItem>
                  <SelectItem value="human_approval">Human Approval</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">
                Exit Threshold: {((Number(data.exitThreshold) || 0.8) * 100).toFixed(0)}%
              </Label>
              <input
                type="range"
                min="50"
                max="100"
                value={((Number(data.exitThreshold) || 0.8) * 100).toFixed(0)}
                onChange={(e) =>
                  update("exitThreshold", parseInt(e.target.value, 10) / 100)
                }
                className="w-full accent-teal-500"
              />
              <div className="flex justify-between text-[10px] text-slate-400">
                <span>50%</span>
                <span>100%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
