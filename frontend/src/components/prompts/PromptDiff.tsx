"use client";

import { useMemo } from "react";
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
import type { PromptVersionResponse } from "@/types";

interface PromptDiffProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: PromptVersionResponse[];
  leftId: string;
  rightId: string;
  onLeftChange: (id: string) => void;
  onRightChange: (id: string) => void;
}

interface DiffLine {
  type: "same" | "add" | "remove";
  text: string;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    Array(n + 1).fill(0)
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  const stack: DiffLine[] = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: "same", text: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: "add", text: newLines[j - 1] });
      j--;
    } else {
      stack.push({ type: "remove", text: oldLines[i - 1] });
      i--;
    }
  }

  while (stack.length) {
    result.push(stack.pop()!);
  }

  return result;
}

export default function PromptDiff({
  open,
  onOpenChange,
  versions,
  leftId,
  rightId,
  onLeftChange,
  onRightChange,
}: PromptDiffProps) {
  const leftVersion = versions.find((v) => v.id === leftId);
  const rightVersion = versions.find((v) => v.id === rightId);

  const diffLines = useMemo(() => {
    if (!leftVersion || !rightVersion) return [];
    return computeDiff(leftVersion.prompt_text, rightVersion.prompt_text);
  }, [leftVersion, rightVersion]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Compare Versions</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-red-50 text-red-700">
              Old
            </Badge>
            <Select value={leftId} onValueChange={onLeftChange}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    v{v.version_number} —{" "}
                    {new Date(v.created_at).toLocaleDateString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-green-50 text-green-700">
              New
            </Badge>
            <Select value={rightId} onValueChange={onRightChange}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {versions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    v{v.version_number} —{" "}
                    {new Date(v.created_at).toLocaleDateString()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto rounded-md border bg-white">
          {diffLines.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {leftId === rightId
                ? "Select two different versions to compare."
                : "No differences found."}
            </p>
          ) : (
            <pre className="p-4 font-mono text-xs leading-6">
              {diffLines.map((line, idx) => (
                <div
                  key={idx}
                  className={
                    line.type === "add"
                      ? "bg-green-50 text-green-800"
                      : line.type === "remove"
                        ? "bg-red-50 text-red-800"
                        : "text-slate-600"
                  }
                >
                  <span className="mr-3 inline-block w-4 select-none text-right text-slate-400">
                    {line.type === "add" ? "+" : line.type === "remove" ? "−" : " "}
                  </span>
                  {line.text}
                </div>
              ))}
            </pre>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
