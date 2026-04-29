"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Info,
  CheckCircle2,
  XCircle,
  FlaskConical,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import { TOOL_PROVIDER_MAP, type ApiKeyInfo } from "./ToolCard";
import type { ToolResponse } from "@/types";

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

interface ToolConfigDrawerProps {
  tool: ToolResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    id: string,
    defaultConfig: Record<string, unknown>
  ) => Promise<void>;
  apiKeys: ApiKeyInfo[];
}

export default function ToolConfigDrawer({
  tool,
  open,
  onOpenChange,
  onSave,
  apiKeys,
}: ToolConfigDrawerProps) {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (tool) {
      setConfig({ ...tool.default_config });
    }
  }, [tool]);

  if (!tool) return null;

  const schema = tool.config_schema as Record<
    string,
    {
      type: string;
      values?: string[];
      items?: string;
      min?: number;
      max?: number;
      description?: string;
    }
  >;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(tool.id, config);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  // Connection info
  const isBuiltin = BUILTIN_TOOLS.has(tool.tool_name);
  const requiredProviders = TOOL_PROVIDER_MAP[tool.tool_name] || [];
  const connectedKeys = apiKeys.filter((k) => requiredProviders.includes(k.provider));
  const needsConnection = !isBuiltin && requiredProviders.length > 0;

  const handleTest = async (keyId: string) => {
    setTesting(true);
    try {
      const result = await apiPost<{ success: boolean; message: string }>(
        `/settings/api-keys/${keyId}/test`
      );
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch {
      // handled
    } finally {
      setTesting(false);
    }
  };

  const renderField = (key: string, fieldSchema: (typeof schema)[string]) => {
    const value = config[key];

    switch (fieldSchema.type) {
      case "enum":
        return (
          <Select
            value={String(value ?? "")}
            onValueChange={(v) => updateField(key, v)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(fieldSchema.values ?? []).map((v) => (
                <SelectItem key={v} value={v}>
                  {v.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case "integer":
        return (
          <Input
            type="number"
            value={Number(value ?? 0)}
            min={fieldSchema.min}
            max={fieldSchema.max}
            onChange={(e) => updateField(key, parseInt(e.target.value, 10))}
          />
        );

      case "boolean":
        return (
          <Switch
            checked={Boolean(value)}
            onCheckedChange={(checked) => updateField(key, checked)}
          />
        );

      case "array":
        return (
          <Input
            value={Array.isArray(value) ? value.join(", ") : String(value ?? "")}
            onChange={(e) =>
              updateField(
                key,
                e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              )
            }
            placeholder="Comma-separated values"
          />
        );

      default:
        return (
          <Input
            value={String(value ?? "")}
            onChange={(e) => updateField(key, e.target.value)}
          />
        );
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {tool.display_name}
            <Badge
              variant={tool.is_enabled ? "default" : "secondary"}
              className="text-[10px]"
            >
              {tool.is_enabled ? "Enabled" : "Disabled"}
            </Badge>
          </SheetTitle>
          <SheetDescription>{tool.description}</SheetDescription>
        </SheetHeader>

        {/* Connection section */}
        {needsConnection && (
          <div className="mt-4 rounded-lg border p-3 space-y-2">
            <h4 className="text-xs font-semibold text-slate-700">Connection</h4>
            {connectedKeys.length > 0 ? (
              connectedKeys.map((k) => (
                <div key={k.provider} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    {k.is_valid === true ? (
                      <CheckCircle2 className="size-3.5 text-green-600" />
                    ) : k.is_valid === false ? (
                      <XCircle className="size-3.5 text-red-500" />
                    ) : (
                      <div className="size-3.5 rounded-full bg-yellow-400" />
                    )}
                    <span className="capitalize">{k.provider.replace("_", " ")}</span>
                    <span className="text-slate-400">••••{k.key_hint}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-[10px]"
                    onClick={() => handleTest(k.provider)}
                    disabled={testing}
                  >
                    {testing ? (
                      <Loader2 className="mr-1 size-3 animate-spin" />
                    ) : (
                      <FlaskConical className="mr-1 size-3" />
                    )}
                    Test
                  </Button>
                </div>
              ))
            ) : (
              <p className="text-xs text-amber-600">
                No API key configured for this tool.
              </p>
            )}
            {connectedKeys.length > 0 && connectedKeys[0].last_tested_at && (
              <p className="text-[10px] text-slate-400">
                Last tested: {new Date(connectedKeys[0].last_tested_at).toLocaleString()}
              </p>
            )}
            <Link
              href="/settings/api-keys"
              className="inline-flex items-center gap-1 text-[11px] text-blue-500 hover:underline"
            >
              Settings → API Keys <ExternalLink className="size-3" />
            </Link>
          </div>
        )}

        {isBuiltin && (
          <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-3">
            <p className="text-xs text-slate-500">
              Built-in tool — no external API key or connection required.
            </p>
          </div>
        )}

        <div className="mt-6 space-y-5">
          {Object.entries(schema).map(([key, fieldSchema]) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-sm capitalize">
                  {key.replace(/_/g, " ")}
                </Label>
                {fieldSchema.type === "boolean" && renderField(key, fieldSchema)}
              </div>
              {fieldSchema.description && (
                <p className="text-xs text-muted-foreground">
                  {fieldSchema.description}
                </p>
              )}
              {fieldSchema.type !== "boolean" && renderField(key, fieldSchema)}
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-start gap-2 rounded-md bg-slate-50 p-3">
          <Info className="mt-0.5 size-3.5 shrink-0 text-slate-400" />
          <p className="text-xs text-muted-foreground">
            Tool behavior settings (timeout, retry, result handling) are
            configured per-run in the Configuration.
          </p>
        </div>

        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Defaults"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
