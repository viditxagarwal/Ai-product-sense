"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Brain, Loader2, Wrench, Search } from "lucide-react";
import { useExecutionStore } from "@/stores/execution-store";

/**
 * Progressive streaming chat bubble — only renders when the backend
 * sends text_delta / thinking_delta events, which only happens when
 * the configuration's streaming_mode is not "off".
 *
 * Shows clear status indicators for what the agent is doing:
 * - Thinking (purple, with spinner while active)
 * - Using tools (blue, shows tool name)
 * - Streaming text (with blinking cursor)
 */
export default function StreamingChatBubble() {
  const {
    streamingText,
    streamingThinkingText,
    isThinking,
    isStreaming,
    liveTools,
    displaySettings,
  } = useExecutionStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [streamingText, streamingThinkingText]);

  // Respect display settings toggles
  const showText = displaySettings?.stream_text ?? true;
  const showThinking = displaySettings?.stream_thinking ?? true;

  const hasThinking = showThinking && streamingThinkingText.length > 0;
  const hasText = showText && streamingText.length > 0;

  // Current tool being used (last running tool)
  const activeTool = liveTools.find((t) => t.status === "running");

  // Show nothing if no streaming content and no active status
  if (!hasThinking && !hasText && !isThinking && !activeTool && !isStreaming) return null;

  // Show status indicator when streaming but no text content yet
  const showStatusOnly = isStreaming && !hasThinking && !hasText;

  return (
    <div className="flex px-4 py-2 justify-start">
      <div className="max-w-[80%] rounded-lg px-3 py-2 border border-slate-200 bg-white text-slate-800">

        {/* Status indicator — shows what the agent is currently doing */}
        {showStatusOnly && (
          <div className="flex items-center gap-2 py-1">
            <Loader2 className="size-3 animate-spin text-slate-400" />
            <span className="text-xs text-slate-500">Processing...</span>
          </div>
        )}

        {/* Active tool indicator */}
        {activeTool && (
          <div className="flex items-center gap-1.5 mb-1.5 rounded-md bg-blue-50 border border-blue-100 px-2 py-1">
            {activeTool.toolName.toLowerCase().includes("search") ||
             activeTool.toolName.toLowerCase().includes("retriev") ||
             activeTool.toolName.toLowerCase().includes("knowledge") ? (
              <Search className="size-3 text-blue-500 animate-pulse" />
            ) : (
              <Wrench className="size-3 text-blue-500 animate-pulse" />
            )}
            <span className="text-[10px] font-medium text-blue-600">
              Using {activeTool.toolName}
            </span>
            {activeTool.inputSummary && (
              <span className="text-[10px] text-blue-400 truncate max-w-[200px]">
                — {activeTool.inputSummary}
              </span>
            )}
            <Loader2 className="size-2.5 animate-spin text-blue-400 ml-auto" />
          </div>
        )}

        {/* Thinking block (Claude-style) */}
        {hasThinking && (
          <div className="mb-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Brain className="size-3 text-purple-500" />
              <span className="text-[10px] font-medium text-purple-600 uppercase tracking-wide">
                Thinking
              </span>
              {isThinking && (
                <Loader2 className="size-2.5 animate-spin text-purple-400" />
              )}
            </div>
            <div className="rounded-md bg-purple-50 border border-purple-100 px-2.5 py-2 text-xs text-purple-800 max-h-32 overflow-y-auto">
              <p className="whitespace-pre-wrap">{streamingThinkingText}</p>
            </div>
          </div>
        )}

        {/* Thinking indicator (no text yet, just started thinking) */}
        {isThinking && !hasThinking && (
          <div className="flex items-center gap-1.5 py-1">
            <Brain className="size-3 text-purple-500" />
            <span className="text-[10px] font-medium text-purple-600">Thinking...</span>
            <Loader2 className="size-2.5 animate-spin text-purple-400" />
          </div>
        )}

        {/* Main streaming text */}
        {hasText && (
          <div className="prose prose-sm max-w-none prose-p:my-1 prose-li:my-0 prose-headings:mb-1 prose-headings:mt-2">
            <ReactMarkdown>{streamingText}</ReactMarkdown>
            <span className="inline-block w-1.5 h-4 bg-slate-400 animate-pulse ml-0.5 align-text-bottom" />
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
