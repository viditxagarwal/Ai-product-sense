"use client";

/**
 * Section C.3/C4: LLM Call Timeline
 * Shows each LLM API call within a node in sequence, revealing the ReAct loop.
 * Includes C5 (Thinking Block), C8 (Token Breakdown), C9 (Raw Messages).
 */

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Zap,
  Brain,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ExecutionEvent, LLMCallData } from "@/types";
import ToolCallCard from "./ToolCallCard";
import RawMessagesViewer from "./RawMessagesViewer";

interface Props {
  llmEvents: ExecutionEvent[];
  toolEvents: ExecutionEvent[];
  showThinking?: boolean;
  showRawMessages?: boolean;
}

export default function LLMCallTimeline({ llmEvents, toolEvents, showThinking = true, showRawMessages = false }: Props) {
  if (llmEvents.length === 0) return null;

  return (
    <div className="space-y-2">
      <h5 className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        LLM Calls ({llmEvents.length})
      </h5>
      <div className="space-y-1">
        {llmEvents.map((evt, i) => {
          const d = evt.data as unknown as LLMCallData & { call_index?: number; node_id?: string };
          // Find tool events between this LLM call and the next
          const nextLLMTime = llmEvents[i + 1]?.timestamp;
          const interToolEvents = toolEvents.filter((t) => {
            return t.timestamp > evt.timestamp && (!nextLLMTime || t.timestamp < nextLLMTime);
          });

          return (
            <LLMCallCard
              key={evt.id}
              callIndex={d.call_index ?? i}
              data={d}
              toolEvents={interToolEvents}
              showThinking={showThinking}
              showRawMessages={showRawMessages}
            />
          );
        })}
      </div>

      {/* C8: Token Breakdown Table */}
      {llmEvents.length > 1 && (
        <TokenBreakdownTable events={llmEvents} />
      )}
    </div>
  );
}

function LLMCallCard({
  callIndex,
  data,
  toolEvents,
  showThinking,
  showRawMessages,
}: {
  callIndex: number;
  data: LLMCallData;
  toolEvents: ExecutionEvent[];
  showThinking: boolean;
  showRawMessages: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const hasThinking = showThinking && data.thinking_text && data.thinking_text.length > 0;
  const hasWarning = data.stop_reason === "max_tokens" || data.stop_reason === "content_filter";

  return (
    <div className="rounded border border-slate-200 bg-white">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left"
      >
        {expanded ? <ChevronDown className="size-3 text-slate-400" /> : <ChevronRight className="size-3 text-slate-400" />}
        <Zap className="size-3 text-blue-400" />
        <span className="text-[10px] font-medium text-slate-600">
          Call {callIndex + 1}
        </span>
        <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-500">
          {data.model_id}
        </span>

        {/* Stop reason badge */}
        {data.stop_reason && (
          <span className={cn(
            "rounded px-1 py-0.5 text-[9px] font-medium",
            data.stop_reason === "end_turn" ? "bg-emerald-50 text-emerald-600" :
            data.stop_reason === "tool_use" ? "bg-blue-50 text-blue-600" :
            hasWarning ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-500"
          )}>
            {data.stop_reason}
          </span>
        )}

        {hasWarning && <AlertTriangle className="size-3 text-amber-500" />}

        <div className="flex-1" />

        {/* Token counts */}
        <span className="text-[9px] text-slate-400">
          {data.input_tokens} in / {data.output_tokens} out
          {data.thinking_tokens > 0 && ` / ${data.thinking_tokens} think`}
        </span>
        <span className="text-[9px] text-slate-400">{data.latency_ms}ms</span>
        {data.cost_usd > 0 && (
          <span className="text-[9px] font-medium text-slate-500">${data.cost_usd.toFixed(5)}</span>
        )}
      </button>

      {/* Warning banner for max_tokens/content_filter */}
      {hasWarning && (
        <div className={cn(
          "mx-2 mb-1 rounded px-2 py-1 text-[10px]",
          data.stop_reason === "max_tokens"
            ? "bg-amber-50 text-amber-700"
            : "bg-red-50 text-red-700"
        )}>
          {data.stop_reason === "max_tokens"
            ? "Response was truncated — consider increasing max_output_tokens"
            : "Response was blocked by content filter"}
        </div>
      )}

      {expanded && (
        <div className="space-y-2 border-t px-2 pb-2 pt-1">
          {/* Metrics row */}
          <div className="flex flex-wrap gap-3 text-[9px] text-slate-400">
            {data.time_to_first_token_ms > 0 && (
              <span>TTFT: {data.time_to_first_token_ms}ms</span>
            )}
            {data.tokens_per_second > 0 && (
              <span>{data.tokens_per_second.toFixed(1)} tok/s</span>
            )}
            {data.cache_read_tokens > 0 && (
              <span className="text-emerald-500">Cache read: {data.cache_read_tokens}</span>
            )}
            {data.cache_write_tokens > 0 && (
              <span>Cache write: {data.cache_write_tokens}</span>
            )}
            {data.request_id && (
              <span className="font-mono">req: {data.request_id.slice(0, 12)}...</span>
            )}
          </div>

          {/* C5: Thinking Block */}
          {hasThinking && (
            <ThinkingBlock text={data.thinking_text} tokens={data.thinking_tokens} />
          )}

          {/* Raw Messages Viewer (C9) */}
          {showRawMessages && data.input_messages && (
            <RawMessagesViewer messages={data.input_messages as Array<{ role: string; content: string }>} />
          )}

          {/* Tool call requests */}
          {data.tool_calls_requested && data.tool_calls_requested.length > 0 && (
            <div>
              <span className="text-[9px] font-medium text-blue-500">
                Requested {data.tool_calls_requested.length} tool call(s)
              </span>
            </div>
          )}

          {/* Output text preview */}
          {data.output_text && (
            <div>
              <h6 className="text-[9px] font-semibold text-slate-400">Output</h6>
              <p className="max-h-32 overflow-auto rounded bg-slate-50 p-1.5 text-[10px] text-slate-600">
                {data.output_text.slice(0, 500)}
                {data.output_text.length > 500 && "..."}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tool calls between this LLM call and the next */}
      {toolEvents.length > 0 && (
        <div className="border-t px-2 py-1">
          {toolEvents.map((te) => (
            <ToolCallCard key={te.id} event={te} />
          ))}
        </div>
      )}
    </div>
  );
}

function ThinkingBlock({ text, tokens }: { text: string; tokens: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded border border-purple-100 bg-purple-50/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left"
      >
        {expanded ? <ChevronDown className="size-3 text-purple-400" /> : <ChevronRight className="size-3 text-purple-400" />}
        <Brain className="size-3 text-purple-400" />
        <span className="text-[10px] font-medium text-purple-600">Thinking</span>
        <span className="text-[9px] text-purple-400">{tokens} tokens</span>
      </button>
      {expanded && (
        <div className="max-h-48 overflow-auto border-t border-purple-100 px-2 py-1.5 text-[10px] text-purple-700 whitespace-pre-wrap">
          {text}
        </div>
      )}
    </div>
  );
}

function TokenBreakdownTable({ events }: { events: ExecutionEvent[] }) {
  const [expanded, setExpanded] = useState(false);

  const rows = events.map((evt, i) => {
    const d = evt.data as unknown as LLMCallData;
    return { index: i + 1, ...d };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      input: acc.input + r.input_tokens,
      output: acc.output + r.output_tokens,
      thinking: acc.thinking + (r.thinking_tokens || 0),
      cacheRead: acc.cacheRead + (r.cache_read_tokens || 0),
      cacheWrite: acc.cacheWrite + (r.cache_write_tokens || 0),
      cost: acc.cost + (r.cost_usd || 0),
      latency: acc.latency + (r.latency_ms || 0),
    }),
    { input: 0, output: 0, thinking: 0, cacheRead: 0, cacheWrite: 0, cost: 0, latency: 0 }
  );

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1 text-[10px] font-medium text-slate-400 hover:text-slate-600"
      >
        {expanded ? <ChevronDown className="size-2.5" /> : <ChevronRight className="size-2.5" />}
        Token Breakdown Table
      </button>
      {expanded && (
        <div className="mt-1 overflow-x-auto">
          <table className="w-full text-[9px]">
            <thead>
              <tr className="border-b text-left text-slate-400">
                <th className="px-1 py-0.5">#</th>
                <th className="px-1 py-0.5">Model</th>
                <th className="px-1 py-0.5 text-right">Input</th>
                <th className="px-1 py-0.5 text-right">Output</th>
                <th className="px-1 py-0.5 text-right">Think</th>
                <th className="px-1 py-0.5 text-right">Cache R</th>
                <th className="px-1 py-0.5 text-right">Cost</th>
                <th className="px-1 py-0.5 text-right">Latency</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.index} className="border-b border-slate-100">
                  <td className="px-1 py-0.5 text-slate-400">{r.index}</td>
                  <td className="px-1 py-0.5 text-slate-600">{r.model_id}</td>
                  <td className="px-1 py-0.5 text-right">{r.input_tokens}</td>
                  <td className="px-1 py-0.5 text-right">{r.output_tokens}</td>
                  <td className="px-1 py-0.5 text-right">{r.thinking_tokens || 0}</td>
                  <td className="px-1 py-0.5 text-right">{r.cache_read_tokens || 0}</td>
                  <td className="px-1 py-0.5 text-right font-medium">${(r.cost_usd || 0).toFixed(5)}</td>
                  <td className="px-1 py-0.5 text-right">{r.latency_ms}ms</td>
                </tr>
              ))}
              <tr className="font-semibold text-slate-700">
                <td className="px-1 py-0.5" colSpan={2}>Total</td>
                <td className="px-1 py-0.5 text-right">{totals.input}</td>
                <td className="px-1 py-0.5 text-right">{totals.output}</td>
                <td className="px-1 py-0.5 text-right">{totals.thinking}</td>
                <td className="px-1 py-0.5 text-right">{totals.cacheRead}</td>
                <td className="px-1 py-0.5 text-right">${totals.cost.toFixed(5)}</td>
                <td className="px-1 py-0.5 text-right">{totals.latency}ms</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
