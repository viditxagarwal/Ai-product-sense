"use client";

import { useState } from "react";
import ToolCard from "./ToolCard";
import ToolConfigDrawer from "./ToolConfigDrawer";
import { useToolStore } from "@/stores/tool-store";
import type { ToolResponse } from "@/types";

export default function ToolGrid() {
  const { tools, toggleTool, updateToolConfig } = useToolStore();
  const [selectedTool, setSelectedTool] = useState<ToolResponse | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
      />
    </>
  );
}
