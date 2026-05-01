"use client";

import { useCallback, useRef, useState } from "react";
import { Send, Paperclip, Loader2, X, Crosshair, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiPost, getStoredToken } from "@/lib/api";
import { useThreadStore } from "@/stores/thread-store";
import { useExecutionStore } from "@/stores/execution-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";
import type { ThreadMessage, ThreadFile, ExecutionStep } from "@/types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/api/v1";
const ACCEPTED_TYPES = ".pdf,.xlsx,.csv,.md,.txt,.json,.png,.jpg,.jpeg";

// ── Debug logger ─────────────────────────────────────────────
type DebugEntry = { ts: string; level: "info" | "warn" | "error"; msg: string };
const MAX_DEBUG_ENTRIES = 200;
let _debugLog: DebugEntry[] = [];
const _debugListeners: Set<() => void> = new Set();

function wsLog(level: DebugEntry["level"], msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  const entry = { ts, level, msg };
  _debugLog = [..._debugLog.slice(-(MAX_DEBUG_ENTRIES - 1)), entry];
  _debugListeners.forEach((fn) => fn());
  const consoleFn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  consoleFn(`[WS ${ts}] ${msg}`);
}

/** Subscribe to debug log changes. Returns unsubscribe function. */
export function useWsDebugLog() {
  const [log, setLog] = useState<DebugEntry[]>(_debugLog);
  const subRef = useRef<() => void>();
  if (!subRef.current) {
    const update = () => setLog([..._debugLog]);
    _debugListeners.add(update);
    subRef.current = update;
  }
  // Cleanup handled by the debug panel itself
  return log;
}

export function clearWsDebugLog() {
  _debugLog = [];
  _debugListeners.forEach((fn) => fn());
}

export default function ChatInput() {
  const { activeThreadId, selectedStepId, setSelectedStepId } = useWorkspaceStore();
  const { inspectorSteps } = useExecutionStore();
  const { addLocalMessage, updateLocalMessage } = useThreadStore();
  const {
    isStreaming,
    setStreaming,
    setActiveRun,
    addStep,
    updateStep,
    appendStepProgress,
    setStepFileEvent,
    setRunError,
    appendStreamingText,
    appendStreamingThinkingText,
    setIsThinking,
    clearStreamingText,
    setPendingGate,
    addLiveTool,
    updateLiveTool,
    addActivityEntry,
  } = useExecutionStore();

  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [wsDisconnected, setWsDisconnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastStepIdRef = useRef<string | null>(null);
  const reconnectAttemptRef = useRef(0);
  const pendingMessageRef = useRef<string | null>(null);
  const tracePlaceholderIdRef = useRef<string | null>(null);

  const canSend =
    text.trim().length > 0 && !isStreaming && !sending && activeThreadId;

  // Connect to WebSocket and send start_run. Used by both initial send and reconnect.
  const connectWs = useCallback(
    (messageText: string) => {
      if (!activeThreadId) return;

      const token = getStoredToken();
      wsLog(token ? "info" : "error", `Token: ${token ? `${token.slice(0, 20)}...` : "MISSING — getStoredToken() returned null"}`);

      const wsUrl = `${WS_BASE}/threads/${activeThreadId}/stream${
        token ? `?token=${token}` : ""
      }`;
      wsLog("info", `Connecting to ${wsUrl.replace(/token=.*/, "token=<redacted>")}`);
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        wsLog("info", "WebSocket OPEN");
        setStreaming(true);
        setWsDisconnected(false);
        reconnectAttemptRef.current = 0;
        const payload = { type: "start_run", message: messageText };
        wsLog("info", `Sending: ${JSON.stringify(payload).slice(0, 200)}`);
        ws.send(JSON.stringify(payload));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const eventType = data.type || "unknown";
          if (eventType === "error") {
            wsLog("error", `Server error: ${data.message || JSON.stringify(data)}`);
          } else if (eventType === "step_progress") {
            wsLog("info", `Event: ${eventType} step=${data.step_id?.slice(0, 8)}`);
          } else {
            wsLog("info", `Event: ${eventType} ${JSON.stringify(data).slice(0, 150)}`);
          }
          handleWsEvent(data);
        } catch {
          wsLog("warn", `Failed to parse WS message: ${String(event.data).slice(0, 200)}`);
        }
      };

      ws.onclose = (event) => {
        wsLog(event.code === 1000 ? "info" : "warn",
          `WebSocket CLOSED code=${event.code} reason="${event.reason || "none"}" wasClean=${event.wasClean}`);
        wsRef.current = null;
        // Only show disconnection if we were still streaming (unexpected close)
        if (isStreaming && event.code !== 1000) {
          setWsDisconnected(true);
          const attempt = reconnectAttemptRef.current;
          if (attempt < 5) {
            const delay = Math.min(1000 * Math.pow(2, attempt), 16000);
            reconnectAttemptRef.current = attempt + 1;
            wsLog("warn", `Reconnecting in ${delay}ms (attempt ${attempt + 1}/5)`);
            setTimeout(() => {
              const msg = pendingMessageRef.current;
              if (msg) connectWs(msg);
            }, delay);
          } else {
            wsLog("error", "Max reconnect attempts (5) reached. Giving up.");
            setStreaming(false);
            pendingMessageRef.current = null;
          }
        } else {
          setStreaming(false);
          pendingMessageRef.current = null;
        }
      };

      ws.onerror = () => {
        wsLog("error", `WebSocket ERROR event fired (details in browser devtools Network tab)`);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeThreadId, isStreaming]
  );

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

      // Build metadata with inspector context if a step is selected
      const selectedStep = selectedStepId
        ? inspectorSteps.find((s) => s.id === selectedStepId)
        : null;
      const metadata: Record<string, unknown> | undefined = selectedStep
        ? {
            inspector_context: {
              step_id: selectedStep.id,
              step_number: selectedStep.step_number,
              node_name: selectedStep.node_name,
              node_type: selectedStep.node_type,
            },
          }
        : undefined;

      // Create user message via API
      const userMsg = await apiPost<ThreadMessage>(
        `/threads/${activeThreadId}/messages`,
        {
          thread_id: activeThreadId,
          role: "user",
          content: messageText,
          message_type: "text",
          metadata,
        }
      );

      // Clear inspector selection after sending
      if (selectedStepId) setSelectedStepId(null);

      // Add user message to local list
      addLocalMessage(userMsg);

      // Add a placeholder execution trace message
      const traceId = `trace-${Date.now()}`;
      const tracePlaceholder: ThreadMessage = {
        id: traceId,
        thread_id: activeThreadId,
        role: "assistant",
        content: "",
        message_type: "execution_trace",
        metadata: null,
        created_at: new Date().toISOString(),
      };
      tracePlaceholderIdRef.current = traceId;
      addLocalMessage(tracePlaceholder);

      // Store message for potential reconnection, then connect WS
      pendingMessageRef.current = messageText;
      connectWs(messageText);
    } catch {
      // Toast handled by api client
    } finally {
      setSending(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSend, activeThreadId, text, files, connectWs]);

  function handleWsEvent(data: Record<string, unknown>) {
    const type = data.type as string;

    switch (type) {
      // ── Run lifecycle ────────────────────────────────
      case "run_started": {
        const runId = data.run_id as string;
        setActiveRun({
          id: runId,
          status: "running",
          step_count: (data.step_count as number) || 0,
        });
        addActivityEntry({
          eventType: "run_started",
          description: `Run started (${data.step_count as number} steps)`,
          severity: "info",
        });
        // Attach run_id to the trace placeholder so it can load historical data
        if (tracePlaceholderIdRef.current && runId) {
          updateLocalMessage(tracePlaceholderIdRef.current, {
            metadata: { run_id: runId },
          });
        }
        // Store config snapshot for config-driven rendering
        if (data.config_snapshot) {
          useExecutionStore.getState().setConfigSnapshot(
            data.config_snapshot as Record<string, string>
          );
        }
        break;
      }

      // ── Step lifecycle ───────────────────────────────
      case "step_started": {
        const stepId = data.step_id as string;
        lastStepIdRef.current = stepId;
        addActivityEntry({
          eventType: "step_started",
          description: `Step ${data.step_number as number}: ${data.node_name as string} (${data.node_type as string})`,
          nodeId: data.node_id as string,
          severity: "info",
        });

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

      // ── Progressive streaming (ChatGPT/Claude-style) ────
      case "text_delta": {
        const content = data.content as string;
        if (content) {
          setIsThinking(false);
          appendStreamingText(content);
        }
        break;
      }

      case "thinking_delta": {
        const content = data.content as string;
        if (content) {
          setIsThinking(true);
          appendStreamingThinkingText(content);
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
        const completedRunId = data.run_id as string;
        setActiveRun({
          id: completedRunId,
          status: "completed",
          total_duration_ms: data.total_duration_ms as number,
          total_tokens: data.total_tokens as number,
          total_cost_usd: data.total_cost_usd as number,
        });
        addActivityEntry({
          eventType: "run_completed",
          description: `Run completed (${data.total_duration_ms as number}ms, ${data.total_tokens as number} tokens, $${(data.total_cost_usd as number)?.toFixed(4)})`,
          severity: "success",
        });
        setStreaming(false);
        break;
      }

      case "run_failed": {
        const failError = (data.error as string) || "Execution failed";
        const failedRunId = (data.run_id as string) || "";
        setActiveRun({
          id: failedRunId,
          status: "failed",
        });
        setRunError(failError);
        setStreaming(false);
        break;
      }

      // ── Assistant message ────────────────────────────
      case "assistant_message": {
        // Safety net: assistant_message is always the last event from the backend,
        // so ensure streaming is stopped even if run_completed was missed
        setStreaming(false);
        clearStreamingText();

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

      // ── Execution error (visible in chat) ─────────────
      case "execution_error": {
        const errorMsg = (data.error as string) || "Unknown execution error";
        setRunError(errorMsg);
        // Add error as a visible chat message
        if (activeThreadId) {
          const errorChatMsg: ThreadMessage = {
            id: `error-${Date.now()}`,
            thread_id: activeThreadId,
            role: "assistant",
            content: `**Execution failed:** ${errorMsg}`,
            message_type: "text",
            metadata: { is_error: true },
            created_at: new Date().toISOString(),
          };
          addLocalMessage(errorChatMsg);
        }
        setStreaming(false);
        break;
      }

      // ── System message (warning/info banners) ─────────
      case "system_message": {
        if (activeThreadId) {
          const severity = (data.severity as string) || "info";
          const content = data.content as string;
          const sysMsg: ThreadMessage = {
            id: `sys-${Date.now()}`,
            thread_id: activeThreadId,
            role: "system",
            content: severity === "error" ? `Error: ${content}` : content,
            message_type: "text",
            metadata: { severity },
            created_at: new Date().toISOString(),
          };
          addLocalMessage(sysMsg);
        }
        break;
      }

      // ── Gate review requested ─────────────────────────
      case "gate_review_requested": {
        setPendingGate({
          stepId: data.step_id as string,
          nodeId: data.node_id as string,
          nodeName: data.node_name as string,
          reviewInstructions: (data.review_instructions as string) || "",
          availableActions: (data.available_actions as Record<string, boolean>) || {},
          previousOutput: (data.previous_output as string) || "",
          waitDuration: (data.wait_duration as string) || "5m",
          onTimeout: (data.on_timeout as string) || "auto_approve",
          requestedAt: Date.now(),
        });
        addActivityEntry({
          eventType: "gate_review_requested",
          description: `Gate review requested: ${data.node_name as string}`,
          nodeId: data.node_id as string,
          severity: "warn",
        });
        break;
      }

      case "gate_review_ack": {
        setPendingGate(null);
        addActivityEntry({
          eventType: "gate_review_ack",
          description: `Gate review action: ${data.action as string}`,
          severity: "success",
        });
        break;
      }

      // ── Live tool tracking ────────────────────────────
      case "tool_started": {
        const toolId = (data.event_id as string) || `tool-${Date.now()}`;
        addLiveTool({
          id: toolId,
          nodeId: (data.node_id as string) || "",
          toolName: (data.tool_name as string) || "Unknown Tool",
          inputSummary: (data.input_summary as string) || "",
          status: "running",
          startedAt: Date.now(),
        });
        addActivityEntry({
          eventType: "tool_started",
          description: `Tool started: ${data.tool_name as string}`,
          nodeId: data.node_id as string,
          severity: "info",
        });
        break;
      }

      case "tool_completed": {
        const toolNodeId = data.node_id as string;
        const toolName = data.tool_name as string;
        // Find the matching live tool (last running one for this node+tool)
        const liveTools = useExecutionStore.getState().liveTools;
        const match = [...liveTools].reverse().find(
          (t) => t.nodeId === toolNodeId && t.toolName === toolName && t.status === "running"
        );
        if (match) {
          updateLiveTool(match.id, {
            status: (data.status as string) === "error" ? "error" : "completed",
            durationMs: data.duration_ms as number,
            outputSummary: (data.output_summary as string) || "",
          });
        }
        addActivityEntry({
          eventType: "tool_completed",
          description: `Tool completed: ${toolName} (${data.duration_ms as number}ms)`,
          nodeId: toolNodeId,
          severity: (data.status as string) === "error" ? "error" : "success",
        });
        break;
      }

      // ── Edge evaluation (activity log) ─────────────────
      case "edge_evaluated": {
        addActivityEntry({
          eventType: "edge_evaluated",
          description: `Edge ${data.source_node as string} → ${data.target_node as string}: ${(data.condition_result as boolean) ? "PASS" : "FAIL"} (${data.condition_method as string})`,
          severity: (data.condition_result as boolean) ? "info" : "warn",
        });
        break;
      }

      // ── Loop/split events (activity log) ───────────────
      case "loop_iteration": {
        addActivityEntry({
          eventType: "loop_iteration",
          description: `Loop iteration ${data.iteration as number}/${data.max_iterations as number}`,
          severity: "info",
        });
        break;
      }

      case "split_started": {
        addActivityEntry({
          eventType: "split_started",
          description: `Split: ${data.branch_count as number} branches (${data.fan_out_method as string})`,
          nodeId: data.node_id as string,
          severity: "info",
        });
        break;
      }

      case "split_completed": {
        addActivityEntry({
          eventType: "split_completed",
          description: `Split merged: ${data.completed_branches as number}/${data.total_branches as number} via ${data.merge_method as string}`,
          nodeId: data.node_id as string,
          severity: "success",
        });
        break;
      }

      // ── Human review completed (activity log) ──────────
      case "human_review_completed": {
        setPendingGate(null);
        addActivityEntry({
          eventType: "human_review_completed",
          description: `Gate ${data.action as string}: ${(data.reviewer_comment as string) || "no comment"}`,
          nodeId: data.node_id as string,
          severity: (data.action as string) === "approve" ? "success" : "warn",
        });
        break;
      }

      // ── Error ────────────────────────────────────────
      case "error": {
        const errorMsg = (data.message as string) || "Unknown error";
        setRunError(errorMsg);
        // Also show in chat so user sees it
        if (activeThreadId) {
          const errorChatMsg: ThreadMessage = {
            id: `ws-error-${Date.now()}`,
            thread_id: activeThreadId,
            role: "assistant",
            content: `**Connection error:** ${errorMsg}`,
            message_type: "text",
            metadata: { is_error: true },
            created_at: new Date().toISOString(),
          };
          addLocalMessage(errorChatMsg);
        }
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

  // Resolve selected step for the indicator
  const contextStep = selectedStepId
    ? inspectorSteps.find((s) => s.id === selectedStepId)
    : null;

  return (
    <div className="border-t bg-white px-4 py-3">
      {/* WebSocket disconnection banner */}
      {wsDisconnected && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1.5">
          <WifiOff className="size-3 text-red-500" />
          <span className="text-[10px] text-red-600">
            Connection lost. Reconnecting...
          </span>
          <Loader2 className="ml-auto size-3 animate-spin text-red-400" />
        </div>
      )}

      {/* Inspector context indicator */}
      {contextStep && (
        <div className="mb-2 flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1">
          <Crosshair className="size-3 text-blue-500" />
          <span className="text-[10px] text-blue-600">
            Asking about:{" "}
            <strong>
              Step {contextStep.step_number} — {contextStep.node_name}
            </strong>
          </span>
          <button
            onClick={() => setSelectedStepId(null)}
            className="ml-auto text-blue-400 hover:text-blue-600"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

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
          data-chat-input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isStreaming
              ? "Waiting for execution to complete..."
              : "Type a message... (⌘K to focus)"
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
