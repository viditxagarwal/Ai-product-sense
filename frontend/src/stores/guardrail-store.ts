import { create } from "zustand";
import { apiGet, apiPost } from "@/lib/api";
import type { GuardrailResponse, PaginatedResponse } from "@/types";

interface GuardrailStore {
  guardrails: GuardrailResponse[];
  loading: boolean;
  seeding: boolean;
  error: string | null;

  fetchGuardrails: () => Promise<void>;
  seedGuardrails: () => Promise<void>;
  clearError: () => void;
}

export const useGuardrailStore = create<GuardrailStore>((set, get) => ({
  guardrails: [],
  loading: false,
  seeding: false,
  error: null,

  fetchGuardrails: async () => {
    set({ loading: true, error: null });
    try {
      const res = await apiGet<PaginatedResponse<GuardrailResponse>>(
        "/guardrails?per_page=50"
      );
      set({ guardrails: res.data, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  seedGuardrails: async () => {
    set({ seeding: true, error: null });
    try {
      await apiPost("/guardrails/seed");
      await get().fetchGuardrails();
      set({ seeding: false });
    } catch (e) {
      set({ error: (e as Error).message, seeding: false });
    }
  },

  clearError: () => set({ error: null }),
}));
