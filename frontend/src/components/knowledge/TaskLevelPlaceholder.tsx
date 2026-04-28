"use client";

import { Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

export default function TaskLevelPlaceholder() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Upload className="size-5 text-green-500" />
        <h2 className="text-lg font-semibold">Task-Level Files</h2>
        <Badge variant="secondary" className="text-[10px]">
          Layer 3
        </Badge>
        <Badge className="bg-amber-50 text-[10px] text-amber-700 hover:bg-amber-50">
          Phase 2
        </Badge>
      </div>
      <Card className="opacity-60">
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          Task-level files are uploaded when starting a task run. This will be
          available in Phase 2.
        </CardContent>
      </Card>
    </div>
  );
}
