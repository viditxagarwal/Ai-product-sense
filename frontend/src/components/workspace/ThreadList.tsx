"use client";

import { useEffect } from "react";
import { MessageSquare } from "lucide-react";
import { useThreadStore } from "@/stores/thread-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import ThreadItem from "./ThreadItem";

export default function ThreadList() {
  const { threads, loading, fetchThreads } = useThreadStore();
  const { activeDomainId, activeThreadId, setActiveThreadId } = useWorkspaceStore();

  useEffect(() => {
    if (activeDomainId) {
      fetchThreads(activeDomainId);
    }
  }, [activeDomainId, fetchThreads]);

  if (loading) {
    return (
      <div className="space-y-2 p-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 animate-pulse rounded-md bg-slate-100" />
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <MessageSquare className="size-8 text-slate-200" />
        <p className="mt-2 text-sm text-slate-400">No threads yet</p>
        <p className="text-xs text-slate-300">
          Click &quot;+ New Chat&quot; to start
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 overflow-y-auto p-1.5">
      {threads.map((thread) => (
        <ThreadItem
          key={thread.id}
          thread={thread}
          isActive={thread.id === activeThreadId}
          onClick={() => setActiveThreadId(thread.id)}
        />
      ))}
    </div>
  );
}
