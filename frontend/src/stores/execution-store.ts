import { create } from "zustand";
import { apiGet, apiPatch, apiPost, apiDelete } from "@/lib/api";
import type {
  ExecutionRun,
  ExecutionStep,
  ExecutionEvent,
  ExecutionSummary,
  DisplaySettings,
  PMAnnotation,
} from "@/types";

/** Thinking/progress text fragments for a step while streaming. */
export type StepProgress = string[];

/** File event tied to a step. */
export interface StepFileEvent {
  file_id: string;
  file_name: string;
  file_type: string;
  operation: "created" | "modified";
}

/** Pending gate review during streaming. */
export interface PendingGateReview {
  stepId: string;
  nodeId: string;
  nodeName: string;
  reviewInstructions: string;
  availableActions: Record<string, boolean>;
  previousOutput: string;
  waitDuration: string;
  onTimeout: string;
  requestedAt: number; // Date.now()
}

/** Live tool execution during streaming. */
export interface LiveToolExecution {
  id: string;
  nodeId: string;
  toolName: string;
  inputSummary: string;
  status: "running" | "completed" | "error";
  durationMs?: number;
  outputSummary?: string;
  startedAt: number;
}

/** Activity log entry. */
export interface ActivityLogEntry {
  id: string;
  timestamp: number;
  eventType: string;
  description: string;
  nodeId?: string;
  severity: "info" | "warn" | "error" | "success";
}

export interface AlertThreshold {
  id: string;
  metric: string;
  operator: "gt" | "gte" | "lt" | "lte";
  value: number;
  action: "log" | "notify" | "block";
  created_at?: string;
}

interface ExecutionStore {
  // Current run being streamed
  activeRun: Partial<ExecutionRun> | null;
  activeSteps: ExecutionStep[];
  isStreaming: boolean;
  runError: string | null;

  // Configuration snapshot from execution_start event
  configSnapshot: Record<string, string> | null;

  // Progressive streaming text (ChatGPT/Claude-style)
  streamingText: string;
  streamingThinkingText: string;
  isThinking: boolean;

  // Step-level streaming data
  stepProgress: Record<string, StepProgress>; // stepId -> progress texts
  stepFileEvents: Record<string, StepFileEvent>; // stepId -> file event

  // Gate review state
  pendingGate: PendingGateReview | null;

  // Live tool executions during streaming
  liveTools: LiveToolExecution[];

  // Activity log
  activityLog: ActivityLogEntry[];

  // Inspector data (post-hoc)
  inspectorRun: ExecutionRun | null;
  inspectorSteps: ExecutionStep[];
  inspectorEvents: ExecutionEvent[];
  inspectorSummary: ExecutionSummary | null;
  inspectorLoading: boolean;

  // Display settings (Section I)
  displaySettings: DisplaySettings | null;

  // Actions — streaming (called from WebSocket handler)
  setActiveRun: (run: Partial<ExecutionRun> | null) => void;
  addStep: (step: ExecutionStep) => void;
  updateStep: (stepId: string, updates: Partial<ExecutionStep>) => void;
  appendStepProgress: (stepId: string, text: string) => void;
  setStepFileEvent: (stepId: string, event: StepFileEvent) => void;
  setConfigSnapshot: (snapshot: Record<string, string> | null) => void;
  setStreaming: (streaming: boolean) => void;
  setRunError: (error: string | null) => void;
  appendStreamingText: (text: string) => void;
  appendStreamingThinkingText: (text: string) => void;
  setIsThinking: (thinking: boolean) => void;
  clearStreamingText: () => void;
  clearActiveRun: () => void;

  // Gate review actions
  setPendingGate: (gate: PendingGateReview | null) => void;

  // Live tool actions
  addLiveTool: (tool: LiveToolExecution) => void;
  updateLiveTool: (id: string, updates: Partial<LiveToolExecution>) => void;
  clearLiveTools: () => void;

  // Activity log actions
  addActivityEntry: (entry: Omit<ActivityLogEntry, "id" | "timestamp">) => void;
  clearActivityLog: () => void;

  // Actions — inspector (REST)
  fetchRun: (runId: string) => Promise<void>;
  fetchRunSteps: (runId: string) => Promise<void>;
  fetchRunEvents: (runId: string, eventType?: string) => Promise<void>;
  fetchRunSummary: (runId: string) => Promise<void>;
  fetchStepAnnotations: (stepId: string) => Promise<PMAnnotation[]>;

  // Actions — display settings
  fetchDisplaySettings: () => Promise<void>;
  updateDisplaySettings: (settings: Partial<DisplaySettings>) => Promise<void>;

  // Export
  exportRun: (runId: string) => Promise<Record<string, unknown>>;

  // Alert thresholds
  alertThresholds: AlertThreshold[];
  fetchAlertThresholds: () => Promise<void>;
  createAlertThreshold: (threshold: Omit<AlertThreshold, "id" | "created_at">) => Promise<void>;
  deleteAlertThreshold: (id: string) => Promise<void>;

  // Computed helpers
  getEventsForNode: (nodeId: string) => ExecutionEvent[];
  getLLMCallEvents: () => ExecutionEvent[];
  getToolCallEvents: () => ExecutionEvent[];
}

export const useExecutionStore = create<ExecutionStore>((set, get) => ({
  activeRun: null,
  activeSteps: [],
  isStreaming: false,
  runError: null,
  configSnapshot: null,

  streamingText: "",
  streamingThinkingText: "",
  isThinking: false,

  stepProgress: {},
  stepFileEvents: {},

  pendingGate: null,
  liveTools: [],
  activityLog: [],

  inspectorRun: null,
  inspectorSteps: [],
  inspectorEvents: [],
  inspectorSummary: null,
  inspectorLoading: false,

  displaySettings: null,
  alertThresholds: [],

  setActiveRun: (run) => set((s) => ({
    activeRun: run,
    // Reset steps and streaming text when starting a new run
    ...(run && run.id && run.id !== s.activeRun?.id
      ? { activeSteps: [], runError: null, stepProgress: {}, stepFileEvents: {},
          streamingText: "", streamingThinkingText: "", isThinking: false,
          pendingGate: null, liveTools: [], activityLog: [] }
      : {}),
  })),

  setConfigSnapshot: (snapshot) => set({ configSnapshot: snapshot }),

  addStep: (step) =>
    set((s) => ({ activeSteps: [...s.activeSteps, step] })),

  updateStep: (stepId, updates) =>
    set((s) => ({
      activeSteps: s.activeSteps.map((st) =>
        st.id === stepId ? { ...st, ...updates } : st
      ),
    })),

  appendStepProgress: (stepId, text) =>
    set((s) => ({
      stepProgress: {
        ...s.stepProgress,
        [stepId]: [...(s.stepProgress[stepId] || []), text],
      },
    })),

  setStepFileEvent: (stepId, event) =>
    set((s) => ({
      stepFileEvents: { ...s.stepFileEvents, [stepId]: event },
    })),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  setRunError: (error) => set({ runError: error }),

  appendStreamingText: (text) =>
    set((s) => ({ streamingText: s.streamingText + text, isThinking: false })),

  appendStreamingThinkingText: (text) =>
    set((s) => ({ streamingThinkingText: s.streamingThinkingText + text, isThinking: true })),

  setIsThinking: (thinking) => set({ isThinking: thinking }),

  clearStreamingText: () =>
    set({ streamingText: "", streamingThinkingText: "", isThinking: false }),

  clearActiveRun: () =>
    set({
      activeRun: null,
      activeSteps: [],
      isStreaming: false,
      runError: null,
      configSnapshot: null,
      streamingText: "",
      streamingThinkingText: "",
      isThinking: false,
      stepProgress: {},
      stepFileEvents: {},
      pendingGate: null,
      liveTools: [],
      activityLog: [],
    }),

  setPendingGate: (gate) => set({ pendingGate: gate }),

  addLiveTool: (tool) =>
    set((s) => ({ liveTools: [...s.liveTools, tool] })),

  updateLiveTool: (id, updates) =>
    set((s) => ({
      liveTools: s.liveTools.map((t) =>
        t.id === id ? { ...t, ...updates } : t
      ),
    })),

  clearLiveTools: () => set({ liveTools: [] }),

  addActivityEntry: (entry) =>
    set((s) => ({
      activityLog: [
        ...s.activityLog,
        { ...entry, id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: Date.now() },
      ].slice(-500), // Keep last 500 entries
    })),

  clearActivityLog: () => set({ activityLog: [] }),

  fetchRun: async (runId) => {
    set({ inspectorLoading: true });
    try {
      const run = await apiGet<ExecutionRun>(`/runs/${runId}`);
      set({ inspectorRun: run, inspectorLoading: false });
    } catch {
      set({ inspectorLoading: false });
    }
  },

  fetchRunSteps: async (runId) => {
    try {
      const steps = await apiGet<ExecutionStep[]>(`/runs/${runId}/steps`);
      set({ inspectorSteps: steps });
    } catch {
      // ignore
    }
  },

  fetchRunEvents: async (runId, eventType) => {
    try {
      const url = eventType
        ? `/runs/${runId}/events?event_type=${eventType}`
        : `/runs/${runId}/events`;
      const events = await apiGet<ExecutionEvent[]>(url);
      set({ inspectorEvents: events });
    } catch {
      // ignore
    }
  },

  fetchRunSummary: async (runId) => {
    try {
      const summary = await apiGet<ExecutionSummary>(`/runs/${runId}/summary`);
      set({ inspectorSummary: summary });
    } catch {
      // ignore
    }
  },

  fetchStepAnnotations: async (stepId) => {
    return apiGet<PMAnnotation[]>(`/steps/${stepId}/annotations`);
  },

  fetchDisplaySettings: async () => {
    try {
      const result = await apiGet<{ settings: DisplaySettings }>("/display-settings");
      set({ displaySettings: result.settings });
    } catch {
      // Use defaults
      set({
        displaySettings: {
          show_inner_llm_calls: true,
          show_tool_call_details: true,
          show_thinking: true,
          show_system_prompts: true,
          show_raw_messages: false,
          show_token_counts: true,
          show_costs: true,
          show_edge_evaluations: true,
          show_mapping_details: true,
          stream_text: true,
          stream_thinking: true,
          show_live_tool_cards: true,
          show_progress_bar: true,
          show_activity_log: false,
          show_cost_breakdown: true,
          show_token_heatmap: false,
          show_latency_waterfall: true,
          enable_comparison_view: true,
        },
      });
    }
  },

  updateDisplaySettings: async (settings) => {
    try {
      await apiPatch("/display-settings", { settings });
      set((s) => ({
        displaySettings: s.displaySettings ? { ...s.displaySettings, ...settings } : null,
      }));
    } catch {
      // ignore
    }
  },

  // Export
  exportRun: async (runId) => {
    return apiGet<Record<string, unknown>>(`/runs/${runId}/export`);
  },

  // Alert thresholds
  fetchAlertThresholds: async () => {
    try {
      const data = await apiGet<AlertThreshold[]>("/alert-thresholds");
      set({ alertThresholds: data });
    } catch {
      // ignore
    }
  },

  createAlertThreshold: async (threshold) => {
    try {
      await apiPost("/alert-thresholds", threshold);
      get().fetchAlertThresholds();
    } catch {
      // ignore
    }
  },

  deleteAlertThreshold: async (id) => {
    try {
      await apiDelete(`/alert-thresholds/${id}`);
      set((s) => ({ alertThresholds: s.alertThresholds.filter((t) => t.id !== id) }));
    } catch {
      // ignore
    }
  },

  // Computed helpers
  getEventsForNode: (nodeId) => {
    return get().inspectorEvents.filter(
      (e) => (e.data as Record<string, unknown>).node_id === nodeId
    );
  },

  getLLMCallEvents: () => {
    return get().inspectorEvents.filter((e) => e.event_type === "llm_call_completed");
  },

  getToolCallEvents: () => {
    return get().inspectorEvents.filter((e) => e.event_type === "tool_completed");
  },
}));
