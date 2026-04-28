"use client";

import { useEffect, useRef } from "react";
import { MessageCircle } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useThreadStore } from "@/stores/thread-store";
import ConfigGate from "./ConfigGate";
import ConfigBar from "./ConfigBar";
import InstructionsBar from "./InstructionsBar";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";

export default function CenterPanel() {
  const { isConfigGateOpen, activeThreadId } = useWorkspaceStore();
  const { activeThread, messages, messagesLoading, fetchThread, fetchMessages } =
    useThreadStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load thread and messages when activeThreadId changes
  useEffect(() => {
    if (activeThreadId) {
      fetchThread(activeThreadId);
      fetchMessages(activeThreadId);
    }
  }, [activeThreadId, fetchThread, fetchMessages]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Show ConfigGate when creating a new thread
  if (isConfigGateOpen && !activeThreadId) {
    return <ConfigGate />;
  }

  // Empty state — no thread selected
  if (!activeThreadId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4">
        <MessageCircle className="size-8 text-slate-300" />
        <p className="mt-2 text-sm text-slate-400">
          Select a thread or start a new chat
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Config Bar */}
      {activeThread?.configuration_id && (
        <ConfigBar configurationId={activeThread.configuration_id} />
      )}

      {/* Instructions Bar */}
      {activeThread?.instructions && (
        <InstructionsBar instructions={activeThread.instructions} />
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        {messagesLoading ? (
          <div className="space-y-3 p-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-12 animate-pulse rounded-lg bg-slate-100 ${
                  i % 2 === 0 ? "ml-auto w-2/3" : "w-3/4"
                }`}
              />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-4">
            <MessageCircle className="size-8 text-slate-200" />
            <p className="mt-2 text-sm text-slate-400">
              No messages yet. Send your first task below.
            </p>
          </div>
        ) : (
          <div className="py-2">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Chat Input */}
      <ChatInput />
    </div>
  );
}
