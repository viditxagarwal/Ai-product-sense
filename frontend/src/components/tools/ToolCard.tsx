"use client";

import {
  Calculator,
  Code,
  FileText,
  Table,
  Search,
  TrendingUp,
  FileOutput,
  Database,
  AlignLeft,
  Bell,
  CheckCircle,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import type { ToolResponse } from "@/types";

const TOOL_ICONS: Record<string, LucideIcon> = {
  calculator: Calculator,
  code_interpreter: Code,
  document_reader: FileText,
  table_parser: Table,
  web_search: Search,
  financial_data_api: TrendingUp,
  file_writer: FileOutput,
  database_query: Database,
  summarizer: AlignLeft,
  notification_sender: Bell,
  validator: CheckCircle,
};

const CATEGORY_COLORS: Record<string, string> = {
  computation: "bg-blue-50 text-blue-700",
  data_extraction: "bg-purple-50 text-purple-700",
  external_data: "bg-amber-50 text-amber-700",
  output: "bg-green-50 text-green-700",
  text_processing: "bg-cyan-50 text-cyan-700",
  integration: "bg-pink-50 text-pink-700",
  quality: "bg-emerald-50 text-emerald-700",
  general: "bg-slate-50 text-slate-700",
};

interface ToolCardProps {
  tool: ToolResponse;
  onToggle: (id: string, enabled: boolean) => void;
  onConfigure: (tool: ToolResponse) => void;
}

export default function ToolCard({ tool, onToggle, onConfigure }: ToolCardProps) {
  const Icon = TOOL_ICONS[tool.tool_name] || Wrench;

  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-md ${
        !tool.is_enabled ? "opacity-60" : ""
      }`}
      onClick={() => onConfigure(tool)}
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`flex size-9 items-center justify-center rounded-lg ${
                tool.is_enabled
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-400"
              }`}
            >
              <Icon className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold leading-tight">
                {tool.display_name}
              </h3>
              <Badge
                variant="secondary"
                className={`mt-1 text-[10px] ${
                  CATEGORY_COLORS[tool.category] || CATEGORY_COLORS.general
                }`}
              >
                {tool.category.replace("_", " ")}
              </Badge>
            </div>
          </div>
          <Switch
            checked={tool.is_enabled}
            onCheckedChange={(checked) => {
              onToggle(tool.id, checked);
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {tool.description}
        </p>
      </CardContent>
    </Card>
  );
}
