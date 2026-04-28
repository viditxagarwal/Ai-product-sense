"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { ConfigurationResponse } from "@/types";

interface ConfigCompareProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configs: ConfigurationResponse[];
  leftId: string;
  rightId: string;
  onLeftChange: (id: string) => void;
  onRightChange: (id: string) => void;
}

/** Fields to exclude from comparison */
const SKIP_FIELDS = new Set([
  "id",
  "user_id",
  "created_at",
  "created_from",
  "config_version",
]);

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "—";
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "boolean") return val ? "Yes" : "No";
  return String(val);
}

function labelFromKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ConfigCompare({
  open,
  onOpenChange,
  configs,
  leftId,
  rightId,
  onLeftChange,
  onRightChange,
}: ConfigCompareProps) {
  const leftConfig = configs.find((c) => c.id === leftId);
  const rightConfig = configs.find((c) => c.id === rightId);

  const diffs: { key: string; left: string; right: string }[] = [];
  if (leftConfig && rightConfig) {
    const allKeys = new Set([
      ...Object.keys(leftConfig),
      ...Object.keys(rightConfig),
    ]);
    for (const key of Array.from(allKeys).sort()) {
      if (SKIP_FIELDS.has(key)) continue;
      const lv = (leftConfig as unknown as Record<string, unknown>)[key];
      const rv = (rightConfig as unknown as Record<string, unknown>)[key];
      const ls = formatValue(lv);
      const rs = formatValue(rv);
      if (ls !== rs) {
        diffs.push({ key, left: ls, right: rs });
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Compare Configurations</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <Select value={leftId} onValueChange={onLeftChange}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select config" />
            </SelectTrigger>
            <SelectContent>
              {configs.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.config_name} v{c.config_version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-slate-400">vs</span>
          <Select value={rightId} onValueChange={onRightChange}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Select config" />
            </SelectTrigger>
            <SelectContent>
              {configs.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.config_name} v{c.config_version}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {leftId === rightId ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Select two different configurations to compare.
            </p>
          ) : diffs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No differences found.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-3 py-2 font-semibold text-slate-500">
                    Field
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-500">
                    {leftConfig?.config_name}
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-500">
                    {rightConfig?.config_name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((d) => (
                  <tr key={d.key} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-medium text-slate-700">
                      {labelFromKey(d.key)}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="secondary"
                        className="bg-red-50 font-normal text-red-700"
                      >
                        {d.left}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="secondary"
                        className="bg-green-50 font-normal text-green-700"
                      >
                        {d.right}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground">
          Showing {diffs.length} field{diffs.length !== 1 ? "s" : ""} that
          differ. Identical fields are hidden.
        </p>
      </DialogContent>
    </Dialog>
  );
}
