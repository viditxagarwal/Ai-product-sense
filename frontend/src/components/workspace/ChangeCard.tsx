"use client";

import { useState } from "react";
import { Check, X, MessageCircleQuestion, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiPatch } from "@/lib/api";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useThreadStore } from "@/stores/thread-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { FileChange, ThreadMessage } from "@/types";

interface ChangeCardProps {
  change: FileChange;
  onUpdate: (id: string, status: FileChange["status"]) => void;
}

const STATUS_STYLES: Record<
  FileChange["status"],
  { bg: string; text: string; label: string }
> = {
  pending: { bg: "bg-amber-50", text: "text-amber-600", label: "Pending" },
  accepted: { bg: "bg-emerald-50", text: "text-emerald-600", label: "Accepted" },
  rejected: { bg: "bg-red-50", text: "text-red-600", label: "Rejected" },
  reverted: { bg: "bg-slate-100", text: "text-slate-500", label: "Reverted" },
};

export default function ChangeCard({ change, onUpdate }: ChangeCardProps) {
  const [resolving, setResolving] = useState<"accept" | "reject" | null>(null);
  const { activeThreadId } = useWorkspaceStore();
  const { addLocalMessage } = useThreadStore();

  const style = STATUS_STYLES[change.status];
  const isPending = change.status === "pending";
  const downstreamCount =
    (change.downstream_impact as Record<string, unknown> | null)?.affected_cells_count as
      | number
      | undefined;

  async function handleResolve(status: "accepted" | "rejected") {
    setResolving(status === "accepted" ? "accept" : "reject");
    try {
      await apiPatch<FileChange>(`/changes/${change.id}`, { status });
      onUpdate(change.id, status);
      if (status === "rejected") {
        toast.info(
          "Change rejected. In production, downstream cells would be recalculated."
        );
      }
    } catch {
      // Toast handled by api client
    } finally {
      setResolving(null);
    }
  }

  function handleAskWhy() {
    if (!activeThreadId) return;

    const question = `Why was ${change.location} changed from "${change.old_value}" to "${change.new_value}"?`;

    // Add as a local user message and switch to chat
    const msg: ThreadMessage = {
      id: `ask-${Date.now()}`,
      thread_id: activeThreadId,
      role: "user",
      content: question,
      message_type: "text",
      metadata: {
        change_context: {
          change_id: change.id,
          location: change.location,
          old_value: change.old_value,
          new_value: change.new_value,
        },
      },
      created_at: new Date().toISOString(),
    };
    addLocalMessage(msg);

    // Note: In v1, we just add the message locally.
    // The user can then press send or the AI can auto-respond.
  }

  return (
    <div
      className={cn(
        "rounded-lg border transition-all duration-200",
        isPending ? "border-slate-200" : "border-transparent",
        change.status === "accepted" && "border-emerald-200 bg-emerald-50/30",
        change.status === "rejected" && "border-red-200 bg-red-50/30",
        change.status === "reverted" && "opacity-50"
      )}
    >
      <div className="px-3 py-2.5">
        {/* Header: location + status badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-700">
            {change.location}
          </span>
          <Badge
            variant="secondary"
            className={cn("text-[10px]", style.bg, style.text)}
          >
            {style.label}
          </Badge>
          <span className="text-[10px] text-slate-400">
            {change.change_type === "cell_modify" ? "Cell" : "Line"}
          </span>
        </div>

        {/* Diff: old → new */}
        <div className="mt-2 space-y-1">
          <div className="flex items-start gap-1.5">
            <span className="mt-0.5 shrink-0 rounded bg-red-100 px-1 text-[10px] font-medium text-red-600">
              −
            </span>
            <pre className="flex-1 overflow-x-auto rounded bg-red-50 px-2 py-1 text-xs text-red-700">
              {change.old_value}
            </pre>
          </div>
          <div className="flex items-start gap-1.5">
            <span className="mt-0.5 shrink-0 rounded bg-emerald-100 px-1 text-[10px] font-medium text-emerald-600">
              +
            </span>
            <pre className="flex-1 overflow-x-auto rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
              {change.new_value}
            </pre>
          </div>
        </div>

        {/* AI's reason */}
        {change.reason && (
          <p className="mt-2 text-[11px] italic text-slate-500">
            {change.reason}
          </p>
        )}

        {/* Downstream impact */}
        {downstreamCount != null && downstreamCount > 0 && (
          <div className="mt-1.5">
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
              Affects {downstreamCount} downstream cell
              {downstreamCount > 1 ? "s" : ""}
            </span>
          </div>
        )}

        {/* Actions */}
        {isPending && (
          <div className="mt-2.5 flex items-center gap-1.5">
            <Button
              size="sm"
              onClick={() => handleResolve("accepted")}
              disabled={resolving !== null}
              className="h-6 gap-1 bg-emerald-600 px-2 text-[10px] hover:bg-emerald-700"
            >
              {resolving === "accept" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Check className="size-3" />
              )}
              Accept
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleResolve("rejected")}
              disabled={resolving !== null}
              className="h-6 gap-1 border-red-200 px-2 text-[10px] text-red-600 hover:bg-red-50"
            >
              {resolving === "reject" ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <X className="size-3" />
              )}
              Reject
            </Button>
            <button
              onClick={handleAskWhy}
              className="ml-auto flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-700"
            >
              <MessageCircleQuestion className="size-3" />
              Ask why?
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
