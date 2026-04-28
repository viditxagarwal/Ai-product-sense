"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EditorSkeleton } from "@/components/ui/skeletons";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import { usePromptStore } from "@/stores/prompt-store";
import { apiGet } from "@/lib/api";
import PromptPreview from "./PromptPreview";
import VersionHistory from "./VersionHistory";
import PromptDiff from "./PromptDiff";
import type {
  PromptVersionResponse,
  PaginatedResponse,
} from "@/types";

interface PromptEditorProps {
  promptId: string;
}

export default function PromptEditor({ promptId }: PromptEditorProps) {
  const router = useRouter();
  const { currentPrompt, fetchPrompt, createPrompt, loading } =
    usePromptStore();

  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // All versions of this prompt name
  const [allVersions, setAllVersions] = useState<PromptVersionResponse[]>([]);

  // "Save as New Prompt" dialog
  const [newNameDialogOpen, setNewNameDialogOpen] = useState(false);
  const [newPromptName, setNewPromptName] = useState("");

  // Diff dialog
  const [diffOpen, setDiffOpen] = useState(false);
  const [diffLeftId, setDiffLeftId] = useState("");
  const [diffRightId, setDiffRightId] = useState("");

  useEffect(() => {
    fetchPrompt(promptId);
  }, [promptId, fetchPrompt]);

  const loadVersions = useCallback(async () => {
    if (!currentPrompt) return;
    try {
      const res = await apiGet<PaginatedResponse<PromptVersionResponse>>(
        `/prompts?per_page=100`
      );
      const matching = res.data
        .filter((p) => p.prompt_name === currentPrompt.prompt_name)
        .sort((a, b) => b.version_number - a.version_number);
      setAllVersions(matching);
    } catch {
      // non-critical
    }
  }, [currentPrompt]);

  useEffect(() => {
    if (currentPrompt) {
      setText(currentPrompt.prompt_text);
      setDirty(false);
      loadVersions();
    }
  }, [currentPrompt, loadVersions]);

  const handleTextChange = (value: string) => {
    setText(value);
    setDirty(true);
  };

  const handleSaveNewVersion = async () => {
    if (!currentPrompt) return;
    setSaving(true);
    try {
      const created = await createPrompt({
        prompt_name: currentPrompt.prompt_name,
        prompt_text: text,
      });
      router.push(`/prompts/${created.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAsNewPrompt = async () => {
    if (!newPromptName.trim()) return;
    setSaving(true);
    try {
      const created = await createPrompt({
        prompt_name: newPromptName.trim(),
        prompt_text: text,
      });
      setNewNameDialogOpen(false);
      setNewPromptName("");
      router.push(`/prompts/${created.id}`);
    } finally {
      setSaving(false);
    }
  };

  const handleCompare = (versionId: string) => {
    setDiffLeftId(versionId);
    setDiffRightId(promptId);
    setDiffOpen(true);
  };

  if (loading || !currentPrompt) {
    return <EditorSkeleton />;
  }

  return (
    <>
      <div className="flex h-full gap-6">
        {/* Main editor area */}
        <div className="min-w-0 flex-1 space-y-4">
          {/* Header */}
          <div>
            <Breadcrumbs
              items={[
                { label: "Prompts", href: "/prompts" },
                { label: `${currentPrompt.prompt_name} v${currentPrompt.version_number}` },
              ]}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/prompts")}
              className="mb-3"
            >
              <ArrowLeft className="mr-1 size-4" />
              Back to Prompts
            </Button>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold tracking-tight">
                  {currentPrompt.prompt_name}
                </h1>
                <Badge variant="secondary">
                  v{currentPrompt.version_number}
                </Badge>
                {currentPrompt.preset_source && (
                  <Badge className="bg-violet-50 text-[10px] text-violet-700 hover:bg-violet-50">
                    Preset: {currentPrompt.preset_source}
                  </Badge>
                )}
                {dirty && (
                  <Badge className="bg-amber-50 text-[10px] text-amber-700 hover:bg-amber-50">
                    Unsaved changes
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setNewPromptName("");
                    setNewNameDialogOpen(true);
                  }}
                >
                  <FilePlus className="mr-1 size-4" />
                  Save as New Prompt
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveNewVersion}
                  disabled={saving || !dirty}
                >
                  <Save className="mr-1 size-4" />
                  {saving ? "Saving..." : "Save as New Version"}
                </Button>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Created {new Date(currentPrompt.created_at).toLocaleDateString()}
              {currentPrompt.tags.length > 0 &&
                ` · Tags: ${currentPrompt.tags.join(", ")}`}
            </p>
          </div>

          {/* Editor */}
          <Textarea
            className="min-h-[500px] resize-y font-mono text-sm leading-relaxed"
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            placeholder="Write your system prompt here..."
            rows={20}
          />

          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{text.length} characters</span>
            <span>~{Math.ceil(text.length / 4)} tokens (estimate)</span>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-80 shrink-0 space-y-6 border-l border-slate-200 pl-6">
          <PromptPreview systemPrompt={text} />

          <hr className="border-slate-200" />

          <VersionHistory
            versions={allVersions}
            currentId={promptId}
            onCompare={handleCompare}
          />
        </div>
      </div>

      {/* Save as New Prompt dialog */}
      <Dialog open={newNameDialogOpen} onOpenChange={setNewNameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save as New Prompt</DialogTitle>
            <DialogDescription>
              This will create a new prompt (v1) with the current text.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>New Prompt Name</Label>
            <Input
              placeholder="e.g., Aggressive Analysis"
              value={newPromptName}
              onChange={(e) => setNewPromptName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNewNameDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveAsNewPrompt}
              disabled={!newPromptName.trim() || saving}
            >
              {saving ? "Saving..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Diff dialog */}
      {allVersions.length >= 2 && (
        <PromptDiff
          open={diffOpen}
          onOpenChange={setDiffOpen}
          versions={allVersions}
          leftId={diffLeftId}
          rightId={diffRightId}
          onLeftChange={setDiffLeftId}
          onRightChange={setDiffRightId}
        />
      )}
    </>
  );
}
