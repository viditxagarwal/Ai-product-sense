"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from "./workflowTemplates";
import {
  RefreshCw,
  ArrowRight,
  GitBranch,
  Layers,
  UserCheck,
  Box,
  LayoutGrid,
} from "lucide-react";

const PREVIEW_ICONS: Record<string, typeof Box> = {
  react_agent: RefreshCw,
  simple_chain: ArrowRight,
  parallel_analysis: Layers,
  chain_with_validation: RefreshCw,
  human_in_the_loop: UserCheck,
  classifier_router: GitBranch,
  blank: Box,
};

/** Tiny inline diagram preview for each template */
function TemplatePreview({ template }: { template: WorkflowTemplate }) {
  const id = template.id;

  const nodeClass =
    "flex items-center justify-center rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[8px] font-medium text-slate-600";
  const arrowClass = "text-slate-300 text-[10px]";
  const loopClass =
    "rounded-full border border-teal-300 bg-teal-50 px-1 py-0.5 text-[7px] text-teal-600";

  if (id === "react_agent") {
    return (
      <div className="flex items-center gap-1">
        <span className={nodeClass}>Step</span>
        <span className={arrowClass}>↔</span>
        <span className={nodeClass}>Decision</span>
        <span className={loopClass}>loop</span>
      </div>
    );
  }
  if (id === "simple_chain") {
    return (
      <div className="flex items-center gap-1">
        <span className={nodeClass}>Step</span>
        <span className={arrowClass}>→</span>
        <span className={nodeClass}>Step</span>
        <span className={arrowClass}>→</span>
        <span className={nodeClass}>Step</span>
      </div>
    );
  }
  if (id === "parallel_analysis") {
    return (
      <div className="flex items-center gap-1">
        <span className={nodeClass}>Step</span>
        <span className={arrowClass}>→</span>
        <span className="rounded border border-purple-200 bg-purple-50 px-1 py-0.5 text-[8px] text-purple-600">
          Parallel
        </span>
        <span className={arrowClass}>→</span>
        <span className={nodeClass}>Step</span>
      </div>
    );
  }
  if (id === "chain_with_validation") {
    return (
      <div className="flex items-center gap-1">
        <span className={nodeClass}>Step</span>
        <span className={arrowClass}>→</span>
        <span className={nodeClass}>Step</span>
        <span className={arrowClass}>→</span>
        <span className="rounded border border-orange-200 bg-orange-50 px-1 py-0.5 text-[8px] text-orange-600">
          Decision
        </span>
        <span className={loopClass}>loop</span>
      </div>
    );
  }
  if (id === "human_in_the_loop") {
    return (
      <div className="flex items-center gap-1">
        <span className={nodeClass}>Step</span>
        <span className={arrowClass}>→</span>
        <span className="rounded border border-amber-200 bg-amber-50 px-1 py-0.5 text-[8px] text-amber-600">
          Human
        </span>
        <span className={arrowClass}>→</span>
        <span className={nodeClass}>Step</span>
      </div>
    );
  }
  if (id === "classifier_router") {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex items-center gap-1">
          <span className={nodeClass}>Step</span>
          <span className={arrowClass}>→</span>
          <span className="rounded border border-orange-200 bg-orange-50 px-1 py-0.5 text-[8px] text-orange-600">
            Decision
          </span>
        </div>
        <div className="flex items-center gap-1">
          <span className={arrowClass}>↙</span>
          <span className={arrowClass}>↓</span>
          <span className={arrowClass}>↘</span>
        </div>
        <div className="flex items-center gap-0.5">
          <span className={nodeClass}>A</span>
          <span className={nodeClass}>B</span>
          <span className={nodeClass}>C</span>
        </div>
      </div>
    );
  }
  // blank
  return (
    <div className="flex items-center gap-1">
      <span className={nodeClass}>Step</span>
    </div>
  );
}

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: WorkflowTemplate) => void;
  mode?: "create" | "insert"; // "create" = new workflow, "insert" = merge into existing
}

export default function TemplatePicker({
  open,
  onOpenChange,
  onSelect,
  mode = "create",
}: TemplatePickerProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LayoutGrid className="size-5" />
            {mode === "create" ? "Start from a pattern" : "Insert a pattern"}
          </DialogTitle>
          <DialogDescription>
            {mode === "create"
              ? "Choose a workflow pattern to pre-wire your canvas. You can customize everything after."
              : "Select a pattern to add to your existing canvas."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2 sm:grid-cols-3">
          {WORKFLOW_TEMPLATES.map((tpl) => {
            const Icon = PREVIEW_ICONS[tpl.id] || Box;
            const isBlank = tpl.id === "blank";
            const isReAct = tpl.id === "react_agent";

            return (
              <button
                key={tpl.id}
                onClick={() => onSelect(tpl)}
                className={`group flex flex-col rounded-lg border-2 p-3 text-left transition-all hover:shadow-md ${
                  isReAct
                    ? "col-span-2 border-blue-300 bg-blue-50/30 ring-1 ring-blue-200 hover:border-blue-400 sm:col-span-2"
                    : isBlank
                      ? "border-dashed border-slate-300 hover:border-slate-400"
                      : "border-slate-200 hover:border-blue-300"
                }`}
              >
                {/* Header with icon + name */}
                <div className="flex items-center gap-2">
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded ${tpl.color}`}
                  >
                    <Icon className="size-3.5 text-white" />
                  </div>
                  <span className="text-sm font-semibold text-slate-800">
                    {tpl.label}
                  </span>
                  {isReAct && (
                    <Badge className="bg-blue-500 text-[9px] text-white hover:bg-blue-500">
                      Most Popular
                    </Badge>
                  )}
                </div>

                {/* Visual preview */}
                <div className="mt-2.5 flex min-h-[32px] items-center justify-center rounded bg-slate-50 px-2 py-1.5">
                  <TemplatePreview template={tpl} />
                </div>

                {/* Description */}
                <p className="mt-2 text-[11px] leading-snug text-slate-500">
                  {tpl.description}
                </p>

                {/* Use case badge */}
                <Badge
                  variant="secondary"
                  className="mt-2 w-fit text-[9px] font-normal text-slate-500"
                >
                  {tpl.useCase}
                </Badge>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
