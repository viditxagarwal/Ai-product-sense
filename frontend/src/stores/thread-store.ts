import { create } from "zustand";
import { apiGet, apiPost, apiPatch } from "@/lib/api";
import type { Thread, ThreadCreate, ThreadMessage, PaginatedResponse } from "@/types";

interface ThreadStore {
  threads: Thread[];
  totalCount: number;
  loading: boolean;
  activeThread: Thread | null;
  messages: ThreadMessage[];
  messagesLoading: boolean;

  fetchThreads: (domainId: string, page?: number) => Promise<void>;
  fetchThread: (id: string) => Promise<void>;
  createThread: (data: ThreadCreate) => Promise<Thread>;
  archiveThread: (id: string) => Promise<void>;
  fetchMessages: (threadId: string, page?: number) => Promise<void>;
  addLocalMessage: (msg: ThreadMessage) => void;
  clearThread: () => void;
}

export const useThreadStore = create<ThreadStore>((set) => ({
  threads: [],
  totalCount: 0,
  loading: false,
  activeThread: null,
  messages: [],
  messagesLoading: false,

  fetchThreads: async (domainId, page = 1) => {
    set({ loading: true });
    const res = await apiGet<PaginatedResponse<Thread>>(`/threads?domain_id=${domainId}&page=${page}`);
    set({ threads: res.data, totalCount: res.count, loading: false });
  },

  fetchThread: async (id) => {
    const thread = await apiGet<Thread>(`/threads/${id}`);
    set({ activeThread: thread });
  },

  createThread: async (data) => {
    const thread = await apiPost<Thread>("/threads", data);
    set((s) => ({ threads: [thread, ...s.threads], totalCount: s.totalCount + 1 }));
    return thread;
  },

  archiveThread: async (id) => {
    await apiPatch<Thread>(`/threads/${id}/archive`, {});
    set((s) => ({
      threads: s.threads.map((t) => (t.id === id ? { ...t, status: "archived" as const } : t)),
    }));
  },

  fetchMessages: async (threadId, page = 1) => {
    set({ messagesLoading: true });
    const res = await apiGet<PaginatedResponse<ThreadMessage>>(`/threads/${threadId}/messages?page=${page}&per_page=100`);
    set({ messages: res.data, messagesLoading: false });
  },

  addLocalMessage: (msg) => {
    set((s) => ({ messages: [...s.messages, msg] }));
  },

  clearThread: () => set({ activeThread: null, messages: [] }),
}));
