"use client";

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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { GUARDRAIL_LABELS } from "./configDefaults";

interface GuardrailReorderProps {
  items: string[];
  onChange: (items: string[]) => void;
  readOnly?: boolean;
}

function SortableItem({
  id,
  rank,
  readOnly,
}: {
  id: string;
  rank: number;
  readOnly?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: readOnly });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-md border bg-white px-3 py-2 ${
        isDragging ? "shadow-md ring-2 ring-blue-200" : ""
      }`}
    >
      {!readOnly && (
        <button
          className="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <span className="flex size-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
        {rank}
      </span>
      <span className="text-xs font-medium">
        {GUARDRAIL_LABELS[id] || id.replace(/_/g, " ")}
      </span>
    </div>
  );
}

export default function GuardrailReorder({
  items,
  onChange,
  readOnly,
}: GuardrailReorderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.indexOf(String(active.id));
    const newIndex = items.indexOf(String(over.id));
    onChange(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items} strategy={verticalListSortingStrategy}>
        <div className="space-y-1">
          {items.map((id, idx) => (
            <SortableItem key={id} id={id} rank={idx + 1} readOnly={readOnly} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
