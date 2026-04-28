"use client";

import { Database, TrendingUp, BookOpen, FileBarChart } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const PLATFORM_ITEMS = [
  { name: "Financial Data APIs", icon: TrendingUp },
  { name: "Industry Benchmarks", icon: FileBarChart },
  { name: "Regulatory Filings DB", icon: BookOpen },
];

export default function PlatformKnowledge() {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Database className="size-5 text-slate-500" />
        <h2 className="text-lg font-semibold">Platform Knowledge</h2>
        <Badge variant="secondary" className="text-[10px]">
          Layer 1
        </Badge>
        <Badge className="bg-slate-100 text-[10px] text-slate-600 hover:bg-slate-100">
          Managed by Platform
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">
        Platform knowledge connections are managed by the service provider.
        These include financial data connectors, industry benchmarks, and
        regulatory databases.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {PLATFORM_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Card key={item.name} className="opacity-50">
              <CardContent className="flex items-center gap-3 p-4">
                <div className="flex size-9 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
                  <Icon className="size-4" />
                </div>
                <span className="text-sm font-medium text-slate-400">
                  {item.name}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
