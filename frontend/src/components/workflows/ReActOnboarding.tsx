"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { X, Box, GitBranch, RefreshCw, Wrench } from "lucide-react";

interface OnboardingStep {
  title: string;
  description: string;
  icon: typeof Box;
  color: string;
}

const STEPS: OnboardingStep[] = [
  {
    title: "Agent Node (LLM ON)",
    description:
      "This is your agent. It has LLM enabled (blue) — it reasons about the task, picks tools, and observes results. Click it to configure the system prompt and bind tools.",
    icon: Box,
    color: "bg-blue-500",
  },
  {
    title: "Loop Edge",
    description:
      "The dashed cyan edge loops the agent back to itself until it produces a final answer or hits the max iteration limit.",
    icon: RefreshCw,
    color: "bg-cyan-500",
  },
  {
    title: "Conditional Edge",
    description:
      "The amber edge to END fires when the agent's answer is complete. Configure the condition in the edge inspector.",
    icon: GitBranch,
    color: "bg-amber-500",
  },
  {
    title: "Tool Bindings",
    description:
      "Click the Agent node, find the Tools section in the inspector, and toggle which tools it can use. That's all you need to configure.",
    icon: Wrench,
    color: "bg-violet-500",
  },
];

interface ReActOnboardingProps {
  onDismiss: () => void;
}

export default function ReActOnboarding({ onDismiss }: ReActOnboardingProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="pointer-events-none absolute inset-0 z-40">
      {/* Backdrop */}
      <div className="pointer-events-auto absolute inset-0 bg-black/20" />

      {/* Tooltip card — anchored bottom-center of canvas */}
      <div className="pointer-events-auto absolute bottom-8 left-1/2 w-[380px] -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-5 shadow-2xl">
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute right-3 top-3 rounded p-0.5 text-slate-400 hover:text-slate-600"
        >
          <X className="size-4" />
        </button>

        {/* Step indicator */}
        <div className="mb-3 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-blue-500" : "bg-slate-200"
              }`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="flex items-start gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${current.color}`}
          >
            <Icon className="size-4.5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800">
              {current.title}
            </h4>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {current.description}
            </p>
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[10px] text-slate-400">
            {step + 1} of {STEPS.length}
          </span>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setStep(step - 1)}
              >
                Back
              </Button>
            )}
            {isLast ? (
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={onDismiss}
              >
                Got it
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-7 text-xs"
                onClick={() => setStep(step + 1)}
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
