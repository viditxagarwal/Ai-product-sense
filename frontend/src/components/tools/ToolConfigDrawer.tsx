"use client";

import { useState, useEffect } from "react";
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
import { Info } from "lucide-react";
import type { ToolResponse } from "@/types";

interface ToolConfigDrawerProps {
  tool: ToolResponse | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (
    id: string,
    defaultConfig: Record<string, unknown>
  ) => Promise<void>;
}

export default function ToolConfigDrawer({
  tool,
  open,
  onOpenChange,
  onSave,
}: ToolConfigDrawerProps) {
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

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
