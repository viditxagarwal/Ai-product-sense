"use client";

import { Badge } from "@/components/ui/badge";

interface PromptPreviewProps {
  domainBasePrompt?: string;
  systemPrompt: string;
}

export default function PromptPreview({
  domainBasePrompt,
  systemPrompt,
}: PromptPreviewProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Compiled Prompt Preview</h3>
      <p className="text-[11px] text-muted-foreground">
        Full prompt stack sent to the LLM at runtime.
      </p>

      <div className="space-y-2">
        {/* Layer: Domain Base Prompt */}
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3">
          <div className="mb-1 flex items-center gap-2">
            <Badge
              variant="secondary"
              className="text-[9px] uppercase tracking-wider"
            >
              Domain Base Prompt
            </Badge>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-400">
            {domainBasePrompt ||
              "[Injected from the selected domain at runtime]"}
          </pre>
        </div>

        {/* Layer: This System Prompt */}
        <div className="rounded-md border border-blue-200 bg-blue-50/50 p-3">
          <div className="mb-1 flex items-center gap-2">
            <Badge className="bg-blue-100 text-[9px] uppercase tracking-wider text-blue-700 hover:bg-blue-100">
              System Prompt
            </Badge>
            <span className="text-[9px] text-blue-500">← You are here</span>
          </div>
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-mono text-[11px] text-slate-700">
            {systemPrompt || "[Empty]"}
          </pre>
        </div>

        {/* Layer: Configuration Parameters */}
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 p-3">
          <div className="mb-1 flex items-center gap-2">
            <Badge
              variant="secondary"
              className="text-[9px] uppercase tracking-wider"
            >
              Configuration Parameters
            </Badge>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[11px] text-slate-400">
            {[
              "temperature: [from config]",
              "risk_tolerance: [from config]",
              "detail_level: [from config]",
              "few_shot_examples: [from config]",
              "...",
            ].join("\n")}
          </pre>
        </div>
      </div>
    </div>
  );
}
