"use client";

import { MessageSquare, FolderOpen } from "lucide-react";

export default function LeftPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <MessageSquare className="size-4 text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Threads & Files
        </span>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="text-center">
          <FolderOpen className="mx-auto size-8 text-slate-300" />
          <p className="mt-2 text-sm text-slate-400">
            Left Panel: Threads & Files
          </p>
          <p className="mt-1 text-xs text-slate-300">
            Domain selector, thread list, file explorer
          </p>
        </div>
      </div>
    </div>
  );
}
