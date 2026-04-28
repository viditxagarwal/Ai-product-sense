"use client";

import { useState, useCallback } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface BasePromptEditorProps {
  value: string;
  onSave: (value: string) => Promise<void>;
}

export default function BasePromptEditor({
  value,
  onSave,
}: BasePromptEditorProps) {
  const [text, setText] = useState(value);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleBlur = useCallback(async () => {
    if (text === value) return;
    setSaving(true);
    setSaved(false);
    try {
      await onSave(text);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  }, [text, value, onSave]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Base Prompt</Label>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {saving && <span>Saving...</span>}
          {saved && <span className="text-green-600">Saved</span>}
          <span>{text.length} chars</span>
        </div>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        placeholder="Enter the enterprise base prompt for this domain. This prompt is prepended to all agent interactions within this domain..."
        rows={8}
        className="resize-y font-mono text-sm"
      />
      <p className="text-xs text-muted-foreground">
        The base prompt is applied to all agent interactions in this domain. It
        sets the enterprise context and constraints.
      </p>
    </div>
  );
}
