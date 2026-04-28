import { create } from "zustand";
import { apiGet, apiPost } from "@/lib/api";
import type { ConfigurationResponse, PaginatedResponse } from "@/types";

interface ConfigStore {
  configs: ConfigurationResponse[];
  currentConfig: ConfigurationResponse | null;
  loading: boolean;
  error: string | null;

  fetchConfigs: () => Promise<void>;
  fetchConfig: (id: string) => Promise<void>;
  createConfig: (data: Record<string, unknown>) => Promise<ConfigurationResponse>;
  duplicateConfig: (id: string, newName: string) => Promise<ConfigurationResponse>;
  clearError: () => void;
}

export const useConfigStore = create<ConfigStore>((set) => ({
  configs: [],
  currentConfig: null,
  loading: false,
  error: null,

  fetchConfigs: async () => {
    set({ loading: true, error: null });
    try {
      const res = await apiGet<PaginatedResponse<ConfigurationResponse>>(
        "/configurations?per_page=100"
      );
      set({ configs: res.data, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchConfig: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const cfg = await apiGet<ConfigurationResponse>(`/configurations/${id}`);
      set({ currentConfig: cfg, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createConfig: async (data) => {
    set({ error: null });
    try {
      const cfg = await apiPost<ConfigurationResponse>("/configurations", data);
      set((state) => ({ configs: [cfg, ...state.configs] }));
      return cfg;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  duplicateConfig: async (id: string, newName: string) => {
    set({ error: null });
    try {
      const cfg = await apiPost<ConfigurationResponse>(
        `/configurations/${id}/duplicate`,
        { new_name: newName }
      );
      set((state) => ({ configs: [cfg, ...state.configs] }));
      return cfg;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  clearError: () => set({ error: null }),
}));
