"use client";

import { useCallback } from "react";
import { RefreshCw, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Edge, Node } from "@xyflow/react";
import type { LoopbackEdgeData } from "./LoopbackEdge";
import type { WorkflowNodeData } from "./CustomNodes/WorkflowNode";

interface EdgeInspectorProps {
  edge: Edge;
  nodes: Node[];
  onUpdateEdge: (edgeId: string, data: Partial<LoopbackEdgeData>) => void;
  onDeleteEdge: (edgeId: string) => void;
  onClose: () => void;
}

export default function EdgeInspector({
  edge,
  nodes,
  onUpdateEdge,
  onDeleteEdge,
  onClose,
}: EdgeInspectorProps) {
  const data = (edge.data || {}) as LoopbackEdgeData;

  const update = useCallback(
    (field: string, value: unknown) => {
      onUpdateEdge(edge.id, { [field]: value });
    },
    [edge.id, onUpdateEdge]
  );

  const sourceNode = nodes.find((n) => n.id === edge.source);
  const targetNode = nodes.find((n) => n.id === edge.target);
  const sourceLabel = (sourceNode?.data as WorkflowNodeData)?.label || edge.source;
  const targetLabel = (targetNode?.data as WorkflowNodeData)?.label || edge.target;

  // Build node options for exit path dropdown
  const nodeOptions = nodes.map((n) => ({
    id: n.id,
    label: (n.data as WorkflowNodeData)?.label || n.id,
  }));

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Loop Inspector</h3>
          <Badge className="bg-teal-500 text-[10px] text-white hover:bg-teal-500">
            <RefreshCw className="mr-1 size-2.5" />
            Loopback
          </Badge>
        </div>
        <Button variant="ghost" size="sm" className="size-7 p-0" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4">
        {/* Connection info */}
        <div className="rounded-md border border-teal-200 bg-teal-50/50 p-3">
          <p className="text-[10px] text-teal-700">
            <span className="font-semibold">{sourceLabel}</span>
            {" loops back to "}
            <span className="font-semibold">{targetLabel}</span>
          </p>
        </div>

        {/* Label */}
        <div className="space-y-1.5">
          <Label className="text-xs">Loop Label</Label>
          <Input
            value={data.label || "Loop"}
            onChange={(e) => update("label", e.target.value)}
            placeholder="Loop"
            className="h-8 text-xs"
          />
        </div>

        {/* Condition */}
        <div className="space-y-1.5">
          <Label className="text-xs">Loop Condition</Label>
          <Select
            value={data.loopCondition || "quality_threshold"}
            onValueChange={(v) => update("loopCondition", v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="quality_threshold">Quality Threshold</SelectItem>
              <SelectItem value="max_iterations">Max Iterations</SelectItem>
              <SelectItem value="human_approval">Human Approval</SelectItem>
              <SelectItem value="no_improvement">No Improvement</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[10px] text-slate-400">
            What determines whether to loop back
          </p>
        </div>

        {/* Max Iterations */}
        <div className="space-y-1.5">
          <Label className="text-xs">Max Iterations</Label>
          <Input
            type="number"
            min={1}
            max={20}
            value={data.maxIterations ?? 3}
            onChange={(e) =>
              update("maxIterations", parseInt(e.target.value, 10) || 3)
            }
            className="h-8 text-xs"
          />
          <p className="text-[10px] text-slate-400">
            Maximum number of times this loop can execute
          </p>
        </div>

        {/* Exit Threshold */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Exit Threshold</Label>
            <span className="text-xs font-medium text-teal-600">
              {(data.exitThreshold ?? 0.85).toFixed(2)}
            </span>
          </div>
          <Slider
            value={[data.exitThreshold ?? 0.85]}
            onValueChange={([v]) => update("exitThreshold", v)}
            min={0.5}
            max={1.0}
            step={0.05}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>0.50</span>
            <span>1.00</span>
          </div>
          <p className="text-[10px] text-slate-400">
            Quality score above which the loop exits
          </p>
        </div>

        {/* Exit Path */}
        <div className="space-y-1.5">
          <Label className="text-xs">Exit Path</Label>
          <Select
            value={data.exitNodeId || "auto"}
            onValueChange={(v) => update("exitNodeId", v === "auto" ? "" : v)}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Auto (next after source)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto (next after source)</SelectItem>
              {nodeOptions.map((n) => (
                <SelectItem key={n.id} value={n.id}>
                  {n.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-slate-400">
            Which node to go to when the loop exits
          </p>
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
          Delete Loopback Edge
        </Button>
      </div>
    </div>
  );
}
