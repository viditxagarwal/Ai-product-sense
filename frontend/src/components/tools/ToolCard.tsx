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
  CheckCircle2,
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

// Tools that need no API key
const BUILTIN_TOOLS = new Set([
  "calculator",
  "code_interpreter",
  "document_reader",
  "table_parser",
  "file_writer",
  "summarizer",
  "validator",
  "notification_sender",
]);

// tool_name → required provider(s)
export const TOOL_PROVIDER_MAP: Record<string, string[]> = {
  web_search: ["tavily"],
  financial_data_api: ["alpha_vantage", "polygon"],
  database_query: ["database_pg", "database_mysql"],
};

export interface ApiKeyInfo {
  provider: string;
  is_valid: boolean | null;
  key_hint: string;
  last_tested_at: string | null;
  extra_fields: Record<string, string>;
}

interface ToolCardProps {
  tool: ToolResponse;
  onToggle: (id: string, enabled: boolean) => void;
  onConfigure: (tool: ToolResponse) => void;
  apiKeys: ApiKeyInfo[];
  onRequiresKey?: (tool: ToolResponse) => void;
}

function getConnectionStatus(
  toolName: string,
  apiKeys: ApiKeyInfo[]
): { type: "builtin" | "connected" | "partial" | "not_configured"; label: string; detail?: string } {
  if (BUILTIN_TOOLS.has(toolName)) {
    return { type: "builtin", label: "Built-in" };
  }

  const requiredProviders = TOOL_PROVIDER_MAP[toolName];
  if (!requiredProviders) {
    return { type: "builtin", label: "Built-in" };
  }

  const configuredProviders = requiredProviders.filter((p) =>
    apiKeys.some((k) => k.provider === p)
  );

  if (toolName === "financial_data_api") {
    const parts: string[] = [];
    if (apiKeys.some((k) => k.provider === "alpha_vantage")) parts.push("Alpha Vantage ✓");
    if (apiKeys.some((k) => k.provider === "polygon")) parts.push("Polygon ✓");
    parts.push("Yahoo Finance (free)");
    if (configuredProviders.length > 0) {
      return { type: "connected", label: "Connected", detail: parts.join(", ") };
    }
    return { type: "partial", label: "Yahoo Finance only", detail: parts.join(", ") };
  }

  if (toolName === "database_query") {
    const dbKey = apiKeys.find((k) => k.provider === "database_pg" || k.provider === "database_mysql");
    if (dbKey) {
      const host = dbKey.extra_fields?.host || dbKey.key_hint;
      const type = dbKey.provider === "database_pg" ? "PostgreSQL" : "MySQL";
      return { type: "connected", label: "Connected", detail: `${type} @ ${host || "configured"} ✓` };
    }
    return { type: "not_configured", label: "No database connected" };
  }

  if (configuredProviders.length > 0) {
    return { type: "connected", label: "Connected" };
  }

  return { type: "not_configured", label: "Requires API Key" };
}

const STATUS_STYLES: Record<string, string> = {
  builtin: "bg-slate-100 text-slate-600",
  connected: "bg-green-50 text-green-700",
  partial: "bg-yellow-50 text-yellow-700",
  not_configured: "bg-amber-50 text-amber-700",
};

export default function ToolCard({ tool, onToggle, onConfigure, apiKeys, onRequiresKey }: ToolCardProps) {
  const Icon = TOOL_ICONS[tool.tool_name] || Wrench;
  const status = getConnectionStatus(tool.tool_name, apiKeys);

  const handleToggle = (checked: boolean) => {
    if (checked && status.type === "not_configured" && onRequiresKey) {
      onRequiresKey(tool);
      return;
    }
    onToggle(tool.id, checked);
  };

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
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Badge
                  variant="secondary"
                  className={`text-[10px] ${
                    CATEGORY_COLORS[tool.category] || CATEGORY_COLORS.general
                  }`}
                >
                  {tool.category.replace("_", " ")}
                </Badge>
                <Badge
                  variant="secondary"
                  className={`text-[10px] ${STATUS_STYLES[status.type]}`}
                >
                  {status.type === "connected" && <CheckCircle2 className="mr-0.5 size-2.5" />}
                  {status.label}
                </Badge>
              </div>
            </div>
          </div>
          <Switch
            checked={tool.is_enabled}
            onCheckedChange={handleToggle}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground line-clamp-2">
          {tool.description}
        </p>
        {status.detail && (
          <p className="mt-1 text-[10px] text-slate-400">{status.detail}</p>
        )}
      </CardContent>
    </Card>
  );
}
