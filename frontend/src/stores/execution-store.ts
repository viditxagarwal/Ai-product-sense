import { create } from "zustand";
import { apiGet } from "@/lib/api";
import type { ExecutionRun, ExecutionStep, PMAnnotation } from "@/types";

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
  stepProgress: Record<string, StepProgress>; // stepId → progress texts
  stepFileEvents: Record<string, StepFileEvent>; // stepId → file event

  // Inspector data (post-hoc)
  inspectorRun: ExecutionRun | null;
  inspectorSteps: ExecutionStep[];
  inspectorLoading: boolean;

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
  fetchStepAnnotations: (stepId: string) => Promise<PMAnnotation[]>;
}

export const useExecutionStore = create<ExecutionStore>((set) => ({
  activeRun: null,
  activeSteps: [],
  isStreaming: false,
  runError: null,
  configSnapshot: null,

  stepProgress: {},
  stepFileEvents: {},

  inspectorRun: null,
  inspectorSteps: [],
  inspectorLoading: false,

  setActiveRun: (run) => set({ activeRun: run }),

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
    const run = await apiGet<ExecutionRun>(`/runs/${runId}`);
    set({ inspectorRun: run, inspectorLoading: false });
  },

  fetchRunSteps: async (runId) => {
    const steps = await apiGet<ExecutionStep[]>(`/runs/${runId}/steps`);
    set({ inspectorSteps: steps });
  },

  fetchStepAnnotations: async (stepId) => {
    return apiGet<PMAnnotation[]>(`/steps/${stepId}/annotations`);
  },
}));
