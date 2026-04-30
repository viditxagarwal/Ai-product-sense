"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Copy, Check, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface RawMessagesViewerProps {
  messages: Array<{ role: string; content: string }>;
}

const roleBadgeClass: Record<string, string> = {
  system: "bg-purple-600 text-white",
  user: "bg-blue-600 text-white",
  assistant: "bg-green-600 text-white",
  tool: "bg-orange-500 text-white",
};

export default function RawMessagesViewer({ messages }: RawMessagesViewerProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(JSON.stringify(messages, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="border border-border rounded-md overflow-hidden text-xs">
      {/* Header row */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/80 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
        <MessageSquare className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="font-medium text-foreground">Raw Messages</span>
        <span className="text-muted-foreground ml-1">({messages.length})</span>
        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={handleCopy}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
              copied
                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                : "bg-background hover:bg-accent text-muted-foreground hover:text-foreground border border-border"
            )}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy JSON</span>
              </>
            )}
          </button>
        </div>
      </button>

      {/* Message list */}
      {open && (
        <div className="divide-y divide-border">
          {messages.length === 0 ? (
            <p className="px-3 py-4 text-center text-muted-foreground">No messages</p>
          ) : (
            messages.map((msg, idx) => {
              const badgeClass =
                roleBadgeClass[msg.role] ?? "bg-gray-500 text-white";
              return (
                <div key={idx} className="px-3 py-2 space-y-1">
                  <span
                    className={cn(
                      "inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide",
                      badgeClass
                    )}
                  >
                    {msg.role}
                  </span>
                  <pre className="whitespace-pre-wrap break-words text-xs text-foreground font-mono leading-relaxed bg-muted/40 rounded px-2 py-1.5">
                    {msg.content}
                  </pre>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
