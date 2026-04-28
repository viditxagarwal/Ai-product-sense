"use client";

import { Info } from "lucide-react";
import PlatformKnowledge from "@/components/knowledge/PlatformKnowledge";
import EnterpriseKnowledgeSummary from "@/components/knowledge/EnterpriseKnowledgeSummary";
import TaskLevelPlaceholder from "@/components/knowledge/TaskLevelPlaceholder";

export default function KnowledgePage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Knowledge Base</h1>
        <p className="text-sm text-muted-foreground">
          Three-layer knowledge architecture powering AI context and retrieval.
        </p>
      </div>

      <PlatformKnowledge />

      <hr className="border-slate-200" />

      <EnterpriseKnowledgeSummary />

      <hr className="border-slate-200" />

      <TaskLevelPlaceholder />

      <div className="flex items-start gap-2 rounded-md bg-slate-50 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-slate-400" />
        <p className="text-sm italic text-muted-foreground">
          Knowledge retrieval settings (chunk size, embedding model, top-k,
          reranking) are configured in the Configuration. This screen manages
          what knowledge exists. The Configuration defines how it is used.
        </p>
      </div>
    </div>
  );
}
