"use client";

import { useEffect } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ToolGrid from "@/components/tools/ToolGrid";
import { CardGridSkeleton } from "@/components/ui/skeletons";
import { useToolStore } from "@/stores/tool-store";

export default function ToolsPage() {
  const { tools, loading, seeding, error, fetchTools, seedTools, clearError } =
    useToolStore();

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  // Auto-seed if no tools exist after initial fetch
  useEffect(() => {
    if (!loading && tools.length === 0 && !seeding && !error) {
      seedTools();
    }
  }, [loading, tools.length, seeding, error, seedTools]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tool Registry</h1>
          <p className="text-sm text-muted-foreground">
            Enable, disable, and configure default settings for available tools.
          </p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button disabled>
                  <Plus className="mr-1 size-4" />
                  Add Custom Tool
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Coming in v2</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button
            onClick={clearError}
            className="ml-4 font-medium underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {loading || seeding ? (
        <CardGridSkeleton count={9} />
      ) : (
        <ToolGrid />
      )}
    </div>
  );
}
