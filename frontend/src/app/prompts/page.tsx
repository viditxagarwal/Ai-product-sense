"use client";

import { useState } from "react";
import { GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import PromptList from "@/components/prompts/PromptList";
import PromptDiff from "@/components/prompts/PromptDiff";
import { usePromptStore } from "@/stores/prompt-store";

export default function PromptsPage() {
  const { prompts } = usePromptStore();
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLeftId, setDiffLeftId] = useState("");
  const [diffRightId, setDiffRightId] = useState("");

  const openCompare = () => {
    if (prompts.length >= 2) {
      setDiffLeftId(prompts[1].id);
      setDiffRightId(prompts[0].id);
      setDiffOpen(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Prompt Lab</h1>
          <p className="text-sm text-muted-foreground">
            Create, version, and compare system prompts. Prompts are free-text —
            write in natural language.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={openCompare}
          disabled={prompts.length < 2}
        >
          <GitCompare className="mr-1 size-4" />
          Compare Versions
        </Button>
      </div>

      <PromptList />

      {prompts.length >= 2 && (
        <PromptDiff
          open={diffOpen}
          onOpenChange={setDiffOpen}
          versions={prompts}
          leftId={diffLeftId}
          rightId={diffRightId}
          onLeftChange={setDiffLeftId}
          onRightChange={setDiffRightId}
        />
      )}
    </div>
  );
}
