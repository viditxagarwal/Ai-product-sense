import { create } from "zustand";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import type {
  WorkflowResponse,
  WorkflowCreate,
  WorkflowUpdate,
  PaginatedResponse,
} from "@/types";

interface WorkflowStore {
  workflows: WorkflowResponse[];
  currentWorkflow: WorkflowResponse | null;
  loading: boolean;
  error: string | null;

  fetchWorkflows: (domainId?: string) => Promise<void>;
  fetchWorkflow: (id: string) => Promise<void>;
  createWorkflow: (data: WorkflowCreate) => Promise<WorkflowResponse>;
  updateWorkflow: (
    id: string,
    data: WorkflowUpdate
  ) => Promise<WorkflowResponse>;
  deleteWorkflow: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  workflows: [],
  currentWorkflow: null,
  loading: false,
  error: null,

  fetchWorkflows: async (domainId?: string) => {
    set({ loading: true, error: null });
    try {
      const q = domainId
        ? `/workflows?domain_id=${domainId}&per_page=50`
        : "/workflows?per_page=50";
      const res = await apiGet<PaginatedResponse<WorkflowResponse>>(q);
      set({ workflows: res.data, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchWorkflow: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const wf = await apiGet<WorkflowResponse>(`/workflows/${id}`);
      set({ currentWorkflow: wf, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createWorkflow: async (data: WorkflowCreate) => {
    set({ error: null });
    try {
      const wf = await apiPost<WorkflowResponse>("/workflows", data);
      set((state) => ({ workflows: [wf, ...state.workflows] }));
      return wf;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  updateWorkflow: async (id: string, data: WorkflowUpdate) => {
    set({ error: null });
    try {
      const wf = await apiPatch<WorkflowResponse>(`/workflows/${id}`, data);
      set((state) => ({
        currentWorkflow: wf,
        workflows: state.workflows.map((w) => (w.id === id ? wf : w)),
      }));
      return wf;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  deleteWorkflow: async (id: string) => {
    set({ error: null });
    try {
      await apiDelete(`/workflows/${id}`);
      set((state) => ({
        workflows: state.workflows.filter((w) => w.id !== id),
        currentWorkflow:
          state.currentWorkflow?.id === id ? null : state.currentWorkflow,
      }));
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  clearError: () => set({ error: null }),
}));
