"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, FileText, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CardGridSkeleton } from "@/components/ui/skeletons";
import { usePromptStore } from "@/stores/prompt-store";
import type { PromptVersionResponse } from "@/types";

interface PromptGroup {
  promptName: string;
  versions: PromptVersionResponse[];
  latest: PromptVersionResponse;
}

function groupPrompts(prompts: PromptVersionResponse[]): PromptGroup[] {
  const map = new Map<string, PromptVersionResponse[]>();
  for (const p of prompts) {
    const existing = map.get(p.prompt_name) || [];
    existing.push(p);
    map.set(p.prompt_name, existing);
  }

  const groups: PromptGroup[] = Array.from(map.entries()).map(
    ([promptName, versions]) => {
      const sorted = [...versions].sort(
        (a, b) => b.version_number - a.version_number
      );
      return { promptName, versions: sorted, latest: sorted[0] };
    }
  );

  return groups.sort((a, b) => a.promptName.localeCompare(b.promptName));
}

const PRESET_LABELS: Record<string, string> = {
  cautious: "Cautious",
  balanced: "Balanced",
  detailed: "Detailed",
  decisive: "Decisive",
  concise: "Concise",
};

export default function PromptList() {
  const router = useRouter();
  const { prompts, loading, fetchPrompts, createPrompt, fetchPresets } =
    usePromptStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [presetSource, setPresetSource] = useState<string>("blank");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchPrompts();
    fetchPresets();
  }, [fetchPrompts, fetchPresets]);

  const groups = groupPrompts(prompts);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const prompt = await createPrompt({
        prompt_name: newName.trim(),
        ...(presetSource !== "blank"
          ? { preset_source: presetSource }
          : { prompt_text: "" }),
      });
      setDialogOpen(false);
      setNewName("");
      setPresetSource("blank");
      router.push(`/prompts/${prompt.id}`);
    } finally {
      setCreating(false);
    }
  };

  if (loading && prompts.length === 0) {
    return <CardGridSkeleton count={3} />;
  }

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="mx-auto mb-3 size-10 text-slate-300" />
            <p className="text-sm text-muted-foreground">
              No prompts yet. Create your first prompt to get started.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => (
            <Card
              key={group.promptName}
              className="cursor-pointer transition-all hover:shadow-md"
              onClick={() => router.push(`/prompts/${group.latest.id}`)}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold">
                      {group.promptName}
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {group.versions.length}{" "}
                      {group.versions.length === 1 ? "version" : "versions"} ·
                      Latest: v{group.latest.version_number}
                    </p>
                  </div>
                  {group.latest.preset_source && (
                    <Badge
                      variant="secondary"
                      className="ml-2 shrink-0 bg-violet-50 text-[10px] text-violet-700"
                    >
                      <Sparkles className="mr-1 size-3" />
                      {PRESET_LABELS[group.latest.preset_source] ??
                        group.latest.preset_source}
                    </Badge>
                  )}
                </div>
                <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                  {group.latest.prompt_text
                    ? group.latest.prompt_text.slice(0, 150) +
                      (group.latest.prompt_text.length > 150 ? "..." : "")
                    : "Empty prompt"}
                </p>
                <p className="mt-2 text-[10px] text-slate-400">
                  {new Date(group.latest.created_at).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="mr-1 size-4" />
            New Prompt
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Prompt</DialogTitle>
            <DialogDescription>
              Start from a blank prompt or choose a preset as a starting point.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Prompt Name</Label>
              <Input
                placeholder="e.g., Conservative Analysis"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Starting Point</Label>
              <Select value={presetSource} onValueChange={setPresetSource}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blank">Blank Prompt</SelectItem>
                  <SelectItem value="cautious">Cautious</SelectItem>
                  <SelectItem value="balanced">Balanced</SelectItem>
                  <SelectItem value="detailed">Detailed</SelectItem>
                  <SelectItem value="decisive">Decisive</SelectItem>
                  <SelectItem value="concise">Concise</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
            >
              {creating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
