"use client";

import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { Thread } from "@/types";

interface ThreadItemProps {
  thread: Thread;
  isActive: boolean;
  onClick: () => void;
}

export default function ThreadItem({ thread, isActive, onClick }: ThreadItemProps) {
  const timeAgo = formatDistanceToNow(new Date(thread.created_at), { addSuffix: true });

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-md px-3 py-2.5 text-left transition-colors",
        isActive
          ? "border-l-2 border-l-blue-500 bg-blue-50 pl-2.5"
          : "hover:bg-slate-50"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p
          className={cn(
            "truncate text-sm font-medium",
            isActive ? "text-blue-900" : "text-slate-700"
          )}
        >
          {thread.title}
        </p>
        <span className="shrink-0 text-[10px] text-slate-400">{timeAgo}</span>
      </div>
      {thread.status === "archived" && (
        <span className="mt-0.5 inline-block rounded bg-slate-100 px-1 py-0.5 text-[10px] text-slate-400">
          Archived
        </span>
      )}
    </button>
  );
}
