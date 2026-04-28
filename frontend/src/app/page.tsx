"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Globe,
  GitBranch,
  Wrench,
  BookOpen,
  PenTool,
  Shield,
  Settings,
  CheckCircle2,
  Circle,
  ArrowRight,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiGet } from "@/lib/api";
import type { PaginatedResponse } from "@/types";

const TOOLS = [
  {
    href: "/domains",
    label: "Domains",
    icon: Globe,
    description:
      "Configure domain namespaces for memory isolation, base prompts, and enterprise settings.",
  },
  {
    href: "/workflows",
    label: "Workflows",
    icon: GitBranch,
    description:
      "Design multi-step agent workflows on a visual canvas with nodes, edges, and tool bindings.",
  },
  {
    href: "/tools",
    label: "Tool Registry",
    icon: Wrench,
    description:
      "Browse and manage the global tool registry. Enable, disable, and configure tool defaults.",
  },
  {
    href: "/knowledge",
    label: "Knowledge Base",
    icon: BookOpen,
    description:
      "Upload and manage enterprise documents for retrieval-augmented generation.",
  },
  {
    href: "/prompts",
    label: "Prompt Lab",
    icon: PenTool,
    description:
      "Write, version, and compare system prompts. Start from presets or create from scratch.",
  },
  {
    href: "/guardrails",
    label: "Guardrails",
    icon: Shield,
    description:
      "Prioritize and configure safety guardrails — from accuracy to cost controls.",
  },
  {
    href: "/configurations",
    label: "Configurations",
    icon: Settings,
    description:
      "Create immutable configuration snapshots that bundle all behavioral settings for a task run.",
  },
];

const QUICK_START_STEPS = [
  { key: "domains", label: "Create a Domain", href: "/domains", icon: Globe },
  { key: "tools", label: "Set Up Tools", href: "/tools", icon: Wrench },
  { key: "workflows", label: "Create a Workflow", href: "/workflows", icon: GitBranch },
  { key: "prompts", label: "Write a Prompt", href: "/prompts", icon: PenTool },
  { key: "guardrails", label: "Review Guardrails", href: "/guardrails", icon: Shield },
  { key: "configurations", label: "Create a Configuration", href: "/configurations", icon: Settings },
];

export default function DashboardPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function load() {
      const endpoints = [
        { key: "domains", path: "/domains?per_page=1" },
        { key: "tools", path: "/tools?per_page=1" },
        { key: "workflows", path: "/workflows?per_page=1" },
        { key: "prompts", path: "/prompts?per_page=1" },
        { key: "guardrails", path: "/guardrails?per_page=1" },
        { key: "configurations", path: "/configurations?per_page=1" },
      ];

      const results: Record<string, number> = {};
      await Promise.allSettled(
        endpoints.map(async ({ key, path }) => {
          try {
            const res = await apiGet<PaginatedResponse<unknown>>(path);
            results[key] = res.count;
          } catch {
            results[key] = 0;
          }
        })
      );
      setCounts(results);
      setLoaded(true);
    }
    load();
  }, []);

  const completedSteps = QUICK_START_STEPS.filter(
    (s) => (counts[s.key] ?? 0) > 0
  ).length;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          AI Product Studio
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Configure and test agentic AI systems. Follow the quick start guide or
          jump to any module.
        </p>
      </div>

      {/* Quick Start */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Quick Start</CardTitle>
              <CardDescription>
                Set up your AI system in 6 steps
              </CardDescription>
            </div>
            {loaded && (
              <Badge
                variant="secondary"
                className={
                  completedSteps === 6
                    ? "bg-green-50 text-green-700"
                    : "bg-slate-100"
                }
              >
                {completedSteps}/6 complete
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {QUICK_START_STEPS.map((step, i) => {
              const done = (counts[step.key] ?? 0) > 0;
              return (
                <Link key={step.key} href={step.href} className="group">
                  <div
                    className={`flex items-center gap-3 rounded-lg border p-3 transition-all hover:shadow-sm ${
                      done
                        ? "border-green-200 bg-green-50/50"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="size-5 shrink-0 text-green-500" />
                    ) : (
                      <Circle className="size-5 shrink-0 text-slate-300" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-slate-400">
                          Step {i + 1}
                        </span>
                      </div>
                      <p
                        className={`text-sm font-medium ${
                          done ? "text-green-700" : "text-slate-700"
                        }`}
                      >
                        {step.label}
                      </p>
                    </div>
                    <ArrowRight className="size-4 text-slate-300 transition-colors group-hover:text-slate-500" />
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Module cards */}
      <div>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          All Modules
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOOLS.map(({ href, label, icon: Icon, description }) => (
            <Link key={href} href={href} className="group">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-8 items-center justify-center rounded-md bg-slate-100 text-slate-600 transition-colors group-hover:bg-slate-900 group-hover:text-white">
                      <Icon className="size-4" />
                    </div>
                    <CardTitle>{label}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
