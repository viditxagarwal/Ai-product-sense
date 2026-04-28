"use client";

import { useEffect, useState } from "react";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiGet, apiPost } from "@/lib/api";
import type { PMAnnotation } from "@/types";

interface AnnotationInputProps {
  stepId: string;
}

export default function AnnotationInput({ stepId }: AnnotationInputProps) {
  const [annotations, setAnnotations] = useState<PMAnnotation[]>([]);
  const [showInput, setShowInput] = useState(false);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Fetch existing annotations
  useEffect(() => {
    setLoading(true);
    apiGet<PMAnnotation[]>(`/steps/${stepId}/annotations`)
      .then(setAnnotations)
      .catch(() => setAnnotations([]))
      .finally(() => setLoading(false));
  }, [stepId]);

  async function handleSave() {
    if (!text.trim()) return;
    setSaving(true);
    try {
      const annotation = await apiPost<PMAnnotation>(
        `/steps/${stepId}/annotations`,
        { annotation_text: text.trim() }
      );
      setAnnotations((prev) => [...prev, annotation]);
      setText("");
      setShowInput(false);
    } catch {
      // Toast handled by api client
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* Existing annotations */}
      {annotations.length > 0 && (
        <div className="space-y-1.5">
          {annotations.map((a) => (
            <div
              key={a.id}
              className="rounded border border-yellow-200 bg-yellow-50 px-2.5 py-1.5"
            >
              <p className="text-xs text-yellow-800">{a.annotation_text}</p>
              <span className="mt-0.5 block text-[10px] text-yellow-500">
                {new Date(a.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      )}

      {loading && annotations.length === 0 && (
        <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
      )}

      {/* Add annotation */}
      {showInput ? (
        <div className="space-y-1.5">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add your notes about this step..."
            rows={2}
            className="w-full resize-none rounded border border-slate-200 bg-white px-2 py-1.5 text-xs placeholder:text-slate-300 focus:border-slate-400 focus:outline-none"
            autoFocus
          />
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!text.trim() || saving}
              className="h-6 px-2 text-[10px]"
            >
              {saving ? <Loader2 className="size-3 animate-spin" /> : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowInput(false);
                setText("");
              }}
              className="h-6 px-2 text-[10px]"
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="flex items-center gap-1 text-[10px] font-medium text-slate-400 transition-colors hover:text-slate-600"
        >
          <Plus className="size-3" />
          Add annotation
        </button>
      )}
    </div>
  );
}
