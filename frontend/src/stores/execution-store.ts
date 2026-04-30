import { create } from "zustand";
import { apiGet, apiPatch } from "@/lib/api";
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

interface ExecutionStore {
  // Current run being streamed
  activeRun: Partial<ExecutionRun> | null;
  activeSteps: ExecutionStep[];
  isStreaming: boolean;
  runError: string | null;

  // Configuration snapshot from execution_start event
  configSnapshot: Record<string, string> | null;

  // Step-level streaming data
  stepProgress: Record<string, StepProgress>; // stepId -> progress texts
  stepFileEvents: Record<string, StepFileEvent>; // stepId -> file event

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
  clearActiveRun: () => void;

  // Actions — inspector (REST)
  fetchRun: (runId: string) => Promise<void>;
  fetchRunSteps: (runId: string) => Promise<void>;
  fetchRunEvents: (runId: string, eventType?: string) => Promise<void>;
  fetchRunSummary: (runId: string) => Promise<void>;
  fetchStepAnnotations: (stepId: string) => Promise<PMAnnotation[]>;

  // Actions — display settings
  fetchDisplaySettings: () => Promise<void>;
  updateDisplaySettings: (settings: Partial<DisplaySettings>) => Promise<void>;

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

  stepProgress: {},
  stepFileEvents: {},

  inspectorRun: null,
  inspectorSteps: [],
  inspectorEvents: [],
  inspectorSummary: null,
  inspectorLoading: false,

  displaySettings: null,

  setActiveRun: (run) => set((s) => ({
    activeRun: run,
    // Reset steps when starting a new run
    ...(run && run.id && run.id !== s.activeRun?.id
      ? { activeSteps: [], runError: null, stepProgress: {}, stepFileEvents: {} }
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

  clearActiveRun: () =>
    set({
      activeRun: null,
      activeSteps: [],
      isStreaming: false,
      runError: null,
      configSnapshot: null,
      stepProgress: {},
      stepFileEvents: {},
    }),

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
