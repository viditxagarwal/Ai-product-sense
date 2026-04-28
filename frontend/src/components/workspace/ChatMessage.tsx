"use client";

import ReactMarkdown from "react-markdown";
import { FileText, FileSpreadsheet, FileCode, File as FileIcon } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";
import ExecutionTraceCard from "./ExecutionTraceCard";
import type { ThreadMessage } from "@/types";

interface ChatMessageProps {
  message: ThreadMessage;
}

const FILE_TYPE_ICONS: Record<string, typeof FileText> = {
  "text/markdown": FileText,
  "text/csv": FileSpreadsheet,
  "application/json": FileCode,
  "text/plain": FileText,
};

export default function ChatMessage({ message }: ChatMessageProps) {
  const { setSelectedFileId, setActiveRightTab } = useWorkspaceStore();

  // System messages
  if (message.role === "system") {
    return (
      <div className="flex justify-center px-4 py-2">
        <span className="text-xs text-slate-400">{message.content}</span>
      </div>
    );
  }

  // Execution trace messages
  if (message.message_type === "execution_trace") {
    return (
      <div className="px-4 py-1">
        <ExecutionTraceCard />
      </div>
    );
  }

  // File attachment messages
  if (message.message_type === "file_attachment") {
    const files = (message.metadata?.files ?? []) as {
      id: string;
      name: string;
      type: string;
    }[];

    return (
      <div className={cn("flex px-4 py-2", message.role === "user" ? "justify-end" : "justify-start")}>
        <div
          className={cn(
            "flex flex-wrap gap-1.5 rounded-lg px-3 py-2",
            message.role === "user" ? "bg-blue-50" : "bg-white border border-slate-200"
          )}
        >
          {files.map((file) => {
            const Icon = FILE_TYPE_ICONS[file.type] || FileIcon;
            return (
              <button
                key={file.id}
                onClick={() => {
                  setSelectedFileId(file.id);
                  setActiveRightTab("artifacts");
                }}
                className="flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-200"
              >
                <Icon className="size-3 text-slate-400" />
                {file.name}
              </button>
            );
          })}
          {message.content && (
            <p className="w-full text-sm text-slate-600">{message.content}</p>
          )}
        </div>
      </div>
    );
  }

  const isUser = message.role === "user";

  return (
    <div className={cn("flex px-4 py-2", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-3 py-2",
          isUser
            ? "bg-blue-600 text-white"
            : "border border-slate-200 bg-white text-slate-800"
        )}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm max-w-none prose-p:my-1 prose-li:my-0 prose-headings:mb-1 prose-headings:mt-2">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
        <span
          className={cn(
            "mt-1 block text-[10px]",
            isUser ? "text-blue-200" : "text-slate-300"
          )}
        >
          {new Date(message.created_at).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}
