"use client";

import { useEffect, useState } from "react";
import { FileText, FileSpreadsheet, FileCode, File, FolderOpen } from "lucide-react";
import { apiGet } from "@/lib/api";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";
import type { ThreadFile } from "@/types";

const FILE_ICONS: Record<string, typeof FileText> = {
  "text/markdown": FileText,
  "text/csv": FileSpreadsheet,
  "application/json": FileCode,
  "text/plain": FileText,
};

function getFileIcon(fileType: string) {
  return FILE_ICONS[fileType] || File;
}

export default function FileExplorer() {
  const { activeThreadId, selectedFileId, setSelectedFileId, setActiveRightTab } =
    useWorkspaceStore();
  const [files, setFiles] = useState<ThreadFile[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeThreadId) {
      setFiles([]);
      return;
    }
    setLoading(true);
    apiGet<ThreadFile[]>(`/threads/${activeThreadId}/files`)
      .then(setFiles)
      .catch(() => setFiles([]))
      .finally(() => setLoading(false));
  }, [activeThreadId]);

  function handleFileClick(file: ThreadFile) {
    setSelectedFileId(file.id);
    setActiveRightTab("artifacts");
  }

  if (!activeThreadId) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <FolderOpen className="size-8 text-slate-200" />
        <p className="mt-2 text-sm text-slate-400">Select a thread to view files</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2 p-2">
        {[1, 2].map((i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-slate-100" />
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center">
        <FolderOpen className="size-8 text-slate-200" />
        <p className="mt-2 text-sm text-slate-400">No files yet</p>
        <p className="text-xs text-slate-300">
          Files will appear here as the AI generates them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5 overflow-y-auto p-1.5">
      {files.map((file) => {
        const Icon = getFileIcon(file.file_type);
        const isActive = file.id === selectedFileId;
        return (
          <button
            key={file.id}
            onClick={() => handleFileClick(file)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-colors",
              isActive ? "bg-blue-50" : "hover:bg-slate-50"
            )}
          >
            <Icon className={cn("size-4 shrink-0", isActive ? "text-blue-500" : "text-slate-400")} />
            <span className={cn("flex-1 truncate text-sm", isActive ? "text-blue-900 font-medium" : "text-slate-700")}>
              {file.file_name}
            </span>
            <span
              className={cn(
                "shrink-0 rounded px-1 py-0.5 text-[10px] font-medium",
                file.source === "ai_generated"
                  ? "bg-purple-50 text-purple-600"
                  : "bg-slate-100 text-slate-500"
              )}
            >
              {file.source === "ai_generated" ? "AI" : "Uploaded"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
