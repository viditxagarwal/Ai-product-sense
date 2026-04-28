"use client";

import { useEffect } from "react";
import { ChevronDown, Globe } from "lucide-react";
import { useDomainStore } from "@/stores/domain-store";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { cn } from "@/lib/utils";

export default function DomainSelector() {
  const { domains, fetchDomains } = useDomainStore();
  const { activeDomainId, setActiveDomainId } = useWorkspaceStore();

  useEffect(() => {
    fetchDomains();
  }, [fetchDomains]);

  // Auto-select first domain
  useEffect(() => {
    if (!activeDomainId && domains.length > 0) {
      setActiveDomainId(domains[0].id);
    }
  }, [domains, activeDomainId, setActiveDomainId]);

  return (
    <div className="relative">
      <select
        value={activeDomainId ?? ""}
        onChange={(e) => setActiveDomainId(e.target.value || null)}
        className={cn(
          "w-full appearance-none rounded-md border border-slate-200 bg-white py-2 pl-8 pr-8",
          "text-sm font-medium text-slate-700",
          "focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-400",
          "cursor-pointer"
        )}
      >
        {domains.map((d) => (
          <option key={d.id} value={d.id}>
            {d.display_name}
          </option>
        ))}
        {domains.length === 0 && (
          <option value="" disabled>
            No domains — create one first
          </option>
        )}
      </select>
      <Globe className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
    </div>
  );
}
