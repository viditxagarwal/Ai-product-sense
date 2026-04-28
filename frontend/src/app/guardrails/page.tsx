"use client";

import { Shield, Building2, ArrowRight, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import GuardrailList from "@/components/guardrails/GuardrailList";
import Link from "next/link";

export default function GuardrailsPage() {
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Guardrail Priorities
        </h1>
        <p className="text-sm text-muted-foreground">
          View platform guardrails and their default priority order. Ordering is
          configured per-run in the Configuration.
        </p>
      </div>

      {/* Section 1: Platform Guardrails */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="size-5 text-slate-500" />
          <h2 className="text-lg font-semibold">Platform Guardrails</h2>
          <Badge variant="secondary" className="text-[10px]">
            12 guardrails
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          These guardrails are provided by the platform and cannot be edited or
          removed. They define the safety and quality baseline for all AI
          outputs.
        </p>
        <GuardrailList />
      </section>

      <hr className="border-slate-200" />

      {/* Section 2: Enterprise Guardrails */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="size-5 text-purple-500" />
          <h2 className="text-lg font-semibold">Enterprise Guardrails</h2>
        </div>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">
              Enterprise guardrails are uploaded as a file in Domain Settings.
              When uploaded, &ldquo;Enterprise Guardrails&rdquo; becomes a 13th
              rankable item in the priority stack.
            </p>
            <Link
              href="/domains"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Go to Domain Settings
              <ArrowRight className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </section>

      {/* Bottom note */}
      <div className="flex items-start gap-2 rounded-md bg-slate-50 p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-slate-400" />
        <p className="text-sm italic text-muted-foreground">
          Priority ordering and trigger behavior (what happens when a guardrail
          fires, retry count, confidence threshold) are configured per-run in
          the Configuration.
        </p>
      </div>
    </div>
  );
}
