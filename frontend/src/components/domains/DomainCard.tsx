"use client";

import Link from "next/link";
import { Globe, Trash2 } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DomainResponse } from "@/types";

const DOMAIN_LABELS: Record<string, string> = {
  financial_valuation: "Financial Valuation",
  coding: "Coding",
  tax: "Tax",
  design: "Design",
  custom: "Custom",
};

interface DomainCardProps {
  domain: DomainResponse;
  onDelete: (id: string) => void;
}

export default function DomainCard({ domain, onDelete }: DomainCardProps) {
  return (
    <Card className="group relative">
      <Link href={`/domains/${domain.id}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex size-8 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                <Globe className="size-4" />
              </div>
              <CardTitle>{domain.display_name}</CardTitle>
            </div>
            <Badge variant="secondary">
              {DOMAIN_LABELS[domain.domain_name] ?? domain.domain_name}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <CardDescription>
            {domain.description || "No description"}
          </CardDescription>
          <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
            <span>Memory: {domain.memory_isolation}</span>
            <span>
              Created {new Date(domain.created_at).toLocaleDateString()}
            </span>
          </div>
        </CardContent>
      </Link>
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-3 top-3 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={(e) => {
          e.preventDefault();
          onDelete(domain.id);
        }}
      >
        <Trash2 className="size-4 text-muted-foreground" />
      </Button>
    </Card>
  );
}
