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
  rag_pipeline: Box,
  parallel_analysis: Layers,
  human_in_the_loop: UserCheck,
  classifier_router: GitBranch,
  plan_and_execute: RefreshCw,
  validator_loop: RefreshCw,
  orchestrator: Layers,
  tool_pipeline: Box,
};

/** Tiny inline diagram preview for each template */
function TemplatePreview({ template }: { template: WorkflowTemplate }) {
  const nodeClass =
    "flex items-center justify-center rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[8px] font-medium text-slate-600";
  const arrowClass = "text-slate-300 text-[10px]";

  // Simple preview showing the flow pattern
  return (
    <div className="flex items-center gap-1 text-[8px]">
      <span className={nodeClass}>S</span>
      <span className={arrowClass}>→</span>
      <span className="truncate text-[9px] text-slate-500">{template.preview.replace("START → ", "").replace(" → END", "")}</span>
      <span className={arrowClass}>→</span>
      <span className={nodeClass}>E</span>
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
