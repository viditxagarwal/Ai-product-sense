"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GitCompare } from "lucide-react";
import type { PromptVersionResponse } from "@/types";

interface VersionHistoryProps {
  versions: PromptVersionResponse[];
  currentId: string;
  onCompare: (versionId: string) => void;
}

export default function VersionHistory({
  versions,
  currentId,
  onCompare,
}: VersionHistoryProps) {
  const router = useRouter();

  if (versions.length === 0) {
    return (
      <div className="py-4 text-center text-xs text-muted-foreground">
        No other versions
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Version History</h3>
      <div className="space-y-1">
        {versions.map((v) => {
          const isCurrent = v.id === currentId;
          return (
            <div
              key={v.id}
              className={`flex items-center justify-between rounded-md px-3 py-2 text-xs transition-colors ${
                isCurrent
                  ? "bg-blue-50 text-blue-700"
                  : "cursor-pointer hover:bg-slate-50"
              }`}
              onClick={() => {
                if (!isCurrent) router.push(`/prompts/${v.id}`);
              }}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">v{v.version_number}</span>
                {isCurrent && (
                  <Badge className="bg-blue-100 px-1.5 text-[9px] text-blue-700 hover:bg-blue-100">
                    Current
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">
                  {new Date(v.created_at).toLocaleDateString()}
                </span>
                {!isCurrent && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-6 p-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCompare(v.id);
                    }}
                    title="Compare with current"
                  >
                    <GitCompare className="size-3" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
