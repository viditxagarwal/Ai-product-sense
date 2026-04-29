"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ToolCard from "./ToolCard";
import ToolConfigDrawer from "./ToolConfigDrawer";
import { useToolStore } from "@/stores/tool-store";
import { apiGet } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { TOOL_PROVIDER_MAP, type ApiKeyInfo } from "./ToolCard";
import type { ToolResponse } from "@/types";

const PROVIDER_DISPLAY: Record<string, string> = {
  tavily: "Tavily",
  alpha_vantage: "Alpha Vantage",
  polygon: "Polygon.io",
  database_pg: "PostgreSQL",
  database_mysql: "MySQL",
};

export default function ToolGrid() {
  const { tools, toggleTool, updateToolConfig } = useToolStore();
  const [selectedTool, setSelectedTool] = useState<ToolResponse | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKeyInfo[]>([]);
  const [requiresKeyTool, setRequiresKeyTool] = useState<ToolResponse | null>(null);

  const fetchApiKeys = useCallback(async () => {
    try {
      const data = await apiGet<ApiKeyInfo[]>("/settings/api-keys");
      setApiKeys(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchApiKeys();
  }, [fetchApiKeys]);

  const handleConfigure = (tool: ToolResponse) => {
    setSelectedTool(tool);
    setDrawerOpen(true);
  };

  const handleSave = async (
    id: string,
    defaultConfig: Record<string, unknown>
  ) => {
    await updateToolConfig(id, defaultConfig);
  };

  const requiresKeyMessage = requiresKeyTool
    ? (() => {
        const providers = TOOL_PROVIDER_MAP[requiresKeyTool.tool_name] || [];
        const names = providers.map((p) => PROVIDER_DISPLAY[p] || p).join(" or ");
        return `${requiresKeyTool.display_name} requires a ${names} API key. Add one in Settings → API Keys.`;
      })()
    : "";

  // Group tools by category
  const categories = tools.reduce<Record<string, ToolResponse[]>>(
    (acc, tool) => {
      const cat = tool.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(tool);
      return acc;
    },
    {}
  );

  const categoryOrder = [
    "computation",
    "data_extraction",
    "external_data",
    "text_processing",
    "output",
    "integration",
    "quality",
  ];

  const sortedCategories = categoryOrder.filter((c) => categories[c]);

  return (
    <>
      <div className="space-y-8">
        {sortedCategories.map((category) => (
          <div key={category}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {category.replace(/_/g, " ")}
            </h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categories[category].map((tool) => (
                <ToolCard
                  key={tool.id}
                  tool={tool}
                  onToggle={toggleTool}
                  onConfigure={handleConfigure}
                  apiKeys={apiKeys}
                  onRequiresKey={setRequiresKeyTool}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <ToolConfigDrawer
        tool={selectedTool}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onSave={handleSave}
        apiKeys={apiKeys}
      />

      {/* Requires API Key dialog */}
      <Dialog open={!!requiresKeyTool} onOpenChange={(open) => !open && setRequiresKeyTool(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Required</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">{requiresKeyMessage}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRequiresKeyTool(null)}>
              Cancel
            </Button>
            <Link href="/settings/api-keys">
              <Button onClick={() => setRequiresKeyTool(null)}>Go to Settings</Button>
            </Link>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
