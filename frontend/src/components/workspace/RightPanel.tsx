"use client";

import { useEffect, useState } from "react";
import { Eye, Search, GitCompare } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";
import ArtifactViewer from "./ArtifactViewer";
import ExecutionInspector from "./ExecutionInspector";
import ChangesTab from "./ChangesTab";
import type { FileChange } from "@/types";

const TABS = [
  { key: "artifacts" as const, label: "Artifacts", icon: Eye },
  { key: "inspector" as const, label: "Inspector", icon: Search },
  { key: "changes" as const, label: "Changes", icon: GitCompare },
];

export default function RightPanel() {
  const { activeRightTab, setActiveRightTab, selectedFileId } = useWorkspaceStore();
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  // Check for pending changes to show orange dot on Changes tab
  useEffect(() => {
    if (!selectedFileId) {
      setHasPendingChanges(false);
      return;
    }
    apiGet<FileChange[]>(`/files/${selectedFileId}/changes`)
      .then((changes) => {
        setHasPendingChanges(changes.some((c) => c.status === "pending"));
      })
      .catch(() => setHasPendingChanges(false));
  }, [selectedFileId]);

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex border-b">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveRightTab(key)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors",
              activeRightTab === key
                ? "border-b-2 border-slate-900 text-slate-900"
                : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Icon className="size-3.5" />
            {label}
            {/* Orange dot for pending changes */}
            {key === "changes" && hasPendingChanges && (
              <span className="absolute right-2 top-1.5 size-1.5 rounded-full bg-amber-500" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeRightTab === "artifacts" && <ArtifactViewer />}

        {activeRightTab === "inspector" && <ExecutionInspector />}

        {activeRightTab === "changes" && <ChangesTab />}
      </div>
    </div>
  );
}
