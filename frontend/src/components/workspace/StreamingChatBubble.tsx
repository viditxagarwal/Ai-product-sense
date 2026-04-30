"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Brain, Loader2 } from "lucide-react";
import { useExecutionStore } from "@/stores/execution-store";

/**
 * Progressive streaming chat bubble — only renders when the backend
 * sends text_delta / thinking_delta events, which only happens when
 * the configuration's streaming_mode is "token_by_token".
 */
export default function StreamingChatBubble() {
  const { streamingText, streamingThinkingText, isThinking, displaySettings } =
    useExecutionStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [streamingText, streamingThinkingText]);

  // Respect display settings toggles
  const showText = displaySettings?.stream_text ?? true;
  const showThinking = displaySettings?.stream_thinking ?? true;

  // Only render when there is actual streaming content from text_delta/thinking_delta
  const hasThinking = showThinking && streamingThinkingText.length > 0;
  const hasText = showText && streamingText.length > 0;
  if (!hasThinking && !hasText) return null;

  return (
    <div className="flex px-4 py-2 justify-start">
      <div className="max-w-[80%] rounded-lg px-3 py-2 border border-slate-200 bg-white text-slate-800">
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
