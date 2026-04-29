"use client";

import { NODE_TYPE_CONFIGS } from "./nodeTypes";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface NodeToolbarProps {
  onAddNode: (nodeType: string) => void;
}

export default function NodeToolbar({ onAddNode }: NodeToolbarProps) {
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
