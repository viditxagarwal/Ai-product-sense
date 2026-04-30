"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { Brain, Loader2 } from "lucide-react";
import { useExecutionStore } from "@/stores/execution-store";
import { cn } from "@/lib/utils";

export default function StreamingChatBubble() {
  const { streamingText, streamingThinkingText, isThinking, isStreaming } =
    useExecutionStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll as content grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [streamingText, streamingThinkingText]);

  // Don't render if not streaming or no content yet
  if (!isStreaming && !streamingText) return null;
  if (!streamingText && !streamingThinkingText && !isStreaming) return null;

  const hasThinking = streamingThinkingText.length > 0;
  const hasText = streamingText.length > 0;

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
        {hasText ? (
          <div className="prose prose-sm max-w-none prose-p:my-1 prose-li:my-0 prose-headings:mb-1 prose-headings:mt-2">
            <ReactMarkdown>{streamingText}</ReactMarkdown>
            <span className="inline-block w-1.5 h-4 bg-slate-400 animate-pulse ml-0.5 align-text-bottom" />
          </div>
        ) : isStreaming ? (
          <div className="flex items-center gap-2">
            {!hasThinking && (
              <>
                <Loader2 className="size-3.5 animate-spin text-slate-400" />
                <span className="text-xs text-slate-400">
                  {hasThinking ? "Generating response..." : "Processing..."}
                </span>
              </>
            )}
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
