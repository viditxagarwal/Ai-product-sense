import { create } from "zustand";
import { apiGet } from "@/lib/api";
import type { ExecutionRun, ExecutionStep, PMAnnotation } from "@/types";

interface ExecutionStore {
  // Current run being streamed
  activeRun: ExecutionRun | null;
  activeSteps: ExecutionStep[];
  isStreaming: boolean;

  // Inspector data (post-hoc)
  inspectorRun: ExecutionRun | null;
  inspectorSteps: ExecutionStep[];
  inspectorLoading: boolean;

  // Actions — streaming (called from WebSocket handler)
  setActiveRun: (run: ExecutionRun | null) => void;
  addStep: (step: ExecutionStep) => void;
  updateStep: (stepId: string, updates: Partial<ExecutionStep>) => void;
  setStreaming: (streaming: boolean) => void;
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

  inspectorRun: null,
  inspectorSteps: [],
  inspectorLoading: false,

  setActiveRun: (run) => set({ activeRun: run }),
  addStep: (step) => set((s) => ({ activeSteps: [...s.activeSteps, step] })),
  updateStep: (stepId, updates) =>
    set((s) => ({
      activeSteps: s.activeSteps.map((st) => (st.id === stepId ? { ...st, ...updates } : st)),
    })),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  clearActiveRun: () => set({ activeRun: null, activeSteps: [], isStreaming: false }),

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
