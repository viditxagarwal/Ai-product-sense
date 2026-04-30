"use client";

/**
 * Enhanced Execution Inspector (Sections C.1-C.5)
 * Fetches execution events and renders summary badges, step pills,
 * timing bar, LLM call timeline, tool call cards, and thinking blocks.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  Loader2,
  Clock,
  Cpu,
  DollarSign,
  Shield,
  Layers,
  Settings,
  GitBranch,
  BarChart3,
  List,
} from "lucide-react";
import { useExecutionStore } from "@/stores/execution-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import ExecutionSummaryBar from "./ExecutionSummaryBar";
import TimingBar from "./TimingBar";
import InspectorNode from "./InspectorNode";
import SpanTree from "./SpanTree";
import AnalyticsPanel from "./AnalyticsPanel";
import { DisplaySettingsPanel } from "./DisplaySettingsPanel";

export default function ExecutionInspector() {
  const { selectedRunId, selectedStepId } = useWorkspaceStore();
  const {
    inspectorRun,
    inspectorSteps,
    inspectorEvents,
    inspectorSummary,
    inspectorLoading,
    isStreaming,
    displaySettings,
    fetchRun,
    fetchRunSteps,
    fetchRunEvents,
    fetchRunSummary,
    fetchDisplaySettings,
  } = useExecutionStore();

  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [viewMode, setViewMode] = useState<"timeline" | "tree" | "analytics">("timeline");
  const [showSettings, setShowSettings] = useState(false);

  // Fetch run, steps, events, and summary when selectedRunId changes
  useEffect(() => {
    if (!selectedRunId) return;
    fetchRun(selectedRunId);
    fetchRunSteps(selectedRunId);
    fetchRunEvents(selectedRunId);
    fetchRunSummary(selectedRunId);
  }, [selectedRunId, fetchRun, fetchRunSteps, fetchRunEvents, fetchRunSummary]);

  // Load display settings once
  useEffect(() => {
    if (!displaySettings) {
      fetchDisplaySettings();
    }
  }, [displaySettings, fetchDisplaySettings]);

  const scrollToNode = useCallback((stepId: string) => {
    const el = nodeRefs.current[stepId];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    useWorkspaceStore.getState().setSelectedStepId(stepId);
  }, []);

  // ── Empty state ──────────────────────────────────────────
  if (!selectedRunId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Search className="size-8 text-slate-200" />
        <p className="mt-2 text-sm text-slate-400">
          Click &quot;Inspect&quot; on an execution trace in the chat to analyze
          it here.
        </p>
      </div>
    );
  }

  if (inspectorLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-5 animate-spin text-slate-300" />
      </div>
    );
  }

  if (isStreaming) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <Loader2 className="size-6 animate-spin text-blue-400" />
        <p className="mt-2 text-sm text-slate-400">
          Execution in progress — inspector available after completion.
        </p>
      </div>
    );
  }

  if (!inspectorRun) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <p className="text-sm text-slate-400">Run not found</p>
      </div>
    );
  }

  // Build default summary if API summary not loaded yet
  const summary = inspectorSummary || {
    execution_id: inspectorRun.id,
    status: inspectorRun.status,
    total_duration_ms: inspectorRun.total_duration_ms ?? 0,
    total_tokens: inspectorRun.total_tokens ?? 0,
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_thinking_tokens: 0,
    total_cache_read_tokens: 0,
    total_cache_write_tokens: 0,
    total_cost_usd: inspectorRun.total_cost_usd ?? 0,
    total_llm_calls: 0,
    total_tool_calls: 0,
    step_count: inspectorSteps.length,
    path_taken: [],
    models_used: [],
    tools_used: [],
    cost_by_model: {},
    cost_by_node: {},
  };

  // Group events by node_id for passing to InspectorNode
  const eventsByNode: Record<string, typeof inspectorEvents> = {};
  for (const evt of inspectorEvents) {
    const nodeId = (evt.data as Record<string, unknown>).node_id as string;
    if (nodeId) {
      if (!eventsByNode[nodeId]) eventsByNode[nodeId] = [];
      eventsByNode[nodeId].push(evt);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* C.1: Enhanced Summary Bar */}
      <ExecutionSummaryBar summary={summary} status={inspectorRun.status} />

      {/* View mode toggle + settings */}
      <div className="flex items-center gap-1 border-b px-3 py-1">
        {([
          { key: "timeline" as const, icon: List, label: "Timeline" },
          { key: "tree" as const, icon: GitBranch, label: "Span Tree" },
          { key: "analytics" as const, icon: BarChart3, label: "Analytics" },
        ]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setViewMode(key)}
            className={`flex items-center gap-1 rounded px-2 py-1 text-[10px] font-medium transition-colors ${
              viewMode === key ? "bg-slate-100 text-slate-700" : "text-slate-400 hover:text-slate-600"
            }`}
          >
            <Icon className="size-3" />
            {label}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        >
          <Settings className="size-3.5" />
        </button>
      </div>

      {/* Display Settings Panel (overlay) */}
      {showSettings && (
        <div className="border-b">
          <DisplaySettingsPanel />
        </div>
      )}

      {/* B2: Timing Bar */}
      {viewMode === "timeline" && (
        <div className="border-b">
          <TimingBar steps={inspectorSteps} onSegmentClick={scrollToNode} />
        </div>
      )}

      {/* B1: Step Pills */}
      {viewMode === "timeline" && inspectorSteps.length > 1 && (
        <div className="flex items-center gap-1 overflow-x-auto border-b px-3 py-1.5">
          {inspectorSteps.map((step, i) => {
            const isActive = step.id === selectedStepId;
            return (
              <button
                key={step.id}
                onClick={() => scrollToNode(step.id)}
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium transition-colors ${
                  step.status === "completed"
                    ? isActive ? "bg-emerald-100 text-emerald-700" : "bg-emerald-50 text-emerald-600"
                    : step.status === "failed"
                      ? "bg-red-50 text-red-600"
                      : step.status === "running"
                        ? "bg-blue-50 text-blue-600 animate-pulse"
                        : "bg-slate-50 text-slate-400"
                }`}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {step.node_name.length > 15 ? step.node_name.slice(0, 15) + "..." : step.node_name}
                {i < inspectorSteps.length - 1 && (
                  <span className="ml-1 text-slate-300">→</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        {/* Timeline view (default) */}
        {viewMode === "timeline" && (
          <>
            {inspectorSteps.map((step) => (
              <InspectorNode
                key={step.id}
                ref={(el) => {
                  nodeRefs.current[step.id] = el;
                }}
                step={step}
                isSelected={step.id === selectedStepId}
                events={eventsByNode[step.id] || inspectorEvents.filter(
                  e => (e.data as Record<string, unknown>).step_id === step.id
                )}
                displaySettings={displaySettings}
              />
            ))}
            {inspectorSteps.length === 0 && (
              <div className="flex items-center justify-center p-6">
                <p className="text-xs text-slate-400">No execution steps found</p>
              </div>
            )}
          </>
        )}

        {/* Span Tree view */}
        {viewMode === "tree" && (
          <SpanTree events={inspectorEvents} summary={summary} />
        )}

        {/* Analytics view */}
        {viewMode === "analytics" && (
          <AnalyticsPanel
            summary={summary}
            steps={inspectorSteps}
            events={inspectorEvents}
          />
        )}
      </div>
    </div>
  );
}
