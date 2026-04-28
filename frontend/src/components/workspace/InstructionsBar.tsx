"use client";

import { useState } from "react";
import { ClipboardCopy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface InstructionsBarProps {
  instructions: string;
}

export default function InstructionsBar({ instructions }: InstructionsBarProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!instructions) return null;

  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    navigator.clipboard.writeText(instructions);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="border-b bg-amber-50/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-left"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600">
          Instructions
        </span>
        <span
          className={cn(
            "flex-1 text-xs text-amber-800",
            !expanded && "truncate"
          )}
        >
          {instructions}
        </span>
        <button
          onClick={handleCopy}
          className="shrink-0 rounded p-0.5 text-amber-400 transition-colors hover:text-amber-600"
        >
          {copied ? (
            <Check className="size-3" />
          ) : (
            <ClipboardCopy className="size-3" />
          )}
        </button>
      </button>
      {expanded && (
        <div className="px-4 pb-2 text-xs text-amber-800 whitespace-pre-wrap">
          {instructions}
        </div>
      )}
    </div>
  );
}
