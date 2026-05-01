"use client";

import { useEffect, useState } from "react";
import {
  Shield,
  Check,
  X,
  Edit3,
  MessageSquare,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useExecutionStore } from "@/stores/execution-store";
import { getStoredToken } from "@/lib/api";
import { useWorkspaceStore } from "@/stores/workspace-store";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/api/v1";

export default function GateReviewPanel() {
  const { pendingGate, setPendingGate } = useExecutionStore();
  const { activeThreadId } = useWorkspaceStore();
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Timer
  useEffect(() => {
    if (!pendingGate) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - pendingGate.requestedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [pendingGate]);

  if (!pendingGate) return null;

  const actions = pendingGate.availableActions;

  async function sendAction(action: string) {
    if (!activeThreadId) return;
    setSending(true);
    try {
      // Send gate_review via the existing WS or create a temporary one
      const token = getStoredToken();
      const wsUrl = `${WS_BASE}/threads/${activeThreadId}/stream${
        token ? `?token=${token}` : ""
      }`;
      const ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "gate_review",
            action,
            comment: comment.trim(),
          })
        );
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "gate_review_ack") {
            setPendingGate(null);
            setComment("");
            setSending(false);
            ws.close();
          } else if (data.type === "error") {
            setSending(false);
          }
        } catch {
          setSending(false);
        }
      };
      ws.onclose = () => {
        setSending(false);
      };
      ws.onerror = () => {
        setSending(false);
      };
    } catch {
      setSending(false);
    }
  }

  const timeoutStr = pendingGate.waitDuration;

  return (
    <div className="border-t border-amber-200 bg-amber-50 px-4 py-3">
      <div className="flex items-center gap-2 mb-2">
        <Shield className="size-4 text-amber-600" />
        <span className="text-sm font-semibold text-amber-800">
          Gate Review Required
        </span>
        <span className="ml-auto flex items-center gap-1 text-xs text-amber-600">
          <Clock className="size-3" />
          {elapsed}s elapsed
          {timeoutStr && (
            <span className="text-amber-400"> / timeout: {timeoutStr}</span>
          )}
        </span>
      </div>

      <p className="text-xs font-medium text-amber-700 mb-1">
        {pendingGate.nodeName}
      </p>

      {pendingGate.reviewInstructions && (
        <p className="text-xs text-amber-600 mb-2">
          {pendingGate.reviewInstructions}
        </p>
      )}

      {pendingGate.previousOutput && (
        <div className="mb-2 max-h-32 overflow-auto rounded border border-amber-200 bg-white p-2 text-xs text-slate-700">
          {pendingGate.previousOutput.slice(0, 1000)}
          {pendingGate.previousOutput.length > 1000 && "..."}
        </div>
      )}

      {pendingGate.onTimeout && (
        <div className="mb-2 flex items-center gap-1 text-[10px] text-amber-500">
          <AlertTriangle className="size-2.5" />
          On timeout: {pendingGate.onTimeout}
        </div>
      )}

      {/* Comment */}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Add a comment (optional)..."
        rows={2}
        className="mb-2 w-full rounded border border-amber-200 bg-white px-2 py-1.5 text-xs placeholder:text-amber-300 focus:outline-none focus:ring-1 focus:ring-amber-400"
      />

      {/* Action buttons */}
      <div className="flex items-center gap-2">
        {(actions.approve ?? true) && (
          <Button
            size="sm"
            onClick={() => sendAction("approve")}
            disabled={sending}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
          >
            <Check className="size-3" />
            Approve
          </Button>
        )}
        {actions.rejectWithReason && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => sendAction("reject")}
            disabled={sending}
            className="border-red-300 text-red-600 hover:bg-red-50 text-xs gap-1"
          >
            <X className="size-3" />
            Reject
          </Button>
        )}
        {actions.editAndApprove && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => sendAction("edit_and_approve")}
            disabled={sending}
            className="text-xs gap-1"
          >
            <Edit3 className="size-3" />
            Edit & Approve
          </Button>
        )}
        {actions.addCommentAndContinue && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => sendAction("add_comment_and_continue")}
            disabled={sending}
            className="text-xs gap-1"
          >
            <MessageSquare className="size-3" />
            Comment & Continue
          </Button>
        )}
      </div>
    </div>
  );
}
