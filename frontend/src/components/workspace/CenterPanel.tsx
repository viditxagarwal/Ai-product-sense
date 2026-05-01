"use client";

import { useEffect, useRef } from "react";
import { MessageCircle, ChevronRight } from "lucide-react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useThreadStore } from "@/stores/thread-store";
import { useExecutionStore } from "@/stores/execution-store";
import { useDomainStore } from "@/stores/domain-store";
import ConfigGate from "./ConfigGate";
import ConfigBar from "./ConfigBar";
import InstructionsBar from "./InstructionsBar";
import ChatMessage from "./ChatMessage";
import ChatInput from "./ChatInput";
import StreamingOverlay from "./StreamingOverlay";
import StreamingChatBubble from "./StreamingChatBubble";
import GateReviewPanel from "./GateReviewPanel";
import LiveToolCards from "./LiveToolCards";
import ActivityLog from "./ActivityLog";

export default function CenterPanel() {
  const { isConfigGateOpen, activeThreadId, activeDomainId } = useWorkspaceStore();
  const { activeThread, messages, messagesLoading, fetchThread, fetchMessages } =
    useThreadStore();
  const { domains } = useDomainStore();
  const { streamingText, displaySettings, fetchDisplaySettings } = useExecutionStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeDomain = domains.find((d) => d.id === activeDomainId);

  // Load thread and messages when activeThreadId changes
  useEffect(() => {
    if (activeThreadId) {
      fetchThread(activeThreadId);
      fetchMessages(activeThreadId);
    }
  }, [activeThreadId, fetchThread, fetchMessages]);

  // Live streaming surfaces also depend on display settings, not just Inspector.
  useEffect(() => {
    if (!displaySettings) {
      fetchDisplaySettings();
    }
  }, [displaySettings, fetchDisplaySettings]);

  // Auto-scroll to bottom on new messages or streaming text
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, streamingText]);

  // Show ConfigGate when creating a new thread
  if (isConfigGateOpen && !activeThreadId) {
    return <ConfigGate />;
  }

  // Empty state — no thread selected
  if (!activeThreadId) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-4">
        <MessageCircle className="size-10 text-slate-200" />
        <p className="mt-3 text-sm font-medium text-slate-400">
          Start your first task
        </p>
        <p className="mt-1 text-xs text-slate-300">
          Click &quot;+ New Chat&quot; to begin working with the AI agent.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 border-b bg-slate-50/50 px-4 py-1.5 text-[10px] text-slate-400">
        <span>Workspace</span>
        <ChevronRight className="size-2.5" />
        <span>{activeDomain?.display_name ?? "Domain"}</span>
        <ChevronRight className="size-2.5" />
        <span className="truncate font-medium text-slate-600">
          {activeThread?.title ?? "Thread"}
        </span>
      </div>

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
            {/* Skeleton chat bubbles */}
            <div className="flex justify-start">
              <div className="h-16 w-3/4 animate-pulse rounded-lg bg-slate-100" />
            </div>
            <div className="flex justify-end">
              <div className="h-10 w-2/3 animate-pulse rounded-lg bg-blue-50" />
            </div>
            <div className="flex justify-start">
              <div className="h-20 w-4/5 animate-pulse rounded-lg bg-slate-100" />
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-4">
            <MessageCircle className="size-8 text-slate-200" />
            <p className="mt-2 text-sm text-slate-400">
              Send a message to start working with the AI agent.
            </p>
            <p className="mt-1 text-xs text-slate-300">
              The AI will execute your workflow and generate artifacts.
            </p>
          </div>
        ) : (
          <div className="py-2">
            {messages.map((msg) => (
              <ChatMessage key={msg.id} message={msg} />
            ))}
            <LiveToolCards />
            <StreamingChatBubble />
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Gate Review Panel — shown when a gate node is waiting */}
      <GateReviewPanel />

      {/* Activity Log — timestamped event feed */}
      <ActivityLog />

      {/* Streaming Overlay — progress bar, counters, checklist */}
      <StreamingOverlay />

      {/* Chat Input — fixed at bottom */}
      <ChatInput />
    </div>
  );
}
