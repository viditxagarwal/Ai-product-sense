"use client";

import Link from "next/link";
import { CheckCircle2, Info } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ProviderModels } from "@/hooks/useAvailableModels";

interface ModelSelectProps {
  value: string;
  onValueChange: (v: string) => void;
  providers: ProviderModels[];
  /** Show a "None" option at the top */
  allowNone?: boolean;
  noneLabel?: string;
  placeholder?: string;
  className?: string;
  showTooltip?: boolean;
}

export default function ModelSelect({
  value,
  onValueChange,
  providers,
  allowNone = false,
  noneLabel = "None",
  placeholder,
  className = "h-9 text-xs",
  showTooltip = false,
}: ModelSelectProps) {
  return (
    <div className="flex items-center gap-1.5">
      <Select value={value || (allowNone ? "none" : "")} onValueChange={(v) => onValueChange(v === "none" ? "" : v)}>
        <SelectTrigger className={className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowNone && (
            <SelectItem value="none">{noneLabel}</SelectItem>
          )}
          {providers.map((p) => (
            <SelectGroup key={p.provider}>
              <SelectLabel className="flex items-center gap-1.5 text-xs">
                {p.display_name}
                {p.connected ? (
                  <CheckCircle2 className="size-3 text-green-600" />
                ) : (
                  <span className="text-[10px] text-slate-400">Not connected</span>
                )}
              </SelectLabel>
              {p.connected ? (
                p.models.map((model) => (
                  <SelectItem key={`${p.provider}-${model}`} value={model} className="pl-6 text-xs">
                    {model}
                  </SelectItem>
                ))
              ) : (
                <div className="px-6 py-1.5 text-[11px] text-slate-400">
                  <Link
                    href="/settings/api-keys"
                    className="text-blue-500 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Add API key in Settings →
                  </Link>
                </div>
              )}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
      {showTooltip && (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="size-3.5 shrink-0 text-slate-400" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-[220px] text-xs">
              Only models from providers you&apos;ve connected in Settings are available. Add more providers in Settings → API Keys.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
