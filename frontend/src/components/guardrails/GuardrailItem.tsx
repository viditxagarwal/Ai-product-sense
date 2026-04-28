"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { GuardrailResponse } from "@/types";

interface GuardrailItemProps {
  guardrail: GuardrailResponse;
  rank: number;
}

export default function GuardrailItem({ guardrail, rank }: GuardrailItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: guardrail.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-start gap-4 rounded-lg border bg-white p-4 ${
        isDragging ? "shadow-lg ring-2 ring-blue-200" : ""
      }`}
    >
      <button
        className="mt-0.5 cursor-grab touch-none text-slate-300 hover:text-slate-500 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-5" />
      </button>

      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500">
        {rank}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{guardrail.display_name}</h3>
          {guardrail.is_platform && (
            <Badge
              variant="secondary"
              className="bg-slate-100 text-[10px] text-slate-600"
            >
              <Shield className="mr-0.5 size-3" />
              Platform
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {guardrail.description}
        </p>
        <p className="mt-1.5 text-[11px] text-slate-400">
          <span className="font-medium">Trigger:</span>{" "}
          {guardrail.trigger_description}
        </p>
      </div>
    </div>
  );
}
