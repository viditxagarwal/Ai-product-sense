"use client";

import { NODE_TYPE_CONFIGS } from "./nodeTypes";
import { ListOrdered } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface WorkflowTemplate {
  id: string;
  label: string;
  description: string;
  icon: typeof ListOrdered;
  color: string;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "plan_and_execute",
    label: "Plan & Execute",
    description:
      "Planner breaks task into steps, Executor iterates through them with a loopback, then Synthesize merges results. All nodes are regular — bind tools, set models, etc.",
    icon: ListOrdered,
    color: "bg-indigo-500",
  },
];

interface NodeToolbarProps {
  onAddNode: (nodeType: string) => void;
  onAddTemplate?: (templateId: string) => void;
}

export default function NodeToolbar({ onAddNode, onAddTemplate }: NodeToolbarProps) {
  const onDragStart = (
    event: React.DragEvent<HTMLDivElement>,
    nodeType: string
  ) => {
    event.dataTransfer.setData("application/workflow-node-type", nodeType);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex w-48 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-3 py-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Node Types
          </h3>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {NODE_TYPE_CONFIGS.map((config) => {
            const Icon = config.icon;
            return (
              <Tooltip key={config.type}>
                <TooltipTrigger asChild>
                  <div
                    draggable
                    onDragStart={(e) => onDragStart(e, config.type)}
                    onClick={() => onAddNode(config.type)}
                    className={`flex cursor-grab items-center gap-2.5 rounded-md border border-slate-200 px-3 py-2.5 text-xs font-medium transition-colors hover:bg-slate-50 active:cursor-grabbing ${config.textColor}`}
                  >
                    <div
                      className={`flex size-7 shrink-0 items-center justify-center rounded ${config.color}`}
                    >
                      <Icon className="size-3.5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-slate-700">{config.label}</span>
                      <p className="truncate text-[10px] font-normal text-slate-400">
                        {config.description}
                      </p>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-[220px] text-xs">
                  {config.tooltip}
                </TooltipContent>
              </Tooltip>
            );
          })}

          {/* Templates section */}
          {onAddTemplate && WORKFLOW_TEMPLATES.length > 0 && (
            <>
              <div className="pb-0.5 pt-3">
                <h4 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Patterns
                </h4>
              </div>
              {WORKFLOW_TEMPLATES.map((tpl) => {
                const Icon = tpl.icon;
                return (
                  <Tooltip key={tpl.id}>
                    <TooltipTrigger asChild>
                      <div
                        onClick={() => onAddTemplate(tpl.id)}
                        className="flex cursor-pointer items-center gap-2.5 rounded-md border border-dashed border-indigo-300 bg-indigo-50/50 px-3 py-2 text-xs font-medium transition-colors hover:bg-indigo-50"
                      >
                        <div
                          className={`flex size-6 items-center justify-center rounded ${tpl.color}`}
                        >
                          <Icon className="size-3.5 text-white" />
                        </div>
                        <span className="text-indigo-700">{tpl.label}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[240px] text-xs">
                      {tpl.description}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </>
          )}
        </div>
        <div className="border-t border-slate-200 p-2">
          <p className="text-[10px] text-slate-400">
            Drag onto canvas or click to add
          </p>
        </div>
      </div>
    </TooltipProvider>
  );
}
