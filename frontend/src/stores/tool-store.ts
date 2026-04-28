import { create } from "zustand";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import type { ToolResponse, PaginatedResponse } from "@/types";

interface ToolStore {
  tools: ToolResponse[];
  loading: boolean;
  seeding: boolean;
  error: string | null;

  fetchTools: () => Promise<void>;
  seedTools: () => Promise<void>;
  toggleTool: (id: string, enabled: boolean) => Promise<void>;
  updateToolConfig: (
    id: string,
    defaultConfig: Record<string, unknown>
  ) => Promise<void>;
  clearError: () => void;
}

export const useToolStore = create<ToolStore>((set, get) => ({
  tools: [],
  loading: false,
  seeding: false,
  error: null,

  fetchTools: async () => {
    set({ loading: true, error: null });
    try {
      const res = await apiGet<PaginatedResponse<ToolResponse>>(
        "/tools?per_page=50"
      );
      set({ tools: res.data, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  seedTools: async () => {
    set({ seeding: true, error: null });
    try {
      await apiPost("/tools/seed");
      await get().fetchTools();
      set({ seeding: false });
    } catch (e) {
      set({ error: (e as Error).message, seeding: false });
    }
  },

  toggleTool: async (id: string, enabled: boolean) => {
    set({ error: null });
    // Optimistic update
    set((state) => ({
      tools: state.tools.map((t) =>
        t.id === id ? { ...t, is_enabled: enabled } : t
      ),
    }));
    try {
      await apiPatch<ToolResponse>(`/tools/${id}`, { is_enabled: enabled });
    } catch (e) {
      // Revert on failure
      set((state) => ({
        tools: state.tools.map((t) =>
          t.id === id ? { ...t, is_enabled: !enabled } : t
        ),
        error: (e as Error).message,
      }));
    }
  },

  updateToolConfig: async (
    id: string,
    defaultConfig: Record<string, unknown>
  ) => {
    set({ error: null });
    try {
      const updated = await apiPatch<ToolResponse>(`/tools/${id}`, {
        default_config: defaultConfig,
      });
      set((state) => ({
        tools: state.tools.map((t) => (t.id === id ? updated : t)),
      }));
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  clearError: () => set({ error: null }),
}));
