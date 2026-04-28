import { create } from "zustand";

type RightPanelTab = "artifacts" | "inspector" | "changes";
type LeftPanelTab = "threads" | "files";

interface WorkspaceStore {
  // Panel visibility
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;

  // Left panel
  leftTab: LeftPanelTab;
  setLeftTab: (tab: LeftPanelTab) => void;
  activeDomainId: string | null;
  setActiveDomainId: (id: string | null) => void;

  // Config gate (new thread creation)
  isConfigGateOpen: boolean;
  setConfigGateOpen: (open: boolean) => void;

  // Active selections
  activeThreadId: string | null;
  setActiveThreadId: (id: string | null) => void;

  activeRightTab: RightPanelTab;
  setActiveRightTab: (tab: RightPanelTab) => void;

  selectedRunId: string | null;
  setSelectedRunId: (id: string | null) => void;

  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;

  selectedStepId: string | null;
  setSelectedStepId: (id: string | null) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set) => ({
  leftPanelOpen: true,
  rightPanelOpen: true,
  toggleLeftPanel: () => set((s) => ({ leftPanelOpen: !s.leftPanelOpen })),
  toggleRightPanel: () => set((s) => ({ rightPanelOpen: !s.rightPanelOpen })),

  leftTab: "threads",
  setLeftTab: (tab) => set({ leftTab: tab }),
  activeDomainId: null,
  setActiveDomainId: (id) => set({ activeDomainId: id }),

  isConfigGateOpen: false,
  setConfigGateOpen: (open) => set({ isConfigGateOpen: open }),

  activeThreadId: null,
  setActiveThreadId: (id) => set({ activeThreadId: id, isConfigGateOpen: false }),

  activeRightTab: "artifacts",
  setActiveRightTab: (tab) => set({ activeRightTab: tab }),

  selectedRunId: null,
  setSelectedRunId: (id) => set({ selectedRunId: id }),

  selectedFileId: null,
  setSelectedFileId: (id) => set({ selectedFileId: id }),

  selectedStepId: null,
  setSelectedStepId: (id) => set({ selectedStepId: id }),
}));
