"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ConfigSectionProps {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export default function ConfigSection({
  title,
  description,
  defaultOpen = true,
  children,
}: ConfigSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-lg border border-slate-200">
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        onClick={() => setOpen(!open)}
      >
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        {open ? (
          <ChevronDown className="size-4 text-slate-400" />
        ) : (
          <ChevronRight className="size-4 text-slate-400" />
        )}
      </button>
      {open && (
        <div className="border-t border-slate-200 px-5 py-4">{children}</div>
      )}
    </div>
  );
}
