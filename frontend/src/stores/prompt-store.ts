import { create } from "zustand";
import { apiGet, apiPost } from "@/lib/api";
import type { PromptVersionResponse, PaginatedResponse } from "@/types";

interface PromptStore {
  prompts: PromptVersionResponse[];
  currentPrompt: PromptVersionResponse | null;
  presets: Record<string, string>;
  loading: boolean;
  error: string | null;

  fetchPrompts: () => Promise<void>;
  fetchPrompt: (id: string) => Promise<void>;
  createPrompt: (data: {
    prompt_name: string;
    prompt_text?: string;
    preset_source?: string;
    domain_id?: string;
    tags?: string[];
  }) => Promise<PromptVersionResponse>;
  fetchPresets: () => Promise<void>;
  clearError: () => void;
}

export const usePromptStore = create<PromptStore>((set) => ({
  prompts: [],
  currentPrompt: null,
  presets: {},
  loading: false,
  error: null,

  fetchPrompts: async () => {
    set({ loading: true, error: null });
    try {
      const res = await apiGet<PaginatedResponse<PromptVersionResponse>>(
        "/prompts?per_page=100"
      );
      set({ prompts: res.data, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchPrompt: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const prompt = await apiGet<PromptVersionResponse>(`/prompts/${id}`);
      set({ currentPrompt: prompt, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createPrompt: async (data) => {
    set({ error: null });
    try {
      const prompt = await apiPost<PromptVersionResponse>("/prompts", data);
      set((state) => ({ prompts: [prompt, ...state.prompts] }));
      return prompt;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  fetchPresets: async () => {
    try {
      const presets = await apiGet<Record<string, string>>("/prompts/presets");
      set({ presets });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  clearError: () => set({ error: null }),
}));
