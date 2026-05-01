"use client";

import { useEffect, useState, useCallback } from "react";
import { X, Trash2, Brain, Wrench, Play } from "lucide-react";
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
import { resolveComponentType, NODE_TYPE_MAP } from "./nodeTypes";
import { useToolStore } from "@/stores/tool-store";
import ModelSelect from "@/components/shared/ModelSelect";
import TestNodePanel from "./TestNodePanel";
import { useAvailableModels } from "@/hooks/useAvailableModels";
import type { Node, Edge } from "@xyflow/react";
import type { WorkflowNodeData, WorkflowEdgeData } from "@/types";

function getTemperatureZone(temp: number): { label: string; color: string } {
  if (temp === 0) return { label: "Deterministic", color: "text-blue-600" };
  if (temp <= 0.3) return { label: "Focused", color: "text-green-600" };
  if (temp <= 0.6) return { label: "Balanced", color: "text-yellow-600" };
  if (temp <= 0.9) return { label: "Creative", color: "text-orange-600" };
  return { label: "Experimental", color: "text-red-600" };
}

interface NodeInspectorProps {
  node: Node | null;
  edges?: Edge[];
  onUpdate: (nodeId: string, data: Partial<WorkflowNodeData>) => void;
  onUpdateEdge?: (edgeId: string, data: Partial<WorkflowEdgeData>) => void;
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
  const [showTest, setShowTest] = useState(false);

  useEffect(() => {
    if (!loaded && tools.length === 0) {
      fetchTools().then(() => setLoaded(true));
    } else {
      setLoaded(true);
    }
  }, [loaded, tools.length, fetchTools]);

  const d = (node?.data ?? {}) as unknown as WorkflowNodeData;
  const componentType = resolveComponentType(d.componentType || d.nodeType || node?.type || "node");
  const config = NODE_TYPE_MAP[componentType] || NODE_TYPE_MAP["node"];

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
      const current = (d.boundTools as string[]) || [];
      const next = current.includes(toolId)
        ? current.filter((t) => t !== toolId)
        : [...current, toolId];
      onUpdate(node.id, { boundTools: next });
    },
    [node, d.boundTools, onUpdate]
  );

  if (!node) return null;

  // START/END — read-only info
  if (componentType === "start" || componentType === "end") {
    return (
      <div className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold">{componentType === "start" ? "START" : "END"} Node</h3>
          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
        <div className="p-4">
          <p className="text-xs text-slate-500">
            This is the {componentType === "start" ? "entry" : "exit"} point of the workflow. It cannot be configured or deleted.
          </p>
        </div>
      </div>
    );
  }

  const enabledTools = tools.filter((t) => t.is_enabled);
  const llmEnabled = d.llmEnabled !== false;

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">
            {componentType === "gate" ? "Gate" : componentType === "split" ? "Split" : "Node"} Inspector
          </h3>
          <Badge className={`${config.color} text-[10px] text-white hover:${config.color}`}>
            {config.label}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="size-7 p-0"
            onClick={() => setShowTest((v) => !v)}
            title="Test node"
          >
            <Play className="size-3.5 text-blue-600" />
          </Button>
          <Button variant="ghost" size="sm" className="size-7 p-0" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Name */}
        <div className="space-y-1.5">
          <Label className="text-xs">Name</Label>
          <Input
            value={d.label || ""}
            onChange={(e) => update("label", e.target.value)}
            placeholder="Enter name"
          />
        </div>

        {/* === NODE-specific: LLM toggle + forms === */}
        {componentType === "node" && (
          <>
            {/* LLM Toggle */}
            <div className={`flex items-center justify-between rounded-lg border-2 p-3 ${llmEnabled ? "border-blue-200 bg-blue-50/50" : "border-green-200 bg-green-50/50"}`}>
              <div className="flex items-center gap-2">
                {llmEnabled ? <Brain className="size-4 text-blue-600" /> : <Wrench className="size-4 text-green-600" />}
                <span className={`text-xs font-semibold ${llmEnabled ? "text-blue-700" : "text-green-700"}`}>
                  {llmEnabled ? "LLM Enabled" : "Tool Only"}
                </span>
              </div>
              <Switch
                checked={llmEnabled}
                onCheckedChange={(v) => update("llmEnabled", v)}
              />
            </div>

            {llmEnabled ? (
              <>
                {/* System Prompt */}
                <div className="space-y-1.5">
                  <Label className="text-xs">System Prompt</Label>
                  <Textarea
                    value={d.systemPrompt || d.systemPromptHint || ""}
                    onChange={(e) => update("systemPrompt", e.target.value)}
                    placeholder="Enter system prompt for this node..."
                    rows={4}
                    className="text-xs"
                  />
                </div>

                {/* Model Override */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Model</Label>
                  <ModelSelect
                    value={d.modelOverride || ""}
                    onValueChange={(v) => update("modelOverride", v)}
                    providers={providers}
                    allowNone
                    noneLabel="Config Default"
                    className="h-8 text-xs"
                  />
                </div>

                {/* Temperature */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Temperature</Label>
                    {d.temperature != null && (
                      <span className={`text-[10px] font-medium ${getTemperatureZone(d.temperature as number).color}`}>
                        {getTemperatureZone(d.temperature as number).label}
                      </span>
                    )}
                  </div>
                  <Input
                    type="number" min={0} max={2} step={0.1}
                    value={d.temperature ?? ""}
                    onChange={(e) => update("temperature", parseFloat(e.target.value) || undefined)}
                    placeholder="Config default"
                    className="h-8 text-xs"
                  />
                  <div className="flex justify-between text-[9px] text-slate-400">
                    <span className="text-blue-400">0 Det.</span>
                    <span className="text-green-400">0.1-0.3</span>
                    <span className="text-yellow-400">0.4-0.6</span>
                    <span className="text-orange-400">0.7-0.9</span>
                    <span className="text-red-400">1.0+</span>
                  </div>
                </div>

                {/* Bound Tools */}
                <div className="space-y-2">
                  <Label className="text-xs">Tools</Label>
                  <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                    {enabledTools.length === 0 ? (
                      <p className="py-2 text-center text-[10px] text-slate-400">No enabled tools</p>
                    ) : (
                      enabledTools.map((tool) => {
                        const bound = ((d.boundTools as string[]) || []).includes(tool.id);
                        return (
                          <div key={tool.id} className="flex items-center justify-between rounded px-2 py-1 hover:bg-slate-50">
                            <span className="text-xs">{tool.display_name}</span>
                            <Switch checked={bound} onCheckedChange={() => toggleTool(tool.id)} />
                          </div>
                        );
                      })
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">
                    {(d.boundTools || []).length} tool{(d.boundTools || []).length !== 1 ? "s" : ""} bound
                  </p>
                </div>

                {/* Max Tool Iterations — shown when LLM enabled + tools bound */}
                {((d.boundTools as string[]) || []).length > 0 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Max Tool Iterations</Label>
                    <Input
                      type="number" min={1} max={20}
                      value={(d.maxToolIterations as number) ?? 10}
                      onChange={(e) => update("maxToolIterations", parseInt(e.target.value, 10) || 10)}
                      className="h-8 text-xs"
                    />
                    <p className="text-[10px] text-slate-400">Maximum tool call rounds in the ReAct loop</p>
                  </div>
                )}

                {/* Input Context */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Input Context</Label>
                  <Select value={d.inputContext || "previous_step"} onValueChange={(v) => update("inputContext", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user_message">User Message</SelectItem>
                      <SelectItem value="previous_step">Previous Step</SelectItem>
                      <SelectItem value="full_history">Full History</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : (
              <>
                {/* Tool Selection (LLM OFF) */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Tool</Label>
                  <Select value={d.selectedToolId || ""} onValueChange={(v) => update("selectedToolId", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select a tool" /></SelectTrigger>
                    <SelectContent>
                      {enabledTools.map((tool) => (
                        <SelectItem key={tool.id} value={tool.id}>{tool.display_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Input Mapping */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Input Source</Label>
                  <Select value={d.inputMapping || "previous_step"} onValueChange={(v) => update("inputMapping", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user_message">User Message</SelectItem>
                      <SelectItem value="previous_step">Previous Step</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {/* Error Handling */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold">Error Handling</Label>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-500">Timeout (seconds)</Label>
                <Input
                  type="number" min={0}
                  value={d.timeoutSeconds ?? ""}
                  onChange={(e) => update("timeoutSeconds", parseInt(e.target.value, 10) || undefined)}
                  placeholder="No timeout"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-500">On Failure</Label>
                <Select value={d.onFailure || "retry_once"} onValueChange={(v) => update("onFailure", v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retry_once">Retry Once</SelectItem>
                    <SelectItem value="skip_warning">Skip with Warning</SelectItem>
                    <SelectItem value="stop">Stop Execution</SelectItem>
                    <SelectItem value="fallback">Use Fallback</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}

        {/* === GATE-specific === */}
        {componentType === "gate" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Review Instructions</Label>
              <Textarea
                value={d.reviewInstructions || d.displayContent || ""}
                onChange={(e) => update("reviewInstructions", e.target.value)}
                placeholder="What should the reviewer look for?"
                rows={3} className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Display Format</Label>
              <Select value={d.displayFormat || "full_text"} onValueChange={(v) => update("displayFormat", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_text">Full Text</SelectItem>
                  <SelectItem value="summary_detail">Summary + Detail</SelectItem>
                  <SelectItem value="side_by_side">Side by Side</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Reviewer Actions</Label>
              <div className="space-y-1 rounded-md border p-2">
                {[
                  { key: "approve", label: "Approve", always: true },
                  { key: "rejectWithReason", label: "Reject with Reason" },
                  { key: "editAndApprove", label: "Edit & Approve" },
                  { key: "sendBackForRevision", label: "Send Back" },
                  { key: "addCommentAndContinue", label: "Comment & Continue" },
                ].map(({ key, label, always }) => (
                  <div key={key} className="flex items-center justify-between rounded px-2 py-1">
                    <span className="text-xs">{label}</span>
                    <Switch
                      checked={d.availableActions?.[key as keyof typeof d.availableActions] ?? (key === "approve")}
                      onCheckedChange={(v) => update("availableActions", { ...d.availableActions, [key]: v })}
                      disabled={always}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">On Reject</Label>
              <Select value={d.onReject || "stop"} onValueChange={(v) => update("onReject", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stop">Stop Execution</SelectItem>
                  <SelectItem value="route_to_fallback">Route to Fallback</SelectItem>
                  <SelectItem value="retry_previous">Retry Previous</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Wait Duration</Label>
              <Select value={d.waitDuration || "24h"} onValueChange={(v) => update("waitDuration", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1h">1 hour</SelectItem>
                  <SelectItem value="4h">4 hours</SelectItem>
                  <SelectItem value="24h">24 hours</SelectItem>
                  <SelectItem value="48h">48 hours</SelectItem>
                  <SelectItem value="168h">1 week</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">On Timeout</Label>
              <Select value={d.onTimeout || "auto_approve"} onValueChange={(v) => update("onTimeout", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto_approve">Auto-Approve</SelectItem>
                  <SelectItem value="auto_reject">Auto-Reject</SelectItem>
                  <SelectItem value="escalate">Escalate</SelectItem>
                  <SelectItem value="stop">Stop</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}

        {/* === SPLIT-specific === */}
        {componentType === "split" && (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">Branch Count</Label>
              <Input
                type="number" min={2} max={10}
                value={d.branchCount ?? 3}
                onChange={(e) => update("branchCount", parseInt(e.target.value, 10))}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Fan-out Method</Label>
              <Select value={d.fanOutMethod || "same_input"} onValueChange={(v) => update("fanOutMethod", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="same_input">Same Input to All</SelectItem>
                  <SelectItem value="split_input">Split Input</SelectItem>
                  <SelectItem value="custom_per_branch">Custom per Branch</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {d.fanOutMethod === "custom_per_branch" && (
              <div className="space-y-2">
                <Label className="text-xs">Branch Prompts</Label>
                {Array.from({ length: d.branchCount ?? 3 }, (_, i) => (
                  <Textarea
                    key={i}
                    value={(d.branchPrompts || [])[i] || ""}
                    onChange={(e) => {
                      const prompts = [...(d.branchPrompts || [])];
                      prompts[i] = e.target.value;
                      update("branchPrompts", prompts);
                    }}
                    placeholder={`Branch ${i + 1} prompt`}
                    rows={2} className="text-xs"
                  />
                ))}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Merge Method</Label>
              <Select value={d.mergeMethod || "summarize"} onValueChange={(v) => update("mergeMethod", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="concatenate">Concatenate</SelectItem>
                  <SelectItem value="summarize">Summarize</SelectItem>
                  <SelectItem value="best_of_n">Best of N</SelectItem>
                  <SelectItem value="vote">Vote</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(d.mergeMethod === "summarize" || d.mergeMethod === "best_of_n" || d.mergeMethod === "custom") && (
              <div className="space-y-1.5">
                <Label className="text-xs">Merge Prompt</Label>
                <Textarea
                  value={d.mergePrompt || ""}
                  onChange={(e) => update("mergePrompt", e.target.value)}
                  placeholder="How should branch outputs be merged?"
                  rows={3} className="text-xs"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-xs">Wait Strategy</Label>
              <Select value={d.waitStrategy || "wait_all"} onValueChange={(v) => update("waitStrategy", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="wait_all">Wait for All</SelectItem>
                  <SelectItem value="first_n">First N</SelectItem>
                  <SelectItem value="timeout_best">Timeout + Best</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Branch Timeout (seconds)</Label>
              <Input
                type="number" min={0}
                value={d.branchTimeout ?? 60}
                onChange={(e) => update("branchTimeout", parseInt(e.target.value, 10))}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">On Branch Failure</Label>
              <Select value={d.onBranchFailure || "continue"} onValueChange={(v) => update("onBranchFailure", v)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="continue">Continue</SelectItem>
                  <SelectItem value="retry">Retry</SelectItem>
                  <SelectItem value="stop_all">Stop All</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>

      {/* Test Node Panel */}
      {showTest && (
        <div className="border-t border-slate-200 p-4">
          <TestNodePanel
            nodeConfig={d as unknown as Record<string, unknown>}
            onClose={() => setShowTest(false)}
          />
        </div>
      )}

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
            Delete {componentType === "gate" ? "Gate" : componentType === "split" ? "Split" : "Node"}
          </Button>
        </div>
      )}
    </div>
  );
}
