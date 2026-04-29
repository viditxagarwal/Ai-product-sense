"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Trash2 } from "lucide-react";
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
import { NODE_TYPE_MAP, resolveNodeType } from "./nodeTypes";
import { useToolStore } from "@/stores/tool-store";
import ModelSelect from "@/components/shared/ModelSelect";
import { useAvailableModels } from "@/hooks/useAvailableModels";
import type { Node } from "@xyflow/react";
import type { WorkflowNodeData } from "./CustomNodes/WorkflowNode";

interface NodeInspectorProps {
  node: Node | null;
  onUpdate: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
  onClose: () => void;
  onDeleteNode?: (node: Node) => void;
}

export default function NodeInspector({
  node,
  onUpdate,
  onClose,
  onDeleteNode,
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
  const nodeType = resolveNodeType(data.nodeType || "step");
  const config = NODE_TYPE_MAP[nodeType] || NODE_TYPE_MAP["step"];

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

        {/* Bound Tools — shown for Step and Decision */}
        {(nodeType === "step" || nodeType === "decision") && (
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
        )}

        {/* Per-node conditions — shown for Step */}
        {nodeType === "step" && (
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
        )}

        {/* Model Override — shown for Step and Decision */}
        {(nodeType === "step" || nodeType === "decision") && (
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
        )}

        {/* Guardrail Override — shown for Step */}
        {nodeType === "step" && (
          <div className="space-y-1.5">
            <Label className="text-xs">Guardrail Override (optional)</Label>
            <Input
              value={(data.guardrailOverride as string) || ""}
              onChange={(e) => update("guardrailOverride", e.target.value)}
              placeholder="e.g., never_fabricate=strict"
              className="h-8 text-xs"
            />
          </div>
        )}

        {/* ─── Decision-specific fields ─── */}
        {nodeType === "decision" && (
          <div className="space-y-3 rounded-md border border-orange-200 bg-orange-50/50 p-3">
            <Label className="text-xs font-semibold text-orange-700">
              Decision Settings
            </Label>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Condition Type</Label>
              <Select
                value={(data.conditionType as string) || "rule_based"}
                onValueChange={(v) => update("conditionType", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="rule_based">Rule-based</SelectItem>
                  <SelectItem value="llm_classification">LLM Classification</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">
                {(data.conditionType as string) === "llm_classification"
                  ? "Classification Prompt"
                  : "Condition Expression"}
              </Label>
              <Textarea
                value={(data.conditionPrompt as string) || ""}
                onChange={(e) => update("conditionPrompt", e.target.value)}
                placeholder={
                  (data.conditionType as string) === "llm_classification"
                    ? "Classify the input into one of: positive, negative, neutral"
                    : "e.g., output.confidence > 0.8"
                }
                rows={3}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Path Mappings</Label>
              <Textarea
                value={(data.pathMappings as string) || ""}
                onChange={(e) => update("pathMappings", e.target.value)}
                placeholder={"positive → Step A\nnegative → Step B\ndefault → Step C"}
                rows={3}
                className="text-xs"
              />
              <p className="text-[10px] text-slate-400">
                One mapping per line: condition → target node
              </p>
            </div>
          </div>
        )}

        {/* ─── Parallel-specific fields ─── */}
        {nodeType === "parallel" && (
          <div className="space-y-3 rounded-md border border-purple-200 bg-purple-50/50 p-3">
            <Label className="text-xs font-semibold text-purple-700">
              Parallel Settings
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

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Max Branches</Label>
              <Input
                type="number"
                min={2}
                max={20}
                value={Number(data.maxBranches) || 5}
                onChange={(e) =>
                  update("maxBranches", parseInt(e.target.value, 10))
                }
                className="h-8 text-xs"
              />
            </div>
          </div>
        )}

        {/* ─── Human Review-specific fields ─── */}
        {nodeType === "human_review" && (
          <div className="space-y-3 rounded-md border border-amber-200 bg-amber-50/50 p-3">
            <Label className="text-xs font-semibold text-amber-700">
              Human Review Settings
            </Label>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Display Content</Label>
              <Textarea
                value={(data.displayContent as string) || ""}
                onChange={(e) => update("displayContent", e.target.value)}
                placeholder="What should be shown to the human reviewer? e.g., AI output, confidence scores, sources"
                rows={3}
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Human Options</Label>
              <Input
                value={(data.humanOptions as string) || ""}
                onChange={(e) => update("humanOptions", e.target.value)}
                placeholder="approve, reject, edit, escalate"
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-slate-400">
                Comma-separated action options for the reviewer
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Timeout Behavior</Label>
              <Select
                value={(data.timeoutBehavior as string) || "wait"}
                onValueChange={(v) => update("timeoutBehavior", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="wait">Wait Indefinitely</SelectItem>
                  <SelectItem value="auto_approve">Auto-Approve</SelectItem>
                  <SelectItem value="auto_reject">Auto-Reject</SelectItem>
                  <SelectItem value="escalate">Escalate</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Timeout (minutes)</Label>
              <Input
                type="number"
                min={0}
                max={1440}
                value={Number(data.timeoutMinutes) || 0}
                onChange={(e) =>
                  update("timeoutMinutes", parseInt(e.target.value, 10))
                }
                className="h-8 text-xs"
              />
              <p className="text-[10px] text-slate-400">
                0 = no timeout (wait indefinitely)
              </p>
            </div>
          </div>
        )}

        {/* ─── Retriever-specific fields ─── */}
        {nodeType === "retriever" && (
          <div className="space-y-3 rounded-md border border-green-200 bg-green-50/50 p-3">
            <Label className="text-xs font-semibold text-green-700">
              Retrieval Settings
            </Label>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Retrieval Source</Label>
              <Select
                value={(data.retrievalSource as string) || "knowledge_base"}
                onValueChange={(v) => update("retrievalSource", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="knowledge_base">Knowledge Base</SelectItem>
                  <SelectItem value="active_files">Active Files</SelectItem>
                  <SelectItem value="external">External Source</SelectItem>
                  <SelectItem value="all">All Sources</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Number of Results (Top-K)</Label>
              <Input
                type="number"
                min={1}
                max={50}
                value={Number(data.topK) || 5}
                onChange={(e) =>
                  update("topK", parseInt(e.target.value, 10))
                }
                className="h-8 text-xs"
              />
            </div>

            <div className="flex items-center justify-between rounded px-1 py-1">
              <Label className="text-[11px] text-slate-500">Enable Reranking</Label>
              <Switch
                checked={Boolean(data.rerankingEnabled)}
                onCheckedChange={(v) => update("rerankingEnabled", v)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">Knowledge Layers</Label>
              <Select
                value={(data.knowledgeLayers as string) || "all"}
                onValueChange={(v) => update("knowledgeLayers", v)}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Layers</SelectItem>
                  <SelectItem value="enterprise_only">Enterprise Only</SelectItem>
                  <SelectItem value="domain_only">Domain Only</SelectItem>
                  <SelectItem value="user_uploaded">User Uploaded Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      {/* Delete Node Button */}
      {onDeleteNode && node && (
        <div className="border-t border-slate-200 p-4">
          <Button
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => onDeleteNode(node)}
          >
            <Trash2 className="mr-1.5 size-3.5" />
            Delete Node
          </Button>
        </div>
      )}
    </div>
  );
}
