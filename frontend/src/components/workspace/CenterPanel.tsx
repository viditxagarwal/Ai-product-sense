"use client";

import { MessageCircle } from "lucide-react";

export default function CenterPanel() {
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
            Center Panel: Chat & Execution
          </p>
          <p className="mt-1 text-xs text-slate-300">
            Config bar, instructions, chat messages, execution traces
          </p>
        </div>
      </div>
    </div>
  );
}
