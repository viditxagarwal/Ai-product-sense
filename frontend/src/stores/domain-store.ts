import { create } from "zustand";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";
import type {
  DomainResponse,
  DomainCreate,
  DomainUpdate,
  PaginatedResponse,
} from "@/types";

interface DomainStore {
  domains: DomainResponse[];
  currentDomain: DomainResponse | null;
  totalCount: number;
  page: number;
  loading: boolean;
  error: string | null;

  fetchDomains: (page?: number) => Promise<void>;
  fetchDomain: (id: string) => Promise<void>;
  createDomain: (data: DomainCreate) => Promise<DomainResponse>;
  updateDomain: (id: string, data: DomainUpdate) => Promise<DomainResponse>;
  deleteDomain: (id: string) => Promise<void>;
  clearError: () => void;
}

export const useDomainStore = create<DomainStore>((set) => ({
  domains: [],
  currentDomain: null,
  totalCount: 0,
  page: 1,
  loading: false,
  error: null,

  fetchDomains: async (page = 1) => {
    set({ loading: true, error: null });
    try {
      const res = await apiGet<PaginatedResponse<DomainResponse>>(
        `/domains?page=${page}&per_page=20`
      );
      set({ domains: res.data, totalCount: res.count, page, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  fetchDomain: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const domain = await apiGet<DomainResponse>(`/domains/${id}`);
      set({ currentDomain: domain, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createDomain: async (data: DomainCreate) => {
    set({ error: null });
    try {
      const domain = await apiPost<DomainResponse>("/domains", data);
      set((state) => ({ domains: [domain, ...state.domains] }));
      return domain;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  updateDomain: async (id: string, data: DomainUpdate) => {
    set({ error: null });
    try {
      const domain = await apiPatch<DomainResponse>(`/domains/${id}`, data);
      set((state) => ({
        currentDomain: domain,
        domains: state.domains.map((d) => (d.id === id ? domain : d)),
      }));
      return domain;
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  deleteDomain: async (id: string) => {
    set({ error: null });
    try {
      await apiDelete(`/domains/${id}`);
      set((state) => ({
        domains: state.domains.filter((d) => d.id !== id),
        currentDomain:
          state.currentDomain?.id === id ? null : state.currentDomain,
      }));
    } catch (e) {
      set({ error: (e as Error).message });
      throw e;
    }
  },

  clearError: () => set({ error: null }),
}));
