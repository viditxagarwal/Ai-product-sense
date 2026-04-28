"use client";

import { useCallback, useRef, useState } from "react";
import { Send, Paperclip, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost } from "@/lib/api";
import { useThreadStore } from "@/stores/thread-store";
import { useExecutionStore } from "@/stores/execution-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";
import type { ThreadMessage, ThreadFile, ExecutionStep } from "@/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/api/v1";
const ACCEPTED_TYPES = ".pdf,.xlsx,.csv,.md,.txt,.json,.png,.jpg,.jpeg";

export default function ChatInput() {
  const { activeThreadId } = useWorkspaceStore();
  const { addLocalMessage } = useThreadStore();
  const {
    isStreaming,
    setStreaming,
    setActiveRun,
    addStep,
    updateStep,
    appendStepProgress,
    setStepFileEvent,
    setRunError,
    clearActiveRun,
  } = useExecutionStore();

  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Track the latest step_id for associating file events
  const lastStepIdRef = useRef<string | null>(null);

  const canSend =
    text.trim().length > 0 && !isStreaming && !sending && activeThreadId;

  const handleSend = useCallback(async () => {
    if (!canSend || !activeThreadId) return;

    const messageText = text.trim();
    setText("");
    setSending(true);

    try {
      // Upload any attached files first
      for (const file of files) {
        await apiPost<ThreadFile>(`/threads/${activeThreadId}/files`, {
          thread_id: activeThreadId,
          file_name: file.name,
          file_url: `/uploads/${file.name}`,
          file_type: file.type || "application/octet-stream",
          file_size_bytes: file.size,
          source: "user_upload",
        });
      }
      setFiles([]);

      // Create user message via API
      const userMsg = await apiPost<ThreadMessage>(
        `/threads/${activeThreadId}/messages`,
        {
          thread_id: activeThreadId,
          role: "user",
          content: messageText,
          message_type: "text",
        }
      );

      // Add user message to local list
      addLocalMessage(userMsg);

      // Add a placeholder execution trace message
      const tracePlaceholder: ThreadMessage = {
        id: `trace-${Date.now()}`,
        thread_id: activeThreadId,
        role: "assistant",
        content: "",
        message_type: "execution_trace",
        metadata: null,
        created_at: new Date().toISOString(),
      };
      addLocalMessage(tracePlaceholder);

      // Connect to WebSocket for execution streaming
      const token = document.cookie
        .split("; ")
        .find((c) => c.startsWith("sb-access-token="))
        ?.split("=")[1];

      const wsUrl = `${WS_BASE}/threads/${activeThreadId}/stream${
        token ? `?token=${token}` : ""
      }`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        clearActiveRun();
        setStreaming(true);
        ws.send(JSON.stringify({ type: "start_run", message: messageText }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWsEvent(data);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setStreaming(false);
        wsRef.current = null;
      };

      ws.onerror = () => {
        setStreaming(false);
        wsRef.current = null;
      };
    } catch {
      // Toast handled by api client
    } finally {
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSend, activeThreadId, text, files]);

  function handleWsEvent(data: Record<string, unknown>) {
    const type = data.type as string;

    switch (type) {
      // ── Run lifecycle ────────────────────────────────
      case "run_started": {
        setActiveRun({
          id: data.run_id as string,
          status: "running",
          step_count: (data.step_count as number) || 0,
        });
        break;
      }

      // ── Step lifecycle ───────────────────────────────
      case "step_started": {
        const stepId = data.step_id as string;
        lastStepIdRef.current = stepId;

        const step: ExecutionStep = {
          id: stepId,
          run_id: (data.run_id as string) || "",
          step_number: data.step_number as number,
          node_type: data.node_type as string,
          node_name: data.node_name as string,
          status: "running",
          duration_ms: null,
          tokens_used: 0,
          cost_usd: 0,
          tool_name: (data.tool_name as string) || null,
          tool_config: null,
          input_payload: null,
          output_payload: null,
          routing_decision: null,
          guardrails_fired: null,
          file_operation_type: "none",
          confidence_score: null,
          created_at: new Date().toISOString(),
        };
        addStep(step);
        break;
      }

      case "step_progress": {
        const stepId = data.step_id as string;
        const content = data.content as string;
        if (stepId && content) {
          appendStepProgress(stepId, content);
        }
        break;
      }

      case "step_completed": {
        const stepId = data.step_id as string;
        updateStep(stepId, {
          status: "completed",
          duration_ms: (data.duration_ms as number) || null,
          output_payload: { result_summary: data.result_summary as string },
          file_operation_type:
            (data.file_operation_type as ExecutionStep["file_operation_type"]) || "none",
        });
        break;
      }

      case "step_failed": {
        const stepId = data.step_id as string;
        updateStep(stepId, { status: "failed" });
        break;
      }

      // ── File events ──────────────────────────────────
      case "file_created": {
        const associatedStep = lastStepIdRef.current;
        if (associatedStep) {
          setStepFileEvent(associatedStep, {
            file_id: data.file_id as string,
            file_name: data.file_name as string,
            file_type: data.file_type as string,
            operation: "created",
          });
        }
        break;
      }

      case "file_modified": {
        const associatedStep = lastStepIdRef.current;
        if (associatedStep) {
          setStepFileEvent(associatedStep, {
            file_id: data.file_id as string,
            file_name: data.file_name as string,
            file_type: (data.file_type as string) || "",
            operation: "modified",
          });
        }
        break;
      }

      // ── Run completion ───────────────────────────────
      case "run_completed": {
        setActiveRun({
          id: data.run_id as string,
          status: "completed",
          total_duration_ms: data.total_duration_ms as number,
          total_tokens: data.total_tokens as number,
          total_cost_usd: data.total_cost_usd as number,
        });
        setStreaming(false);
        break;
      }

      case "run_failed": {
        setActiveRun({
          id: (data.run_id as string) || "",
          status: "failed",
        });
        setRunError((data.error as string) || "Execution failed");
        setStreaming(false);
        wsRef.current?.close();
        break;
      }

      // ── Assistant message ────────────────────────────
      case "assistant_message": {
        const content = data.content as string;
        if (content && activeThreadId) {
          const msg: ThreadMessage = {
            id: `assistant-${Date.now()}`,
            thread_id: activeThreadId,
            role: "assistant",
            content,
            message_type: "text",
            metadata: data.files ? { files: data.files } : null,
            created_at: new Date().toISOString(),
          };
          addLocalMessage(msg);
        }
        break;
      }

      // ── Error ────────────────────────────────────────
      case "error": {
        setRunError((data.message as string) || "Unknown error");
        break;
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  return (
    <div className="border-t bg-white px-4 py-3">
      {/* File chips */}
      {files.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {files.map((file, i) => (
            <span
              key={i}
              className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
            >
              {file.name}
              <button
                onClick={() => removeFile(i)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* File attach button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="mb-1 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          title="Attach files"
        >
          <Paperclip className="size-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files)
              setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
            e.target.value = "";
          }}
        />

        {/* Text area */}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming
              ? "Waiting for execution to complete..."
              : "Type a message..."
          }
          disabled={isStreaming}
          rows={1}
          className={cn(
            "flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm",
            "placeholder:text-slate-400",
            "focus:border-slate-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-slate-400",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "max-h-32"
          )}
          style={{ minHeight: "2.5rem" }}
          onInput={(e) => {
            const target = e.target as HTMLTextAreaElement;
            target.style.height = "auto";
            target.style.height = Math.min(target.scrollHeight, 128) + "px";
          }}
        />

        {/* Send button */}
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!canSend}
          className="mb-0.5"
        >
          {sending || isStreaming ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
