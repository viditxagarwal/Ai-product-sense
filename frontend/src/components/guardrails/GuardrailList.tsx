"use client";

import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Info } from "lucide-react";
import { ListSkeleton } from "@/components/ui/skeletons";
import { useGuardrailStore } from "@/stores/guardrail-store";
import GuardrailItem from "./GuardrailItem";
import type { GuardrailResponse } from "@/types";

export default function GuardrailList() {
  const { guardrails, loading, seeding, error, fetchGuardrails, seedGuardrails } =
    useGuardrailStore();
  const [ordered, setOrdered] = useState<GuardrailResponse[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchGuardrails();
  }, [fetchGuardrails]);

  // Auto-seed if no guardrails exist after initial fetch
  useEffect(() => {
    if (!loading && guardrails.length === 0 && !seeding && !error) {
      seedGuardrails();
    }
  }, [loading, guardrails.length, seeding, error, seedGuardrails]);

  useEffect(() => {
    setOrdered(guardrails);
  }, [guardrails]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrdered((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      return arrayMove(items, oldIndex, newIndex);
    });
  };

  if (loading || seeding) {
    return <ListSkeleton count={6} />;
  }

  const platformGuardrails = ordered.filter((g) => g.is_platform);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md bg-blue-50 p-3">
        <Info className="mt-0.5 size-3.5 shrink-0 text-blue-400" />
        <p className="text-xs text-blue-700">
          Drag to preview priority order. The actual ordering used at runtime is
          saved in the Configuration, not here.
        </p>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={platformGuardrails.map((g) => g.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {platformGuardrails.map((guardrail, idx) => (
              <GuardrailItem
                key={guardrail.id}
                guardrail={guardrail}
                rank={idx + 1}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
