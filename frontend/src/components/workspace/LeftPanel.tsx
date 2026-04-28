"use client";

import { Plus, MessageSquare, FolderOpen } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";
import DomainSelector from "./DomainSelector";
import ThreadList from "./ThreadList";
import FileExplorer from "./FileExplorer";

const TABS = [
  { key: "threads" as const, label: "Threads", shortcut: "T", icon: MessageSquare },
  { key: "files" as const, label: "Files", shortcut: "F", icon: FolderOpen },
];

export default function LeftPanel() {
  const { leftTab, setLeftTab, setConfigGateOpen, setActiveThreadId } = useWorkspaceStore();

  function handleNewChat() {
    setActiveThreadId(null);
    setConfigGateOpen(true);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Domain selector */}
      <div className="border-b px-2.5 py-2.5">
        <DomainSelector />
      </div>

      {/* New Chat button */}
      <div className="px-2.5 py-2">
        <button
          onClick={handleNewChat}
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        >
          <Plus className="size-4" />
          New Chat
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex border-b">
        {TABS.map(({ key, label, shortcut, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setLeftTab(key)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors",
              leftTab === key
                ? "border-b-2 border-slate-900 text-slate-900"
                : "text-slate-400 hover:text-slate-600"
            )}
          >
            <Icon className="size-3.5" />
            {label}
            <kbd className="hidden rounded bg-slate-100 px-1 py-0.5 text-[9px] text-slate-400 sm:inline">
              {shortcut}
            </kbd>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {leftTab === "threads" ? <ThreadList /> : <FileExplorer />}
      </div>
    </div>
  );
}
