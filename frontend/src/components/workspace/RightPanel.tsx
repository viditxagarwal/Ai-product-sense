"use client";

import { FileText, Activity, GitCompare } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "artifacts" as const, label: "Artifacts", icon: FileText },
  { key: "inspector" as const, label: "Inspector", icon: Activity },
  { key: "changes" as const, label: "Changes", icon: GitCompare },
];

export default function RightPanel() {
  const { activeRightTab, setActiveRightTab } = useWorkspaceStore();

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex border-b">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveRightTab(key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 px-2 py-2 text-xs font-medium transition-colors",
              activeRightTab === key
                ? "border-b-2 border-slate-900 text-slate-900"
                : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="text-center">
          {TABS.filter((t) => t.key === activeRightTab).map(({ key, label, icon: Icon }) => (
            <div key={key}>
              <Icon className="mx-auto size-8 text-slate-300" />
              <p className="mt-2 text-sm text-slate-400">{label}</p>
              <p className="mt-1 text-xs text-slate-300">
                {key === "artifacts" && "File viewer for generated artifacts"}
                {key === "inspector" && "Execution timeline and step details"}
                {key === "changes" && "Targeted diff review for modifications"}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
