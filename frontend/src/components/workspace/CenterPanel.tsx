"use client";

import { MessageCircle } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import ConfigGate from "./ConfigGate";

export default function CenterPanel() {
  const { isConfigGateOpen, activeThreadId } = useWorkspaceStore();

  // Show ConfigGate when creating a new thread
  if (isConfigGateOpen && !activeThreadId) {
    return <ConfigGate />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <MessageCircle className="size-4 text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Chat & Execution
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="text-center">
          <MessageCircle className="mx-auto size-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">
            {activeThreadId
              ? "Chat view coming soon"
              : "Select a thread or start a new chat"}
          </p>
        </div>
      </div>
    </div>
  );
}
